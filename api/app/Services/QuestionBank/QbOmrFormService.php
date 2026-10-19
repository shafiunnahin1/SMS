<?php

namespace App\Services\QuestionBank;

use App\Exceptions\BusinessException;
use App\Models\{QbOmrForm, QbPaper, QbPaperItem, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class QbOmrFormService
{
    public function paper(User $actor, int $paperId, bool $lock = false): QbPaper
    {
        if (!in_array($actor->role, ['admin', 'teacher'], true)) abort(404);
        $query = QbPaper::query();
        if ($actor->role === 'teacher') $query->where('created_by', $actor->id);
        $paper = $lock ? $query->lockForUpdate()->findOrFail($paperId) : $query->findOrFail($paperId);
        if ($paper->status !== 'final') throw new BusinessException(__('errors.qb_omr_paper_not_final'), 'qb_omr_paper_not_final', 422);
        return $paper;
    }

    public function form(QbPaper $paper): QbOmrForm
    {
        return QbOmrForm::where('qb_paper_id', $paper->id)->firstOrFail();
    }

    public function save(QbPaper $paper, array $input): QbOmrForm
    {
        return DB::transaction(function () use ($paper, $input) {
            $lockedPaper = QbPaper::lockForUpdate()->findOrFail($paper->id);
            if ($lockedPaper->status !== 'final') throw new BusinessException(__('errors.qb_omr_paper_not_final'), 'qb_omr_paper_not_final', 422);

            $form = QbOmrForm::where('qb_paper_id', $lockedPaper->id)->lockForUpdate()->first();
            if ($form?->locked_at !== null) throw new BusinessException(__('errors.qb_omr_locked'), 'qb_omr_locked', 422);

            $mcqIds = $this->mcqIds($lockedPaper);
            if ($mcqIds === []) throw new BusinessException(__('errors.qb_omr_no_mcq'), 'qb_omr_no_mcq', 422);
            $optionCounts = QbPaperItem::whereIn('qb_question_id', $mcqIds)->with('question.options:id,qb_question_id')->get()
                ->keyBy('qb_question_id')->map(fn ($item) => $item->question->options->count());
            if ($optionCounts->count() !== count($mcqIds) || $optionCounts->contains(fn ($count) => (int) $count !== (int) $input['option_count'])) {
                throw new BusinessException(__('errors.qb_omr_option_mismatch'), 'qb_omr_option_mismatch', 422);
            }

            $rollDigits = (int) $input['roll_digits'];
            $settings = [
                'title' => trim($input['title']),
                'roll_digits' => $rollDigits,
                'option_count' => (int) $input['option_count'],
                'option_labels' => $input['option_language'] === 'latin' ? ['A', 'B', 'C', 'D', 'E'] : ['ক', 'খ', 'গ', 'ঘ', 'ঙ'],
                'page_size' => $input['page_size'],
                'page_orientation' => $input['page_orientation'],
                'answer_columns' => (string) $input['answer_columns'],
                'question_count' => count($mcqIds),
                'info_boxes' => [
                    'class' => ['visible' => (bool) $input['info_boxes']['class'], 'digits' => 2],
                    'roll' => ['visible' => (bool) $input['info_boxes']['roll'], 'digits' => $rollDigits],
                    'subject' => ['visible' => (bool) $input['info_boxes']['subject'], 'digits' => 3],
                    'set' => ['visible' => (bool) $input['info_boxes']['set'], 'digits' => max(1, (int) ceil(log10(max(10, (int) $lockedPaper->sets_count * 10))))],
                ],
                'marking' => [
                    'question_mark' => (string) $input['question_mark'],
                    'negative_mark_enabled' => (bool) $input['negative_mark_enabled'],
                    'negative_mark' => (string) $input['negative_mark'],
                    'multiple_answer_policy' => $input['multiple_answer_policy'],
                ],
            ];

            if (!$form) {
                $form = new QbOmrForm([
                    'institution_id' => $lockedPaper->institution_id,
                    'qb_paper_id' => $lockedPaper->id,
                    'code' => Str::upper(Str::random(10)),
                    'layout_version' => 1,
                ]);
            }
            $form->settings_json = $settings;
            $form->save();

            return $form->fresh();
        });
    }

    public function generate(User $actor, int $paperId): QbOmrForm
    {
        return DB::transaction(function () use ($actor, $paperId) {
            $paper = $this->paper($actor, $paperId, true);
            $form = QbOmrForm::where('qb_paper_id', $paper->id)->lockForUpdate()->firstOrFail();
            if ($form->locked_at === null) {
                $form->locked_at = now();
                $form->save();
            }
            return $form->fresh();
        });
    }

    public function unlock(User $actor, int $paperId): QbOmrForm
    {
        return DB::transaction(function () use ($actor, $paperId) {
            $paper = $this->paper($actor, $paperId, true);
            $form = QbOmrForm::where('qb_paper_id', $paper->id)->lockForUpdate()->firstOrFail();
            if ($form->locked_at !== null) {
                $form->layout_version++;
                $form->locked_at = null;
                $form->save();
            }
            return $form->fresh();
        });
    }

    private function mcqIds(QbPaper $paper): array
    {
        return QbPaperItem::whereHas('section', fn ($query) => $query->where('qb_paper_id', $paper->id))
            ->whereHas('question.type', fn ($query) => $query->where('slug', 'mcq'))
            ->pluck('qb_question_id')->map(fn ($id) => (int) $id)->all();
    }
}