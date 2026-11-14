<?php

namespace App\Services\Risk;

use App\Models\{Attendance, Enrollment, Exam, Result, RiskFlag, Student, StudentLeaveRequest};
use App\Services\FeeService;
use Illuminate\Support\Facades\DB;

// D216 RISK.1 (docs/modules/risk-alerts.md section 2): measures every actively enrolled student of the bound institution and writes
// `risk_flags` ONLY ON CHANGE - a new row when a kind first appears or its level changes (the older current row is closed), nothing
// when it is unchanged, and `resolved` when the condition is gone. It reads attendance, published results and dues; it changes none.
class RiskEvaluator
{
    public function __construct(private RiskRules $rules, private FeeService $fees) {}

    /** @return RiskFlag[] the rows written in this run (new or changed levels) */
    public function run(): array
    {
        $t = $this->rules->thresholds();
        $today = now()->toDateString();
        $written = [];
        $batchOf = [];
        foreach (Enrollment::where('status', 'active')->orderByDesc('is_primary')->orderBy('id')->get(['student_id', 'batch_id']) as $e) $batchOf[$e->student_id] ??= $e->batch_id;
        foreach (Student::whereIn('id', array_keys($batchOf))->get() as $s) {
            $flags = $this->rules->evaluate($this->measure($s, $t), $t);
            foreach (RiskFlag::KINDS as $kind) {
                $row = $this->write($s->id, $batchOf[$s->id], $kind, $flags[$kind] ?? null, $today);
                if ($row) $written[] = $row;
            }
        }
        // a student who is no longer actively enrolled: nothing to watch any more
        RiskFlag::where('status', '!=', 'resolved')->whereNotIn('student_id', array_keys($batchOf) ?: [0])->get()->each->update(['status' => 'resolved']);
        return $written;
    }

    public function measure(Student $s, array $t): array
    {
        $from = now()->subDays((int) $t['window_days'] - 1)->toDateString();
        $rows = Attendance::where('student_id', $s->id)->where('date', '>=', $from)->where('date', '<=', now()->toDateString())->orderBy('date')->get(['date', 'status']);
        $leaves = StudentLeaveRequest::where('student_id', $s->id)->where('status', 'approved')->whereDate('to_date', '>=', $from)->get(['from_date', 'to_date']);
        $excused = fn ($date) => $leaves->contains(fn ($l) => $l->from_date->toDateString() <= $date && $l->to_date->toDateString() >= $date);
        // one status a day (a student in two batches: present anywhere counts as present); approved leave days are not counted at all
        $days = [];
        foreach ($rows as $r) {
            $d = $r->date->toDateString();
            if ($r->status === 'leave' || $excused($d)) continue;
            $present = in_array($r->status, ['present', 'late'], true);
            $days[$d] = ($days[$d] ?? false) || $present;
        }
        ksort($days);
        $run = 0;
        foreach (array_reverse($days) as $present) { if ($present) break; $run++; }

        // the student's published exams, oldest first: each exam's percentage = mean of its subject percentages (absent = 0)
        $exams = Exam::where('status', 'published')->whereIn('id', Result::where('student_id', $s->id)->select('exam_id'))->orderByRaw('COALESCE(end_date, start_date)')->orderBy('id')->pluck('id');
        $pcts = [];
        foreach ($exams as $id) {
            $pcts[] = (float) Result::where('exam_id', $id)->where('student_id', $s->id)->get(['percentage', 'is_absent'])->avg(fn ($r) => $r->is_absent ? 0.0 : (float) $r->percentage);
        }
        $n = count($pcts);

        $months = $this->fees->dueLines($s)->pluck('period')->filter(fn ($p) => preg_match('/^\d{4}-\d{2}$/', (string) $p))->unique()->count();

        return ['present' => count(array_filter($days)), 'working' => count($days), 'consecutive_absent' => $run,
            'previous_avg' => $n >= 3 ? ($pcts[$n - 3] + $pcts[$n - 2]) / 2 : null, 'latest' => $n >= 3 ? $pcts[$n - 1] : null, 'months_due' => $months];
    }

    private function write(int $studentId, ?int $batchId, string $kind, ?array $flag, string $today): ?RiskFlag
    {
        return DB::transaction(function () use ($studentId, $batchId, $kind, $flag, $today) {
            $current = RiskFlag::where('student_id', $studentId)->where('kind', $kind)->orderByDesc('computed_on')->orderByDesc('id')->lockForUpdate()->first();
            $live = $current && $current->status !== 'resolved' ? $current : null;
            $byHand = $current && !$live && ($current->details['resolved_by_hand'] ?? false);   // D216 RISK.2: closed by a person
            if (!$flag) {
                $live?->update(['status' => 'resolved']);
                if ($byHand) $current->update(['details' => array_diff_key($current->details, ['resolved_by_hand' => 1])]);   // the condition cleared: a later return is new again
                return null;
            }
            if ($live && $live->level === $flag['level']) return null;   // unchanged: no new row
            if ($byHand && $current->level === $flag['level']) return null;   // closed by hand and nothing changed: stays closed
            $data = ['batch_id' => $batchId, 'level' => $flag['level'], 'score' => $flag['score'], 'details' => $flag['details'], 'status' => 'open', 'acknowledged_by' => null, 'note' => null];
            if ($current && $current->computed_on->toDateString() === $today) {   // unique (student, kind, day): the day's row is rewritten
                $current->update($data);
                return $current;
            }
            $live?->update(['status' => 'resolved']);
            return RiskFlag::create(['student_id' => $studentId, 'kind' => $kind, 'computed_on' => $today] + $data);
        });
    }

    /** resolved rows older than 90 days (retention) */
    public function prune(int $days = 90): int
    {
        return RiskFlag::where('status', 'resolved')->where('computed_on', '<', now()->subDays($days)->toDateString())->delete();
    }
}
