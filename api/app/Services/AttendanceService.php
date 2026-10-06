<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Jobs\SendSmsJob;
use App\Models\{Attendance, Batch, Enrollment, Holiday, Student};
use App\Support\{Tenancy, TenantBulk};
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

// docs/templates/laravel-core-files.md "AttendanceService (Revision 7)": the unit is batch + date; every student must be actively
// enrolled in THAT batch; holidays block only school/college. One upsert per save (TenantBulk re-checks every row's institution).
class AttendanceService
{
    /** $data = { batch_id, date, records: [{student_id, status, note?}] } */
    public function saveBulk(array $data): array
    {
        $institution = Tenancy::current();
        $batch = Batch::findOrFail($data['batch_id']);
        $date = $data['date'];

        if (in_array($institution->institution_type, ['school', 'college'], true) && Holiday::where('date', $date)->exists()) {
            throw new BusinessException("ছুটির দিনে উপস্থিতি নেওয়া যায় না ({$date})", 'holiday_date');
        }

        $enrolled = Enrollment::where('batch_id', $batch->id)->where('status', 'active')
            ->whereIn('student_id', collect($data['records'])->pluck('student_id'))->pluck('student_id')->flip();
        $absent = [];

        DB::transaction(function () use ($data, $batch, $date, $enrolled, $institution, &$absent) {
            $rows = [];
            foreach ($data['records'] as $r) {
                if (!$enrolled->has($r['student_id'])) {
                    throw new BusinessException("Student #{$r['student_id']} এই batch-এ ভর্তি নন", 'not_enrolled');
                }
                $rows[] = ['institution_id' => $institution->id, 'student_id' => $r['student_id'], 'batch_id' => $batch->id, 'date' => $date,
                           'program_id' => $batch->program_id, 'status' => $r['status'], 'taken_by' => auth()->id(), 'note' => $r['note'] ?? null, 'created_at' => now()];
                if ($r['status'] === 'absent') $absent[] = $r['student_id'];
            }
            TenantBulk::upsert(Attendance::class, $rows, ['institution_id', 'student_id', 'batch_id', 'date'], ['program_id', 'status', 'taken_by', 'note']);
        });

        if ($absent) $this->notifyAbsentParents($absent, $date, $batch);
        return ['saved' => count($data['records']), 'absent_count' => count($absent)];
    }

    private function notifyAbsentParents(array $studentIds, string $date, Batch $batch): void
    {
        $when = Carbon::parse($date)->format('d/m/Y');
        Student::with('user')->whereIn('id', $studentIds)->get()->each(function (Student $s) use ($when, $batch) {
            $prefs = $s->primaryParent()?->notification_preferences ?? [];
            if (($prefs['sms'] ?? true) && ($prefs['absent_alert'] ?? true)) {
                $name = $s->user?->name ?? $s->student_id;
                SendSmsJob::dispatch($s->guardian_phone, "প্রিয় অভিভাবক, {$name} {$when} তারিখে {$batch->name}-এ অনুপস্থিত ছিল।", Tenancy::current()->id);
            }
        });
    }

    /** Monthly summary for a student, optionally one batch. A date RANGE, so the index on `date` is used. */
    public function getStudentSummary(int $studentId, string $month, ?int $batchId = null): array
    {
        [$from, $to] = $this->monthRange($month);
        $records = Attendance::where('student_id', $studentId)->whereBetween('date', [$from, $to])
            ->when($batchId, fn ($q) => $q->where('batch_id', $batchId))->get();
        $total = $records->count();
        $present = $records->where('status', 'present')->count();
        return [
            'month' => $month, 'total_days' => $total, 'present' => $present,
            'absent' => $records->where('status', 'absent')->count(), 'late' => $records->where('status', 'late')->count(),
            'leave' => $records->where('status', 'leave')->count(),
            'percentage' => $total > 0 ? round($present / $total * 100, 2) : 0,
            'daily_records' => $records->keyBy(fn ($r) => $r->date->toDateString()),
        ];
    }

    /** One grouped query for the whole batch; students come from enrollments */
    public function getBatchReport(int $batchId, string $month): Collection
    {
        [$from, $to] = $this->monthRange($month);
        $counts = Attendance::where('batch_id', $batchId)->whereBetween('date', [$from, $to])
            ->selectRaw('student_id, status, COUNT(*) AS n')->groupBy('student_id', 'status')->get()->groupBy('student_id');
        return Student::with('user')->inBatch($batchId)->active()->get()->map(function (Student $s) use ($counts, $month) {
            $c = ($counts[$s->id] ?? collect())->pluck('n', 'status');
            $total = (int) $c->sum();
            $present = (int) ($c['present'] ?? 0);
            return ['student' => $s, 'summary' => ['month' => $month, 'total_days' => $total, 'present' => $present,
                'absent' => (int) ($c['absent'] ?? 0), 'late' => (int) ($c['late'] ?? 0), 'leave' => (int) ($c['leave'] ?? 0),
                'percentage' => $total > 0 ? round($present / $total * 100, 2) : 0]];
        });
    }

    private function monthRange(string $month): array
    {
        $start = Carbon::parse($month . '-01');
        return [$start->copy()->startOfMonth()->toDateString(), $start->copy()->endOfMonth()->toDateString()];
    }
}
