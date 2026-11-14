<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{Enrollment, ExamSubject, FinalResult, Result, ResultSheet, Subject};
use App\Services\InstitutionSettings;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

// D197 AAD.2 (academics-advanced.md section 1.3): FinalResultService::compute(ResultSheet).
// Per student s and subject b: each component's percentage p(c) = results.percentage (best_of: the mean of the best k);
// absent -> 0 (zero) or left out (exclude); no mark -> refused (error) or left out (skip_redistribute); left-out weight is shared
// by the rest (weighted = sum w*p / sum w kept). A component whose exam(s) do not have subject b is not part of b.
// Grade / point from the institution's grading scale (the same table as ResultService). total = full-marks-weighted mean of the
// subjects; pass by pass_rule; GPA 0.00 on any fail; positions: passed students by total, a tie shares the rank, failed have none.
class FinalResultService
{
    /** @return array{computed: int, missing: array} - nothing is written while anything is missing under the `error` policy */
    public function compute(ResultSheet $sheet): array
    {
        if ($sheet->status === 'published') throw new BusinessException('published', 'result_sheet_published', 422);
        $rule = $sheet->rule;
        $comps = array_map(fn ($c) => ['exams' => isset($c['of']) ? array_map('intval', $c['of']) : [(int) $c['exam_id']], 'k' => isset($c['of']) ? (int) $c['best_of'] : null, 'w' => (float) $c['weight']], $rule['components']);
        $examIds = array_merge(...array_column($comps, 'exams'));
        $students = $this->students($sheet);
        $subjectsOf = ExamSubject::whereIn('exam_id', $examIds)->get(['exam_id', 'subject_id'])->groupBy('exam_id')->map(fn ($r) => $r->pluck('subject_id')->all());
        $subjectIds = array_values(array_unique(array_merge(...array_values($subjectsOf->all() ?: [[]]))));
        $subjects = Subject::whereIn('id', $subjectIds)->orderBy('id')->get(['id', 'name', 'full_marks'])->keyBy('id');
        $res = [];
        foreach (Result::whereIn('exam_id', $examIds)->whereIn('student_id', array_keys($students))->get(['exam_id', 'student_id', 'subject_id', 'percentage', 'is_absent', 'is_pass']) as $r) {
            $res[$r->exam_id][$r->student_id][$r->subject_id] = $r;
        }
        $scale = \App\Support\GradingScale::rowsOrFail();   // D214 MAD.4
        $useGpa = (bool) ($rule['use_gpa'] ?? app(InstitutionSettings::class)->general(Tenancy::current())['use_gpa']);
        $passPct = (float) $rule['pass_percent'];
        $missing = [];
        $rows = [];
        foreach ($students as $sid => $batchId) {
            $details = [];
            foreach ($subjects as $b) {
                $num = 0.0; $den = 0.0; $parts = []; $everyExamPass = true;
                foreach ($comps as $ci => $c) {
                    $exams = array_values(array_filter($c['exams'], fn ($e) => in_array($b->id, $subjectsOf[$e] ?? [], true)));
                    if (!$exams) continue;
                    $present = []; $absent = false; $gone = false;
                    foreach ($exams as $e) {
                        $r = $res[$e][$sid][$b->id] ?? null;
                        if (!$r) { $gone = true; continue; }
                        if ($r->is_absent) { $absent = true; continue; }
                        $present[] = ['p' => (float) $r->percentage, 'pass' => (bool) $r->is_pass];
                    }
                    $need = $c['k'] ?? 1;
                    if (count($present) >= $need) {
                        usort($present, fn ($x, $y) => $y['p'] <=> $x['p']);
                        $best = array_slice($present, 0, $need);
                        $p = array_sum(array_column($best, 'p')) / $need;
                        if (in_array(false, array_column($best, 'pass'), true)) $everyExamPass = false;
                    } elseif ($absent && !$gone) {
                        if ($rule['absent_policy'] === 'exclude') continue;
                        $p = 0.0; $everyExamPass = false;
                    } elseif ($rule['missing_subject_policy'] === 'error') {
                        $missing[] = ['student_id' => $sid, 'subject_id' => $b->id, 'subject' => $b->name, 'component' => $ci + 1];
                        continue;
                    } else {
                        continue;                                            // skip_redistribute
                    }
                    $parts[] = ['component' => $ci + 1, 'percentage' => round($p, 2), 'weight' => $c['w']];
                    $num += $c['w'] * $p; $den += $c['w'];
                }
                if ($den <= 0) continue;
                $weighted = round($num / $den, 2);
                $subjectPass = $weighted >= $passPct && ($rule['pass_rule'] !== 'every_subject_every_exam' || $everyExamPass);
                $row = collect($scale)->first(fn ($x) => $weighted >= $x['min']);
                $failed = $rule['pass_rule'] !== 'total_only' && !$subjectPass;
                $details[] = ['subject_id' => $b->id, 'subject' => $b->name, 'full_marks' => (float) ($b->full_marks ?? 100), 'components' => $parts, 'weighted' => $weighted,
                    'grade' => $failed ? 'F' : $row['grade'], 'point' => $failed ? 0.0 : (float) $row['point'], 'is_pass' => $subjectPass];
            }
            $full = array_sum(array_column($details, 'full_marks'));
            $total = $full > 0 ? round(array_sum(array_map(fn ($d) => $d['weighted'] * $d['full_marks'], $details)) / $full, 2) : null;
            $isPass = $total !== null && ($rule['pass_rule'] === 'total_only' ? $total >= $passPct : !in_array(false, array_column($details, 'is_pass'), true) && $details !== []);
            $g = $total === null ? null : collect($scale)->first(fn ($x) => $total >= $x['min']);
            $rows[$sid] = ['batch' => $batchId, 'total_percentage' => $total, 'is_pass' => $isPass, 'grade' => $g ? ($isPass ? $g['grade'] : 'F') : null,
                'gpa' => $useGpa && $total !== null ? ($isPass ? round(array_sum(array_column($details, 'point')) / max(count($details), 1), 2) : 0.00) : null, 'details' => $details];
        }
        if ($missing) return ['computed' => 0, 'missing' => $missing];
        $this->rank($rows, null, 'position_program');
        foreach (array_filter(array_unique(array_column($rows, 'batch'))) as $bid) $this->rank($rows, (int) $bid, 'position_batch');
        DB::transaction(function () use ($sheet, $rows) {
            FinalResult::where('result_sheet_id', $sheet->id)->delete();
            foreach ($rows as $sid => $r) {
                FinalResult::create(['result_sheet_id' => $sheet->id, 'student_id' => $sid, 'total_percentage' => $r['total_percentage'], 'gpa' => $r['gpa'], 'grade' => $r['grade'],
                    'position_program' => $r['position_program'] ?? null, 'position_batch' => $r['position_batch'] ?? null, 'is_pass' => $r['is_pass'], 'details' => $r['details']]);
            }
        });
        return ['computed' => count($rows), 'missing' => []];
    }

    /** student id => batch id: active enrollments of the program (and batch), plus completed / promoted ones of the sheet's year */
    public function students(ResultSheet $sheet): array
    {
        return Enrollment::where('program_id', $sheet->program_id)->when($sheet->batch_id, fn ($q) => $q->where('batch_id', $sheet->batch_id))
            ->where(fn ($q) => $q->where('status', 'active')->when($sheet->academic_year_id, fn ($w) => $w->orWhere(fn ($y) => $y->whereIn('status', ['completed', 'promoted'])->where('academic_year_id', $sheet->academic_year_id))))
            ->orderBy('id')->get(['student_id', 'batch_id'])->unique('student_id')->mapWithKeys(fn ($e) => [$e->student_id => $e->batch_id])->all();
    }

    private function rank(array &$rows, ?int $batch, string $key): void
    {
        $passed = array_filter($rows, fn ($r) => $r['is_pass'] && ($batch === null || $r['batch'] === $batch));
        uasort($passed, fn ($a, $b) => $b['total_percentage'] <=> $a['total_percentage']);
        $rank = 0; $i = 0; $last = null;
        foreach ($passed as $sid => $r) {
            $i++;
            if ($r['total_percentage'] !== $last) { $rank = $i; $last = $r['total_percentage']; }
            $rows[$sid][$key] = $rank;
        }
    }
}
