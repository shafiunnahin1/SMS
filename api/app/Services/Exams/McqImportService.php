<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Exam, ExamPaper, ExamSubject, QbOmrForm, QbOmrScan, Result, Student};
use App\Services\ExamService;
use App\Services\QuestionBank\QbOmrReviewService;

/**
 * D158 (5)(6): an exam subject's MCQ part filled from pasted JSON or from the linked paper's graded OMR sheets. Every row is checked
 * against the students who sit the subject (and, for a teacher, their batches) and shown as a preview; saving writes only the valid
 * rows and only the MCQ part - the other parts already entered stay as they are. A re-import updates the same result rows.
 */
class McqImportService
{
    public function __construct(private ExamService $exams, private QbOmrReviewService $review) {}

    /** $input = [['id' => 'DHA-2025-0001'? | 'roll' => '12', 'batch' => 'A'?, 'mcq' => 18.5], ...] -> checked rows; $save writes the valid ones.
     *  D159 (3): the permanent student ID wins; without it, roll (+ batch) as before */
    public function fromRows(Exam $exam, ExamSubject $es, array $input, ?array $batchIds, bool $save): array
    {
        $full = $this->mcqFull($es);
        $sitters = $this->exams->sitters($exam, $es, $batchIds);
        $seen = [];
        $rows = [];
        foreach (array_values($input) as $line => $r) {
            $id = trim((string) ($r['id'] ?? ''));
            $roll = trim((string) ($r['roll'] ?? ''));
            $batch = trim((string) ($r['batch'] ?? ''));
            $mcq = $r['mcq'] ?? null;
            $match = $id !== ''
                ? $sitters->filter(fn ($e) => strcasecmp((string) $e->student?->student_id, $id) === 0)->values()
                : $sitters->filter(fn ($e) => (string) $e->roll_no === $roll && ($batch === '' || $e->batch?->name === $batch))->values();
            $status = match (true) {
                $id === '' && $roll === '' => 'no_roll',
                !is_numeric($mcq) => 'not_number',
                (float) $mcq < 0 || (float) $mcq > $full => 'out_of_range',
                $match->count() === 0 => $id !== '' ? 'unknown_id' : 'unknown_roll',
                $match->count() > 1 => 'ambiguous_roll',
                isset($seen[$match[0]->student_id]) => 'duplicate',
                default => 'ok',
            };
            $student = $match->count() === 1 ? $match[0] : null;
            if ($status === 'ok') $seen[$student->student_id] = true;
            $rows[] = ['line' => $line + 1, 'id' => $student?->student?->student_id ?? ($id ?: null), 'roll' => $student ? (string) $student->roll_no : $roll, 'batch' => $student?->batch?->name ?? ($batch ?: null), 'student_id' => $student?->student_id,
                'name' => $student?->student?->user?->name, 'mcq' => is_numeric($mcq) ? round((float) $mcq, 2) : $mcq, 'status' => $status];
        }
        $saved = $save ? $this->save($exam, $es, array_filter($rows, fn ($r) => $r['status'] === 'ok'), $batchIds) : 0;
        return ['mcq_full' => $full, 'rows' => $rows, 'saved' => $saved];
    }

    /** the linked papers' graded OMR sheets (D127 review done) whose student sits the subject -> the same checked rows. D159 (5): a link
     *  to one subject block of a multi-subject paper takes only that block's marks from each sheet; marks of several linked papers add up */
    public function fromOmr(Exam $exam, ExamSubject $es, ?array $batchIds, bool $save): array
    {
        $links = ExamPaper::where('exam_subject_id', $es->id)->with('paper')->get();
        if ($links->isEmpty()) throw new BusinessException('no linked paper', 'exam_no_paper', 422);
        $marks = [];
        $sheets = 0;
        foreach ($links as $link) {
            // D180 (4): each revision of the paper has its own form; sheets of every revision count, each graded by its own sets
            foreach (QbOmrForm::where('qb_paper_id', $link->qb_paper_id)->orderBy('id')->get() as $form) {
            $scans = QbOmrScan::where('qb_omr_form_id', $form->id)->where('status', 'graded')->whereNotNull('matched_student_id')->orderBy('id')->get();
            $sheets += $scans->count();
            foreach ($scans as $scan) {
                $got = $link->qb_subject_id ? $this->review->grade($form, $link->paper, $scan, (int) $link->qb_subject_id)['marks'] : (string) $scan->obtained_marks;
                $marks[$scan->matched_student_id] = round(($marks[$scan->matched_student_id] ?? 0) + (float) $got, 2);
            }
            }
        }
        // the scan's matched student (D127 review) is known: pass that student's permanent ID, so the same roll in two sections never
        // clashes and a student who does not sit this subject is "unknown", never another student with the same roll (D159 (3))
        $ids = Student::whereIn('id', array_keys($marks))->pluck('student_id', 'id');
        $input = array_map(fn ($sid, $m) => ['id' => (string) ($ids[$sid] ?? ('#' . $sid)), 'mcq' => $m], array_keys($marks), $marks);
        return $this->fromRows($exam, $es, $input, $batchIds, $save) + ['sheets' => $sheets];
    }

    private function save(Exam $exam, ExamSubject $es, array $rows, ?array $batchIds): int
    {
        if (!$rows) return 0;
        $existing = Result::where('exam_id', $exam->id)->where('subject_id', $es->subject_id)->whereIn('student_id', array_column($rows, 'student_id'))->get()->keyBy('student_id');
        $payload = array_values(array_map(fn ($r) => ['student_id' => $r['student_id'],
            'components' => array_merge($existing->get($r['student_id'])?->component_marks ?? [], ['mcq' => $r['mcq']])], $rows));
        $this->exams->saveMarks($exam, $es, $payload, $batchIds);
        AuditLog::record('exam.mcq_imported', $exam, ['subject_id' => $es->subject_id, 'rows' => count($payload)]);
        return count($payload);
    }

    private function mcqFull(ExamSubject $es): float
    {
        $part = collect($es->components ?? [])->firstWhere('key', 'mcq');
        if (!$part) throw new BusinessException('the subject has no MCQ part', 'exam_no_mcq_part', 422);
        return (float) $part['full'];
    }
}
