<?php

namespace App\Services\QuestionBank;

use App\Exceptions\BusinessException;
use App\Models\{QbOmrForm, QbPaper, QbPaperItem, QbPaperVariant, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class QbOmrFormService
{
    /** qbank's web-font list: key => CSS family stack (the server's Chromium falls back when a family is not installed) */
    public const FONTS = ['default' => 'Arial, "Noto Sans Bengali", sans-serif', 'solaiman' => '"SolaimanLipi", "Noto Sans Bengali", sans-serif',
        'kalpurush' => '"Kalpurush", "Noto Sans Bengali", sans-serif', 'noto' => '"Noto Sans Bengali", Arial, sans-serif', 'hind' => '"Hind Siliguri", "Noto Sans Bengali", sans-serif'];
    /** qbank's theme colours (line and heading colour of the sheet; the scan markers and code bits stay black) */
    public const COLORS = ['blue' => '#2563eb', 'red' => '#e11d48', 'slate' => '#4b5563', 'sky' => '#3b82f6', 'green' => '#16a34a', 'purple' => '#9333ea',
        'orange' => '#ea580c', 'cyan' => '#0891b2', 'pink' => '#db2777', 'yellow' => '#ca8a04', 'lime' => '#65a30d', 'black' => '#111111'];

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
        return QbOmrForm::current($paper)->firstOrFail();
    }

    public function save(QbPaper $paper, array $input): QbOmrForm
    {
        return DB::transaction(function () use ($paper, $input) {
            $lockedPaper = QbPaper::lockForUpdate()->findOrFail($paper->id);
            if ($lockedPaper->status !== 'final') throw new BusinessException(__('errors.qb_omr_paper_not_final'), 'qb_omr_paper_not_final', 422);

            $form = QbOmrForm::current($lockedPaper)->lockForUpdate()->first();
            if ($form?->locked_at !== null) throw new BusinessException(__('errors.qb_omr_locked'), 'qb_omr_locked', 422);
            $this->refuseLegacyCodes($lockedPaper);

            $mcqIds = $this->mcqIds($lockedPaper);
            $children = $this->groups($lockedPaper);              // D171: each stimulus group child is one more MCQ row
            $childCount = array_sum(array_map('count', $children));
            if ($mcqIds === [] && $childCount === 0) throw new BusinessException(__('errors.qb_omr_no_mcq'), 'qb_omr_no_mcq', 422);
            $optionCounts = QbPaperItem::whereIn('qb_question_id', $mcqIds)->with('question.options:id,qb_question_id')->get()
                ->keyBy('qb_question_id')->map(fn ($item) => $item->question->options->count());
            $childMismatch = collect($children)->flatten(1)->contains(fn ($c) => (int) $c['options'] !== (int) $input['option_count']);   // D171 (5)
            if ($optionCounts->count() !== count($mcqIds) || $childMismatch || $optionCounts->contains(fn ($count) => (int) $count !== (int) $input['option_count'])) {
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
                'question_count' => count($mcqIds) + $childCount,
                'subject_blocks' => $this->subjectBlocks($lockedPaper),   // D128: [] unless the paper is grouped by subject
                'subtitle' => trim((string) ($input['subtitle'] ?? '')),
                'title_size' => (int) ($input['title_size'] ?? 12),
                'subtitle_size' => (int) ($input['subtitle_size'] ?? 12),
                'font' => $input['font'] ?? 'default',
                'theme_color' => $input['theme_color'] ?? 'black',
                'entry_mode' => $input['entry_mode'] ?? 'digital',
                'info_boxes' => [
                    'class' => ['visible' => (bool) $input['info_boxes']['class'], 'digits' => (int) ($input['digits']['class'] ?? 2)],
                    'roll' => ['visible' => (bool) $input['info_boxes']['roll'], 'digits' => $rollDigits],
                    // D159 (4): the student's 10-digit OMR ID replaces the subject-code box (a request with the old `subject` key shows it the same way)
                    'student_id' => ['visible' => (bool) ($input['info_boxes']['student_id'] ?? $input['info_boxes']['subject']), 'digits' => 10],
                    // the set box never has fewer digits than the paper's sets need
                    'set' => ['visible' => (bool) $input['info_boxes']['set'], 'digits' => $this->setDigits($lockedPaper)],   // D173: exactly one column per code letter
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
                    'qb_paper_revision_id' => $lockedPaper->currentRevisionId(),   // D180 (4): one form per revision
                    'code' => Str::upper(Str::random(10)),
                    'layout_version' => 1,
                ]);
            }
            $form->settings_json = $settings;
            $form->save();

            return $form->fresh();
        });
    }

    /** owner 2026-10-24 (as qbank): whether the saved settings' content fits their page at full size (the geometry decides); null = cannot tell */
    public function fits(QbOmrForm $form): ?bool
    {
        if (is_array($form->settings_json['geometry'] ?? null)) return (bool) ($form->settings_json['geometry']['fits'] ?? true);
        try { return (bool) app(QbOmrGeometryService::class)->build((int) $form->qb_paper_id, $form->settings_json ?? [])['fits']; }
        catch (\InvalidArgumentException) { return null; }
    }

    public function generate(User $actor, int $paperId, QbOmrGeometryService $geometryBuilder): QbOmrForm
    {
        return DB::transaction(function () use ($actor, $paperId, $geometryBuilder) {
            $paper = $this->paper($actor, $paperId, true);
            $form = QbOmrForm::current($paper)->lockForUpdate()->firstOrFail();
            if ($form->locked_at === null) {
                $this->refuseLegacyCodes($paper);
                $settings = is_array($form->settings_json) ? $form->settings_json : [];
                // D173: one set-code column per code letter - the sets may have been added or deleted since the settings were saved
                if (isset($settings['info_boxes']['set'])) $settings['info_boxes']['set']['digits'] = $this->setDigits($paper);
                $settings['geometry'] = $geometryBuilder->build($paper->id, $settings);
                if (!$settings['geometry']['fits']) throw new BusinessException('the OMR sheet does not fit this page', 'omr_page_too_small', 422);
                $settings['is_generated'] = true;
                $settings['generated_at'] = now()->toIso8601String();
                $form->settings_json = $settings;
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
            $form = QbOmrForm::current($paper)->lockForUpdate()->firstOrFail();
            if ($form->locked_at !== null) {
                $form->layout_version++;
                $form->locked_at = null;
                $settings = $form->settings_json;
                unset($settings['geometry']);
                $settings['is_generated'] = false;
                $settings['generated_at'] = null;
                $form->settings_json = $settings;
                $form->save();
            }
            return $form->fresh();
        });
    }

    /** the sheet to print; `$preview` (qbank's live preview before "Generate OMR") draws the saved, not yet generated settings with
     *  their geometry built on the fly - the same builder "Generate" uses, so the preview is exactly the sheet that will be printed */
    public function printData(User $actor, int $paperId, ?string $setCode = null, bool $preview = false): array
    {
        $paper = $this->paper($actor, $paperId);
        $form = $this->form($paper);
        $settings = $form->settings_json;
        if ($preview && $form->locked_at === null) $settings['geometry'] = app(QbOmrGeometryService::class)->build($paper->id, $settings);
        if (($form->locked_at === null && !$preview) || !is_array($settings['geometry'] ?? null)) {
            throw new BusinessException(__('errors.qb_omr_not_generated'), 'qb_omr_not_generated', 422);
        }

        $variants = QbPaperVariant::current($paper)->orderBy('variant_number');
        $variant = $setCode === null ? $variants->first() : $variants->where('code', $setCode)->first();
        if (!$variant) throw new BusinessException(__('errors.qb_no_such_set'), 'qb_no_such_set', 422);
        $firstCode = (string) QbPaperVariant::current($paper)->orderBy('variant_number')->value('code');
        $symbols = preg_match('/^[A-Z]/', $firstCode) ? range('A', 'J') : ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ'];

        return ['paper' => $paper, 'form' => $form, 'variant' => $variant, 'settings' => $settings, 'set_symbols' => $symbols,
            'header' => app(QbPaperHeader::class)->lines($paper, (string) \App\Support\Tenancy::current()?->name)];
    }

    /** D128: the MCQ rows of each subject block (the same in every set: sets shuffle only inside a block), from set 1's frozen order */
    private function subjectBlocks(QbPaper $paper): array
    {
        $layout = QbPaperVariant::current($paper)->orderBy('variant_number')->value('layout_json') ?? [];
        $mcq = array_flip($this->mcqIds($paper));
        $groups = $this->groups($paper);
        $blocks = [];
        $row = 0;
        foreach ($layout as $section) foreach ($section['items'] ?? [] as $it) {
            $rows = isset($mcq[(int) $it['qb_question_id']]) ? 1 : count($groups[(int) $it['qb_question_id']] ?? []);   // D171: a group's children
            if ($rows === 0) continue;
            if (!isset($it['qb_subject_id'])) return [];
            $last = array_key_last($blocks);
            if ($last !== null && $blocks[$last]['subject_id'] === (int) $it['qb_subject_id']) $blocks[$last]['count'] += $rows;
            else $blocks[] = ['subject_id' => (int) $it['qb_subject_id'], 'start' => $row, 'count' => $rows];
            $row += $rows;
        }
        if ($blocks === []) return [];
        $names = \App\Models\QbSubject::whereIn('id', array_column($blocks, 'subject_id'))->get()->keyBy('id');
        return array_map(fn ($b) => $b + ['name' => $names->get($b['subject_id'])?->name_bn ?? $names->get($b['subject_id'])?->name_en ?? ''], $blocks);
    }

    /** D173: the set-code box has one A-J (or ক-ঞ) column per letter of the paper's set codes */
    private function setDigits(QbPaper $paper): int
    {
        $code = (string) QbPaperVariant::current($paper)->orderBy('variant_number')->value('code');
        return $code === '' ? 1 : mb_strlen($code);
    }

    /** D173: a paper whose sets still use letters after J (made before D173) gets no OMR until its sets are next added or deleted */
    private function refuseLegacyCodes(QbPaper $paper): void
    {
        $codes = QbPaperVariant::current($paper)->pluck('code');
        if ($codes->contains(fn ($c) => \App\Services\QbPaperSets::legacy((string) $c))) {
            throw new BusinessException(__('errors.qb_omr_legacy_set_codes'), 'qb_omr_legacy_set_codes', 422);
        }
    }

    /** D171: the paper's stimulus MCQ groups => their sub_mcq children (option count, correct index, marks) in authored order */
    public function groups(QbPaper $paper): array
    {
        $ids = QbPaperItem::whereHas('section', fn ($query) => $query->where('qb_paper_id', $paper->id))->pluck('qb_question_id')
            ->map(fn ($id) => ['qb_question_id' => (int) $id])->all();
        return app(\App\Services\QbPaperSets::class)->groups([['items' => $ids]]);
    }

    private function mcqIds(QbPaper $paper): array
    {
        return QbPaperItem::whereHas('section', fn ($query) => $query->where('qb_paper_id', $paper->id))
            ->whereHas('question.type', fn ($query) => $query->where('slug', 'mcq'))
            ->pluck('qb_question_id')->map(fn ($id) => (int) $id)->all();
    }
}