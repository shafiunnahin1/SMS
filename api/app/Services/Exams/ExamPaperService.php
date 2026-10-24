<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Exam, ExamPaper, ExamSubject, QbPaper, QbPaperItem, QbPaperSection, QbQuestion, QbSubject, Result, User};
use Illuminate\Support\Facades\DB;

/**
 * D158 (3)(4) / D159 (1)(2): an exam subject takes FINAL question papers of the institution - several papers (e.g. the MCQ paper
 * and the CQ+SQ paper), and of a multi-subject paper only one subject block (e.g. 5 subjects x 20 MCQ in one class test). The
 * subject's mark parts are the kinds of question over all its links (MCQ, creative, short / other written) with their marks; a kind
 * in two papers adds up; the subject's pass ratio is kept. Changes are allowed only while the exam is open and the subject has no
 * marks yet, so saved marks never change meaning.
 */
class ExamPaperService
{
    public const KINDS = ['mcq', 'cq', 'short'];

    /** ['mcq' => 30.0, ...] - the kinds of question on the paper (or on its block of one subject) with their marks */
    public function kinds(QbPaper $paper, ?int $qbSubjectId = null): array
    {
        $items = QbPaperItem::whereIn('qb_paper_section_id', QbPaperSection::where('qb_paper_id', $paper->id)->pluck('id'))->get();
        $questions = QbQuestion::whereIn('qb_questions.id', $items->pluck('qb_question_id'))->join('qb_question_types', 'qb_question_types.id', '=', 'qb_questions.qb_question_type_id')
            ->get(['qb_questions.id', 'qb_questions.qb_subject_id', 'qb_question_types.family'])->keyBy('id');
        $sum = [];
        foreach ($items as $item) {
            $q = $questions[$item->qb_question_id] ?? null;
            if (!$q || ($qbSubjectId !== null && (int) $q->qb_subject_id !== $qbSubjectId)) continue;
            $kind = match ($q->family) { 'mcq' => 'mcq', 'creative' => 'cq', default => 'short' };
            $sum[$kind] = ($sum[$kind] ?? 0) + (float) $item->marks;
        }
        return $sum;
    }

    /** the paper's subject blocks (D128): [qb_subject_id => name]; one entry or none = not a multi-subject paper */
    public function blocks(QbPaper $paper): array
    {
        $ids = QbQuestion::whereIn('id', QbPaperItem::whereIn('qb_paper_section_id', QbPaperSection::where('qb_paper_id', $paper->id)->pluck('id'))->pluck('qb_question_id'))
            ->distinct()->pluck('qb_subject_id')->filter()->map(fn ($v) => (int) $v)->all();
        return QbSubject::whereIn('id', $ids)->get()->mapWithKeys(fn ($s) => [$s->id => $s->name_bn ?? $s->name_en])->all();
    }

    public function link(Exam $exam, int $subjectId, int $paperId, ?int $qbSubjectId, User $actor): ExamPaper
    {
        $es = $this->openSubject($exam, $subjectId);
        $paper = QbPaper::findOrFail($paperId);                                  // tenant-scoped: another institution's paper is 404
        if ($paper->status !== 'final') throw new BusinessException('only a final paper can be linked', 'exam_paper_not_final', 422);
        $blocks = $this->blocks($paper);
        if ($qbSubjectId === null && count($blocks) > 1) throw new BusinessException('pick the subject of the paper', 'exam_paper_pick_block', 422);
        if ($qbSubjectId !== null && !array_key_exists($qbSubjectId, $blocks)) throw new BusinessException('the paper has no such subject', 'exam_paper_no_block', 422);
        if (!$this->kinds($paper, $qbSubjectId)) throw new BusinessException('the paper has no marks', 'exam_paper_empty', 422);
        if (ExamPaper::where('exam_subject_id', $es->id)->where('qb_paper_id', $paper->id)->where('qb_subject_id', $qbSubjectId)->exists()) {
            throw new BusinessException('already linked', 'exam_paper_already_linked', 422);
        }
        return DB::transaction(function () use ($exam, $es, $paper, $qbSubjectId, $actor) {
            $link = ExamPaper::create(['exam_subject_id' => $es->id, 'qb_paper_id' => $paper->id, 'qb_subject_id' => $qbSubjectId, 'linked_by' => $actor->id]);
            $this->recompute($es);
            AuditLog::record('exam.paper_linked', $exam, ['subject_id' => $es->subject_id, 'qb_paper_id' => $paper->id, 'qb_subject_id' => $qbSubjectId]);
            return $link;
        });
    }

    /** removes one link ($linkId) or every link of the subject */
    public function unlink(Exam $exam, int $subjectId, ?int $linkId = null): void
    {
        $es = $this->openSubject($exam, $subjectId);
        DB::transaction(function () use ($exam, $es, $linkId) {
            ExamPaper::where('exam_subject_id', $es->id)->when($linkId, fn ($q) => $q->whereKey($linkId))->delete();
            $this->recompute($es);
            AuditLog::record('exam.paper_unlinked', $exam, ['subject_id' => $es->subject_id, 'link_id' => $linkId]);
        });
    }

    /** subject_id => [['id', 'qb_paper_id', 'title', 'qb_subject_id', 'block'], ...] for the exam's linked subjects */
    public function linksOf(Exam $exam): array
    {
        $subjects = ExamSubject::where('exam_id', $exam->id)->pluck('subject_id', 'id');
        $blockNames = QbSubject::whereIn('id', ExamPaper::whereIn('exam_subject_id', $subjects->keys())->whereNotNull('qb_subject_id')->pluck('qb_subject_id'))->get()
            ->mapWithKeys(fn ($s) => [$s->id => $s->name_bn ?? $s->name_en]);
        $out = [];
        foreach (ExamPaper::whereIn('exam_subject_id', $subjects->keys())->with('paper:id,title')->orderBy('id')->get() as $l) {
            $out[$subjects[$l->exam_subject_id]][] = ['id' => $l->id, 'qb_paper_id' => $l->qb_paper_id, 'title' => $l->paper?->title,
                'qb_subject_id' => $l->qb_subject_id, 'block' => $l->qb_subject_id ? ($blockNames[$l->qb_subject_id] ?? null) : null];
        }
        return $out;
    }

    /** the subject's parts = the kinds over all its links (a kind in two papers adds up); no link = no parts */
    private function recompute(ExamSubject $es): void
    {
        $sum = [];
        foreach (ExamPaper::where('exam_subject_id', $es->id)->with('paper')->get() as $l) {
            foreach ($this->kinds($l->paper, $l->qb_subject_id) as $kind => $marks) $sum[$kind] = ($sum[$kind] ?? 0) + $marks;
        }
        if (!$sum) { $es->update(['components' => null]); return; }
        $ratio = (float) $es->full_marks > 0 ? (float) $es->pass_marks / (float) $es->full_marks : 0.33;
        $parts = array_values(array_map(fn ($k) => ['key' => $k, 'label' => __("exams.kinds.{$k}"), 'full' => round($sum[$k], 2), 'pass' => round($sum[$k] * $ratio, 2)],
            array_filter(self::KINDS, fn ($k) => isset($sum[$k]))));
        $full = round(array_sum(array_column($parts, 'full')), 2);
        $es->update(['full_marks' => $full, 'pass_marks' => round($full * $ratio, 2), 'components' => $parts]);
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
