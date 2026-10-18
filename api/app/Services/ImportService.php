<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Imports\{SheetReader, StudentRowImporter};
use App\Jobs\RunImportJob;
use App\Models\{AuditLog, Attendance, Enrollment, FeePayment, ImportJob, ImportRow, ParentStudent, Result, Student, User};
use App\Support\{StudentFiles, TenantBulk};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};

// docs/modules/data-migration.md: upload -> map -> dry-run (mandatory, writes nothing but the report) -> run (chunks of 500, a bad
// row never stops the others) -> rollback within 7 days. R1 ships kind=students only (config release.import_kinds).
class ImportService
{
    public const MAX_ROWS = 20000;
    private const CHUNK = 500;

    public function upload(string $kind, UploadedFile $file, int $by): ImportJob
    {
        if (!in_array($kind, config('release.import_kinds', []), true)) throw new BusinessException('kind', 'kind_not_available', 422);
        $ext = in_array($file->extension(), ['csv', 'txt'], true) ? 'csv' : 'xlsx';
        $sheet = SheetReader::read($file->getRealPath(), $ext);                      // refuses non-UTF-8 before anything is stored
        if (!$sheet['rows']) throw new BusinessException('empty', 'import_no_rows', 422);
        if (count($sheet['rows']) > self::MAX_ROWS) throw new BusinessException('too large', 'import_too_large', 422, ['max' => self::MAX_ROWS]);

        return DB::transaction(function () use ($kind, $file, $ext, $sheet, $by) {
            $job = ImportJob::create(['kind' => $kind, 'status' => 'uploaded', 'file_path' => 'pending', 'created_by' => $by,
                'summary' => ['headers' => $sheet['headers'], 'total' => count($sheet['rows'])],
                'mapping' => $this->guessMapping($sheet['headers'])]);
            $path = $file->storeAs("institutions/{$job->institution_id}/imports", "{$job->id}.{$ext}", 'private');
            $job->update(['file_path' => $path]);
            AuditLog::record('import.uploaded', $job, ['kind' => $kind, 'rows' => count($sheet['rows'])]);
            return $job;
        });
    }

    /** $mapping: target field => source header */
    public function map(ImportJob $job, array $mapping): ImportJob
    {
        $this->expect($job, ['uploaded', 'mapped', 'dry_run']);
        $headers = $job->summary['headers'] ?? [];
        $mapping = array_filter(array_intersect_key($mapping, array_flip(StudentRowImporter::FIELDS)), fn ($h) => in_array($h, $headers, true));
        $missing = array_values(array_diff(StudentRowImporter::REQUIRED, array_keys($mapping)));
        if ($missing) throw new BusinessException('mapping', 'import_mapping_missing', 422, ['fields' => implode(', ', $missing)]);
        $job->update(['mapping' => $mapping, 'status' => 'mapped']);
        ImportRow::where('job_id', $job->id)->delete();                               // an old dry-run report no longer applies
        return $job->fresh();
    }

    /** Checks every row and stores the report in import_rows; writes no student, user or enrollment */
    public function dryRun(ImportJob $job): ImportJob
    {
        $this->expect($job, ['mapped', 'dry_run']);
        $importer = app(StudentRowImporter::class);
        $rows = [];
        foreach ($this->mappedRows($job) as $no => $data) {
            $r = $importer->check($data + ['_row' => $no]);
            unset($r['data']['_row'], $r['data']['_batch_ids']);
            $rows[] = ['institution_id' => $job->institution_id, 'job_id' => $job->id, 'row_no' => $no, 'status' => $r['status'], 'error' => $r['error'], 'data' => json_encode($r['data'], JSON_UNESCAPED_UNICODE)];
        }
        DB::transaction(function () use ($job, $rows) {
            ImportRow::where('job_id', $job->id)->delete();
            foreach (array_chunk($rows, self::CHUNK) as $chunk) TenantBulk::insert(ImportRow::class, $chunk);
            $job->update(['status' => 'dry_run', 'summary' => $this->summary($job, 'dry_run')]);
        });
        return $job->fresh();
    }

    /** Starts the run as a tenant-bound job. One chunk (<= 500 rows, the usual class list) runs right away in the request;
     *  a bigger file goes to the queue and the page follows its status. */
    public function startRun(ImportJob $job): ImportJob
    {
        $this->expect($job, ['dry_run']);
        $job->update(['status' => 'running']);
        ($job->summary['total'] ?? PHP_INT_MAX) <= self::CHUNK
            ? RunImportJob::dispatchSync($job->id, $job->institution_id)
            : RunImportJob::dispatch($job->id, $job->institution_id);
        return $job->fresh();
    }

    /** The run itself (RunImportJob): every row is checked again, each chunk of 500 is one transaction, a failing row is recorded */
    public function run(ImportJob $job): void
    {
        $importer = app(StudentRowImporter::class);
        foreach (array_chunk($this->mappedRows($job), self::CHUNK, true) as $chunk) {
            DB::transaction(function () use ($job, $chunk, $importer) {
                foreach ($chunk as $no => $data) {
                    $r = $importer->check($data + ['_row' => $no]);
                    $created = null;
                    if ($r['status'] === 'ok') {
                        try {
                            $created = DB::transaction(fn () => $importer->create($r['data']));        // a savepoint: one bad row rolls back alone
                        } catch (\Throwable $e) {
                            $r = ['status' => 'error', 'error' => mb_substr($e instanceof \Illuminate\Validation\ValidationException ? $e->validator->errors()->first() : $e->getMessage(), 0, 255)];
                        }
                    }
                    $clean = $data; unset($clean['_row']);
                    ImportRow::updateOrCreate(['job_id' => $job->id, 'row_no' => $no], ['status' => $r['status'], 'error' => $r['error'] ?? null,
                        'data' => $clean, 'created_table' => $created ? 'students' : null, 'created_id' => $created]);
                }
            });
        }
        $job->update(['status' => 'done', 'finished_at' => now(), 'summary' => $this->summary($job, 'run')]);
        AuditLog::record('import.run', $job, ['created' => $job->summary['ok'] ?? 0]);
    }

    /** Removes what the run created - except students that have fees, attendance or results since (listed, never forced) */
    public function rollback(ImportJob $job): ImportJob
    {
        $this->expect($job, ['done']);
        if ($job->finished_at?->lt(now()->subDays(7))) throw new BusinessException('expired', 'import_rollback_expired', 422);
        $kept = [];
        DB::transaction(function () use ($job, &$kept) {
            foreach (ImportRow::where('job_id', $job->id)->where('created_table', 'students')->whereNotNull('created_id')->get() as $row) {
                $student = Student::withTrashed()->find($row->created_id);
                if (!$student) continue;
                if (FeePayment::where('student_id', $student->id)->exists() || Attendance::where('student_id', $student->id)->exists()
                    || Result::where('student_id', $student->id)->exists()) {
                    $kept[] = $row->row_no;
                    $row->update(['error' => __('errors.import_has_dependents')]);
                    continue;
                }
                Enrollment::where('student_id', $student->id)->delete();
                ParentStudent::where('student_id', $student->id)->delete();
                StudentFiles::deleteAll($student);
                $userId = $student->user_id;
                $student->forceDelete();
                if ($userId) User::whereKey($userId)->delete();
                $row->update(['created_id' => null, 'created_table' => null]);
            }
            $job->update(['status' => 'rolled_back', 'summary' => ($job->summary ?? []) + ['rollback_kept' => $kept]]);
        });
        AuditLog::record('import.rolled_back', $job, ['kept' => count($kept)]);
        return $job->fresh();
    }

    /** row_no => [target field => value] using the job's mapping */
    private function mappedRows(ImportJob $job): array
    {
        $local = tempnam(sys_get_temp_dir(), 'imp');
        try {
            file_put_contents($local, Storage::disk('private')->get($job->file_path));
            $sheet = SheetReader::read($local, pathinfo($job->file_path, PATHINFO_EXTENSION));
        } finally {
            @unlink($local);
        }
        return array_map(fn ($row) => array_map(fn ($header) => $row[$header] ?? '', $job->mapping ?? []), $sheet['rows']);
    }

    private function summary(ImportJob $job, string $phase): array
    {
        $counts = ImportRow::where('job_id', $job->id)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        return array_merge($job->summary ?? [], ['phase' => $phase, 'ok' => (int) ($counts['ok'] ?? 0), 'error' => (int) ($counts['error'] ?? 0),
            'skipped' => (int) ($counts['skipped'] ?? 0)]);
    }

    private function guessMapping(array $headers): array
    {
        $norm = fn ($s) => preg_replace('/[^a-z_]/', '', str_replace([' ', '-'], '_', mb_strtolower($s)));
        $alias = ['batch_id' => 'batch', 'section' => 'batch', 'phone' => 'guardian_phone', 'mobile' => 'guardian_phone', 'dob' => 'date_of_birth', 'roll' => 'roll_no'];
        $map = [];
        foreach ($headers as $h) {
            $k = $norm($h);
            $field = in_array($k, StudentRowImporter::FIELDS, true) ? $k : ($alias[$k] ?? null);
            if ($field && !isset($map[$field])) $map[$field] = $h;
        }
        return $map;
    }

    private function expect(ImportJob $job, array $states): void
    {
        if (!in_array($job->status, $states, true)) throw new BusinessException('state', 'import_wrong_state', 422);
    }
}
