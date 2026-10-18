<?php

namespace App\Services;

use App\Models\{Exam, ExamSubject, Result};
use App\Support\Tenancy;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// docs/modules/grading.md "Revision 6.3 ResultService (Authoritative)": grades come from the PERCENTAGE of the exam subject's
// own full marks; components (written/MCQ/practical) each have a pass mark; a fail is always F / 0.00. Grades are computed
// only here - the frontend never calculates one.
class ResultService
{
    public function score(ExamSubject $es, ?float $total, ?array $components, bool $absent): array
    {
        if ($absent || ($total === null && !$components)) {
            return ['marks_obtained' => null, 'component_marks' => null, 'percentage' => null,
                    'grade' => 'F', 'grade_point' => 0.00, 'is_absent' => $absent, 'is_pass' => false];
        }
        $defs = collect($es->components ?? []);
        $passComponents = true;
        if ($defs->isNotEmpty()) {
            foreach ($defs as $d) {
                $m = (float) ($components[$d['key']] ?? 0);
                if ($m < 0 || $m > $d['full']) throw ValidationException::withMessages(['marks' => "{$d['label']}: সর্বোচ্চ {$d['full']}"]);
                if ($m < $d['pass']) $passComponents = false;
            }
            $total = (float) collect($components)->only($defs->pluck('key'))->sum();
        }
        $full = (float) $es->full_marks;
        if ($total < 0 || $total > $full) throw ValidationException::withMessages(['marks' => "সর্বোচ্চ নম্বর {$es->full_marks}"]);

        $pct = round($total / $full * 100, 2);
        $pass = $total >= (float) $es->pass_marks && $passComponents;
        $scale = (Tenancy::current()->settings ?? [])['grading_scale'] ?? config('grading.default_scale');
        $row = collect($scale)->first(fn ($r) => $pct >= $r['min']);
        return ['marks_obtained' => $total, 'component_marks' => $defs->isNotEmpty() ? $components : null, 'percentage' => $pct,
                'grade' => $pass ? $row['grade'] : 'F', 'grade_point' => $pass ? $row['point'] : 0.00, 'is_absent' => false, 'is_pass' => $pass];
    }

    /** $rows = [['student_id', 'marks_obtained'?, 'components'?, 'is_absent'?], ...] */
    public function bulkSaveMarks(Exam $exam, int $subjectId, array $rows): void
    {
        $es = ExamSubject::where('exam_id', $exam->id)->where('subject_id', $subjectId)->firstOrFail();
        DB::transaction(function () use ($exam, $es, $rows) {
            foreach ($rows as $r) {
                Result::updateOrCreate(
                    ['exam_id' => $exam->id, 'student_id' => $r['student_id'], 'subject_id' => $es->subject_id],
                    $this->score($es, isset($r['marks_obtained']) ? (float) $r['marks_obtained'] : null, $r['components'] ?? null, (bool) ($r['is_absent'] ?? false)));
            }
        });
    }

    /** Only when settings.use_gpa. GPA = 0 if any subject failed. */
    public function gpa(Collection $results): float
    {
        if ($results->isEmpty() || $results->contains(fn ($r) => !$r->is_pass)) return 0.00;
        return round((float) $results->avg('grade_point'), 2);
    }
}
