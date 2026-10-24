<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Exam, ExamPaper, ExamSubject, QbOmrForm, QbOmrScan, Result};
use App\Services\ExamService;

/**
 * D158 (5)(6): an exam subject's MCQ part filled from pasted JSON or from the linked paper's graded OMR sheets. Every row is checked
 * against the students who sit the subject (and, for a teacher, their batches) and shown as a preview; saving writes only the valid
 * rows and only the MCQ part - the other parts already entered stay as they are. A re-import updates the same result rows.
 */
class McqImportService
{
    public function __construct(private ExamService $exams) {}

    /** $input = [['roll' => '12', 'batch' => 'A'?, 'mcq' => 18.5], ...] -> checked rows; $save writes the valid ones */
    public function fromRows(Exam $exam, ExamSubject $es, array $input, ?array $batchIds, bool $save): array
    {
        $full = $this->mcqFull($es);
        $sitters = $this->exams->sitters($exam, $es, $batchIds);
        $seen = [];
        $rows = [];
        foreach (array_values($input) as $line => $r) {
            $roll = trim((string) ($r['roll'] ?? ''));
            $batch = trim((string) ($r['batch'] ?? ''));
            $mcq = $r['mcq'] ?? null;
            $match = $sitters->filter(fn ($e) => (string) $e->roll_no === $roll && ($batch === '' || $e->batch?->name === $batch))->values();
            $status = match (true) {
                $roll === '' => 'no_roll',
                !is_numeric($mcq) => 'not_number',
                (float) $mcq < 0 || (float) $mcq > $full => 'out_of_range',
                $match->count() === 0 => 'unknown_roll',
                $match->count() > 1 => 'ambiguous_roll',
                isset($seen[$match[0]->student_id]) => 'duplicate',
                default => 'ok',
            };
            $student = $match->count() === 1 ? $match[0] : null;
            if ($status === 'ok') $seen[$student->student_id] = true;
            $rows[] = ['line' => $line + 1, 'roll' => $roll, 'batch' => $student?->batch?->name ?? ($batch ?: null), 'student_id' => $student?->student_id,
                'name' => $student?->student?->user?->name, 'mcq' => is_numeric($mcq) ? round((float) $mcq, 2) : $mcq, 'status' => $status];
        }
        $saved = $save ? $this->save($exam, $es, array_filter($rows, fn ($r) => $r['status'] === 'ok'), $batchIds) : 0;
        return ['mcq_full' => $full, 'rows' => $rows, 'saved' => $saved];
    }

    /** the linked paper's graded OMR sheets (D127 review done) whose student sits the subject -> the same checked rows */
    public function fromOmr(Exam $exam, ExamSubject $es, ?array $batchIds, bool $save): array
    {
        $paperId = ExamPaper::where('exam_subject_id', $es->id)->value('qb_paper_id');
        if (!$paperId) throw new BusinessException('no linked paper', 'exam_no_paper', 422);
        $form = QbOmrForm::where('qb_paper_id', $paperId)->first();
        $scans = $form ? QbOmrScan::where('qb_omr_form_id', $form->id)->where('status', 'graded')->whereNotNull('matched_student_id')->orderBy('id')->get() : collect();
        $rolls = $this->exams->sitters($exam, $es, $batchIds)->keyBy('student_id');
        $input = $scans->map(fn ($s) => ['roll' => (string) ($rolls[$s->matched_student_id]->roll_no ?? $s->roll), 'batch' => $rolls[$s->matched_student_id]?->batch?->name, 'mcq' => $s->obtained_marks])->all();
        $result = $this->fromRows($exam, $es, $input, $batchIds, $save);
        return $result + ['sheets' => $scans->count()];
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
