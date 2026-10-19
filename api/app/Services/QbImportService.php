<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Jobs\ParseQbImportBatch;
use App\Jobs\ParseQbImportChunk;
use App\Models\QbImportBatch;
use App\Models\QbImportRecord;
use App\Models\QbQuestion;
use App\Models\User;
use App\Support\Toon\ToonDecoder;
use App\Support\Toon\ToonException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// D123 (R2.1.3): a JSON/TOON question import. The upload is stored and staged as a batch; queued chunks of 500 records
// decode, normalize and stage each record by its position (so a re-run never doubles one); counters say exactly how many are
// valid, invalid and possible duplicates. Nothing enters the question bank here - that is the reviewer's "import selected".
class QbImportService
{
    public const SCHEMA_V5 = 'exam-management.universal-content-json.v5';

    public function __construct(private QbImportNormalizer $normalizer) {}

    /**
     * @param list<array{name:string, bytes:string}> $files pasted text arrives as one file named "pasted.json" / "pasted.toon"
     */
    public function create(User $user, array $files, ?string $format = null): array
    {
        if ($files === []) throw new BusinessException('nothing to import', 'qb_import_empty', 422);
        $max = (int) config('qb_import.max_files');
        if (count($files) > $max) throw new BusinessException("at most {$max} files", 'qb_import_too_many_files', 422, ['max' => $max]);
        $format ??= $this->format($files[0]['name'], $files[0]['bytes']);
        $list = array_map(fn ($f) => ['name' => mb_substr($f['name'], 0, 200), 'sha256' => hash('sha256', $f['bytes']), 'bytes' => strlen($f['bytes'])], $files);
        $source = hash('sha256', $format . '|' . implode('|', array_column($list, 'sha256')));

        $existing = QbImportBatch::where('created_by', $user->id)->where('source_sha256', $source)->where('status', '!=', 'failed')->latest('id')->first();
        if ($existing) return [$existing, false];                       // the same upload again: the batch already made from it

        $batch = QbImportBatch::create(['uuid' => (string) Str::uuid(), 'format' => $format, 'files' => $list, 'source_sha256' => $source,
            'status' => 'parsing', 'created_by' => $user->id]);
        foreach ($files as $i => $f) Storage::disk('private')->put($this->path($batch, $i), $f['bytes']);
        ParseQbImportBatch::dispatch($batch->id);
        return [$batch->fresh(), true];
    }

    /** the first job: read every file once, check the totals, then queue the chunks */
    public function plan(QbImportBatch $batch): void
    {
        $total = 0;
        $version = null;
        $chunks = [];
        try {
            foreach ($batch->files as $i => $f) {
                [$records, $document, $v] = $this->read($batch, $i);
                $version ??= $v;
                $total += count($records);
                for ($o = 0; $o < count($records); $o += (int) config('qb_import.chunk')) $chunks[] = [$i, $o];
            }
            if ($total === 0) throw new BusinessException('no questions in the file', 'qb_import_empty', 422);
            if ($total > (int) config('qb_import.max_records')) throw new BusinessException('more than ' . config('qb_import.max_records') . ' questions in one import', 'qb_import_too_many', 422);
        } catch (BusinessException|ToonException|\JsonException $e) {
            $batch->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500)]);
            return;
        }
        $batch->update(['total_records' => $total, 'schema_version' => $version]);
        foreach ($chunks as [$file, $offset]) ParseQbImportChunk::dispatch($batch->id, $file, $offset);
    }

    /** one chunk: normalize and stage records [offset, offset+chunk) of a file; a record already staged is left as it is */
    public function parseChunk(QbImportBatch $batch, int $fileIndex, int $offset): void
    {
        [$records, $document] = $this->read($batch, $fileIndex);
        $slice = array_slice($records, $offset, (int) config('qb_import.chunk'), true);
        $have = QbImportRecord::where('qb_import_batch_id', $batch->id)->where('file_index', $fileIndex)
            ->whereBetween('record_index', [$offset, $offset + count($slice) - 1])->pluck('record_index')->flip();
        $rows = [];
        foreach ($slice as $index => $raw) {
            if ($have->has($index)) continue;
            $n = is_array($raw) ? $this->normalizer->normalize($raw, $document)
                : ['payload' => [], 'errors' => [['path' => '', 'message' => 'a question must be an object']], 'warnings' => [], 'type_slug' => null, 'has_math' => false];
            $rows[$index] = $n;
        }
        $dupes = $this->duplicates($rows);
        DB::transaction(function () use ($batch, $fileIndex, $rows, $dupes) {
            foreach ($rows as $index => $n) {
                QbImportRecord::firstOrCreate(['qb_import_batch_id' => $batch->id, 'file_index' => $fileIndex, 'record_index' => $index], [
                    'type_slug' => $n['type_slug'], 'payload' => $n['payload'], 'errors' => $n['errors'] ?: null, 'warnings' => $n['warnings'] ?: null,
                    'has_math' => $n['has_math'], 'duplicate_status' => isset($dupes[$index]) ? 'possible' : 'none', 'duplicate_question_id' => $dupes[$index] ?? null]);
            }
        });
        $this->recount($batch);
    }

    /** a batch whose chunks did not all finish (a worker died) queues the missing ones again */
    public function resume(QbImportBatch $batch): void
    {
        if ($batch->status === 'failed' || $batch->total_records === 0) { $batch->update(['status' => 'parsing', 'error' => null]); ParseQbImportBatch::dispatch($batch->id); return; }
        if ($batch->status !== 'parsing') return;
        $chunk = (int) config('qb_import.chunk');
        foreach ($batch->files as $i => $f) {
            [$records] = $this->read($batch, $i);
            for ($o = 0; $o < count($records); $o += $chunk) {
                $want = min($chunk, count($records) - $o);
                $got = QbImportRecord::where('qb_import_batch_id', $batch->id)->where('file_index', $i)->whereBetween('record_index', [$o, $o + $want - 1])->count();
                if ($got < $want) ParseQbImportChunk::dispatch($batch->id, $i, $o);
            }
        }
    }

    /** exact counters from the staged rows; the batch is ready when every record is staged */
    public function recount(QbImportBatch $batch): void
    {
        DB::transaction(function () use ($batch) {                      // chunks finish in parallel: one recount at a time
            $batch = QbImportBatch::lockForUpdate()->findOrFail($batch->id);
            $this->count($batch);
        });
        $batch->refresh();
    }

    private function count(QbImportBatch $batch): void
    {
        $q = QbImportRecord::where('qb_import_batch_id', $batch->id);
        $parsed = (clone $q)->count();
        $invalid = (clone $q)->whereNotNull('errors')->count();
        $batch->update(['parsed_records' => $parsed, 'invalid_records' => $invalid, 'valid_records' => $parsed - $invalid,
            'duplicate_records' => (clone $q)->where('duplicate_status', '!=', 'none')->count(),
            'imported_records' => (clone $q)->whereNotNull('qb_question_id')->count(),
            'status' => $batch->status === 'parsing' && $batch->total_records > 0 && $parsed >= $batch->total_records ? 'ready' : $batch->status]);
    }

    /** the error report: one line per problem - file, record number, field path, message */
    public function errorCsv(QbImportBatch $batch): string
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['file', 'record', 'type', 'path', 'message']);
        if ($batch->error) fputcsv($out, ['', '', '', '', $batch->error]);
        QbImportRecord::where('qb_import_batch_id', $batch->id)->whereNotNull('errors')->orderBy('file_index')->orderBy('record_index')
            ->chunk(500, function ($rows) use ($out, $batch) {
                foreach ($rows as $r) foreach ($r->errors as $e) fputcsv($out, [$batch->files[$r->file_index]['name'] ?? '', $r->record_index + 1, $r->type_slug, $e['path'], $e['message']]);
            });
        rewind($out);
        return "\xEF\xBB\xBF" . stream_get_contents($out);               // BOM: Excel opens Bangla correctly
    }

    /** a stored file -> [records, document, schema version]; the question list is `questions` or the root list */
    public function read(QbImportBatch $batch, int $fileIndex): array
    {
        $bytes = Storage::disk('private')->get($this->path($batch, $fileIndex)) ?? '';
        $data = $batch->format === 'toon' ? ToonDecoder::decode($bytes) : json_decode(preg_replace('/^\xEF\xBB\xBF/', '', $bytes), true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($data)) throw new BusinessException('the file is not a question list', 'qb_import_shape', 422);
        if (array_is_list($data)) return [$data, [], self::SCHEMA_V5];
        if (!array_key_exists('questions', $data) || !is_array($data['questions'])) throw new BusinessException('the file has no "questions" list', 'qb_import_shape', 422);
        $version = is_string($data['schema_version'] ?? null) ? $data['schema_version'] : self::SCHEMA_V5;
        if (!str_starts_with($version, 'exam-management.universal-content-json.') && !str_starts_with($version, 'sms.question-import.')) {
            throw new BusinessException("unsupported schema_version \"{$version}\"", 'qb_import_version', 422);
        }
        return [array_values($data['questions']), is_array($data['document'] ?? null) ? $data['document'] : [], $version];
    }

    /** records whose normalized text matches an existing question of the same subject and type */
    private function duplicates(array $rows): array
    {
        $want = [];
        foreach ($rows as $index => $n) {
            if ($n['errors'] || !$n['payload']) continue;
            $body = $this->normalizer->editorBody($n['payload']);
            if (!$body['qb_subject_id'] || !$body['qb_question_type_id']) continue;
            $want[$body['qb_subject_id'] . ':' . $body['qb_question_type_id']][$index] = QbQuestionFinderService::normalize((string) $n['payload']['question_text']);
        }
        $found = [];
        foreach ($want as $pair => $texts) {
            [$subject, $type] = explode(':', $pair);
            $existing = [];
            QbQuestion::where('qb_subject_id', $subject)->where('qb_question_type_id', $type)->select(['id', 'question_text'])
                ->chunkById(2000, function ($qs) use (&$existing) { foreach ($qs as $q) $existing[QbQuestionFinderService::normalize((string) $q->question_text)] ??= $q->id; });
            foreach ($texts as $index => $t) if ($t !== '' && isset($existing[$t])) $found[$index] = $existing[$t];
        }
        return $found;
    }

    private function format(string $name, string $bytes): string
    {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if ($ext === 'toon') return 'toon';
        if ($ext === 'json') return 'json';
        return in_array(ltrim($bytes, " \t\r\n\xEF\xBB\xBF")[0] ?? '', ['{', '['], true) ? 'json' : 'toon';
    }

    private function path(QbImportBatch $batch, int $i): string
    {
        return "platform/qb-imports/{$batch->uuid}/{$i}." . $batch->format;
    }
}
