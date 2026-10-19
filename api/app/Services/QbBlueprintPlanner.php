<?php

namespace App\Services;

use App\Models\{QbBlueprint, QbQuestion, QbUnlock};
use App\Support\Money;
use Illuminate\Support\Collection;

// D126 (3), R2.1.5: qbank's AssessmentBlueprintPaperPlanner for SMS - each blueprint rule takes, in qbank's fixed order (oldest
// first), the eligible questions: published, of the rule's type (and chapter / topic / difficulty when set), in the blueprint's
// subject, bought by this institution or free (price 0). A question is used once per paper. A rule without enough eligible
// questions is reported "short" - never filled from outside its rule. Runs on the institution's host (unlocks are its own).
class QbBlueprintPlanner
{
    public function __construct(private QbPricingService $pricing) {}

    /** @return array{sections: list<array>, short: int} sections in QB.8's paper shape plus wanted/found per rule */
    public function plan(QbBlueprint $bp, array $exclude = []): array
    {
        $used = array_map('intval', $exclude);
        $sections = [];
        $short = 0;
        foreach ($bp->items()->get() as $index => $rule) {
            $picked = $this->eligible($bp, $rule, $used)->take($rule->question_count)->pluck('id')->map(fn ($v) => (int) $v)->all();
            $used = [...$used, ...$picked];
            $missing = $rule->question_count - count($picked);
            $short += $missing;
            $at = collect($sections)->search(fn ($s) => $s['title'] === $rule->section_title);
            $rows = array_map(fn ($id) => ['qb_question_id' => $id, 'marks' => Money::format(Money::toPaisa((string) $rule->marks_each)), 'rule' => $index], $picked);
            if ($at === false) $sections[] = ['title' => $rule->section_title, 'items' => $rows, 'rules' => []];
            else $sections[$at]['items'] = [...$sections[$at]['items'], ...$rows];
            $sections[$at === false ? count($sections) - 1 : $at]['rules'][] = ['rule' => $index, 'wanted' => $rule->question_count, 'found' => count($picked), 'short' => $missing];
        }
        return ['sections' => $sections, 'short' => $short];
    }

    /** the other eligible questions for one rule (to swap a picked one); `$used` are already on the paper */
    public function candidates(QbBlueprint $bp, int $index, array $used): Collection
    {
        $rule = $bp->items()->get()->values()[$index] ?? abort(404);
        return $this->eligible($bp, $rule, array_map('intval', $used))->take(50)->map(fn ($q) => ['id' => $q->id, 'question_text' => $q->question_text])->values();
    }

    private function eligible(QbBlueprint $bp, $rule, array $used): Collection
    {
        $rows = QbQuestion::where('status', 'published')->where('qb_subject_id', $bp->qb_subject_id)->where('qb_question_type_id', $rule->qb_question_type_id)
            ->when($rule->qb_chapter_id, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->when($rule->qb_topic_id, fn ($q, $v) => $q->where('qb_topic_id', $v))
            ->when($rule->difficulty, fn ($q, $v) => $q->where('difficulty', $v))
            ->when($bp->qb_class_level_id, fn ($q, $v) => $q->whereHas('classLevels', fn ($c) => $c->where('qb_class_levels.id', $v)))
            ->whereNotIn('id', $used ?: [0])->orderBy('id')->limit(2000)->get(['id', 'qb_question_type_id', 'question_text']);
        $bought = QbUnlock::where('item_type', 'question')->whereIn('item_id', $rows->pluck('id'))->pluck('item_id')->map(fn ($v) => (int) $v)->flip();
        return $rows->filter(fn ($q) => $bought->has($q->id) || Money::toPaisa((string) ($this->pricing->quote('institution', 'question', $q)['price'] ?? '1')) === 0)->values();
    }
}
