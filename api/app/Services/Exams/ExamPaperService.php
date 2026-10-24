<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Exam, ExamPaper, ExamSubject, QbPaper, QbPaperItem, QbPaperSection, QbQuestion, Result, User};
use Illuminate\Support\Facades\DB;

/**
 * D158 (3)(4): an exam subject takes one FINAL question paper of the institution (a paper may serve many exams). Linking sets the
 * subject's mark parts from the paper - one per kind of question on it (MCQ, creative, short / other written) with the paper's
 * marks of that kind - and keeps the subject's pass ratio. Allowed only while the exam is open and the subject has no marks yet,
 * so saved marks never change meaning.
 */
class ExamPaperService
{
    public const KINDS = ['mcq', 'cq', 'short'];

    /** [['key' => 'mcq', 'full' => 30.0], ...] in KINDS order - the kinds of question on the paper with their marks */
    public function kinds(QbPaper $paper): array
    {
        $items = QbPaperItem::whereIn('qb_paper_section_id', QbPaperSection::where('qb_paper_id', $paper->id)->pluck('id'))->get();
        $family = QbQuestion::whereIn('qb_questions.id', $items->pluck('qb_question_id'))->join('qb_question_types', 'qb_question_types.id', '=', 'qb_questions.qb_question_type_id')
            ->pluck('qb_question_types.family', 'qb_questions.id');
        $sum = [];
        foreach ($items as $item) {
            $kind = match ($family[$item->qb_question_id] ?? null) { 'mcq' => 'mcq', 'creative' => 'cq', default => 'short' };
            $sum[$kind] = ($sum[$kind] ?? 0) + (float) $item->marks;
        }
        return array_values(array_map(fn ($k) => ['key' => $k, 'full' => round($sum[$k], 2)], array_filter(self::KINDS, fn ($k) => ($sum[$k] ?? 0) > 0)));
    }

    public function link(Exam $exam, int $subjectId, int $paperId, User $actor): ExamPaper
    {
        $es = $this->openSubject($exam, $subjectId);
        $paper = QbPaper::findOrFail($paperId);                                  // tenant-scoped: another institution's paper is 404
        if ($paper->status !== 'final') throw new BusinessException('only a final paper can be linked', 'exam_paper_not_final', 422);
        $kinds = $this->kinds($paper);
        if (!$kinds) throw new BusinessException('the paper has no marks', 'exam_paper_empty', 422);
        return DB::transaction(function () use ($exam, $es, $paper, $kinds, $actor) {
            $full = round(array_sum(array_column($kinds, 'full')), 2);
            $ratio = (float) $es->full_marks > 0 ? (float) $es->pass_marks / (float) $es->full_marks : 0.33;
            $es->update(['full_marks' => $full, 'pass_marks' => round($full * $ratio, 2), 'components' => array_map(fn ($k) => [
                'key' => $k['key'], 'label' => __("exams.kinds.{$k['key']}"), 'full' => $k['full'], 'pass' => round($k['full'] * $ratio, 2)], $kinds)]);
            $link = ExamPaper::updateOrCreate(['exam_subject_id' => $es->id], ['qb_paper_id' => $paper->id, 'linked_by' => $actor->id]);
            AuditLog::record('exam.paper_linked', $exam, ['subject_id' => $es->subject_id, 'qb_paper_id' => $paper->id]);
            return $link;
        });
    }

    public function unlink(Exam $exam, int $subjectId): void
    {
        $es = $this->openSubject($exam, $subjectId);
        DB::transaction(function () use ($exam, $es) {
            ExamPaper::where('exam_subject_id', $es->id)->delete();
            $es->update(['components' => null]);
            AuditLog::record('exam.paper_unlinked', $exam, ['subject_id' => $es->subject_id]);
        });
    }

    /** subject_id => ['qb_paper_id', 'title', 'kinds'] for the exam's linked subjects */
    public function linksOf(Exam $exam): array
    {
        $subjects = ExamSubject::where('exam_id', $exam->id)->pluck('subject_id', 'id');
        return ExamPaper::whereIn('exam_subject_id', $subjects->keys())->with('paper:id,title')->get()
            ->mapWithKeys(fn ($l) => [$subjects[$l->exam_subject_id] => ['qb_paper_id' => $l->qb_paper_id, 'title' => $l->paper?->title]])->all();
    }

    private function openSubject(Exam $exam, int $subjectId): ExamSubject
    {
        if ($exam->status === 'published') throw new BusinessException('exam is published', 'exam_published', 422);
        $es = ExamSubject::where('exam_id', $exam->id)->where('subject_id', $subjectId)->firstOrFail();
        if (Result::where('exam_id', $exam->id)->where('subject_id', $subjectId)->exists()) {
            throw new BusinessException('the subject already has marks', 'exam_paper_has_marks', 422);
        }
        return $es;
    }
}
