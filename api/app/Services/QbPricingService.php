<?php

namespace App\Services;

use App\Models\{QbConcept, QbPrice, QbPriceRule, QbQuestion, QbResource};
use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

// QB.6 (D66, docs/modules/question-bank.md §4.1-§4.3): what an item costs a buyer, decided on the server only (G9).
//   base  = the newest qb_prices row in force for (audience, item kind[, question type]); no row = not for sale (price null)
//   rules = active qb_price_rules for the audience (or both), inside their time window, whose target covers the item
// Precedence (§4.3): (1) a free method that applies wins (free; first_n_items_free when the item is among the collection's first
// N; free_for_class_level when the buyer is of that class; free_first_n_per_buyer while the buyer has used it fewer than N times);
// (2) otherwise one price rule wins - the most specific target (item > topic > chapter > subject > class > question type /
// resource kind / package > all), then the higher priority, then fixed_price > percent_off > amount_off, then the newest;
// (3) the result never goes below 0, in paisa, half up. first_n_pages_free never changes the price: it says how many pages
// of a book / PDF / slides are free to read (free_pages).
final class QbPricingService
{
    public const KINDS = ['question' => 'question_answer', 'concept' => 'concept', 'quiz_package' => 'quiz_package'];
    private const RANK = ['item' => 1, 'topic' => 2, 'chapter' => 3, 'subject' => 4, 'class_level' => 5, 'question_type' => 6, 'resource_kind' => 6, 'quiz_package' => 6, 'all' => 7];
    private const FREE = ['free', 'first_n_items_free', 'free_for_class_level', 'free_first_n_per_buyer'];
    private const PRICE_ORDER = ['fixed_price' => 0, 'percent_off' => 1, 'amount_off' => 2];

    /**
     * @param string $audience institution | student
     * @param string $type     question | concept | resource | quiz_package
     * @param array  $buyer    class_level_ids => int[] (the buyer's classes), uses => fn(int $ruleId): int (how often this buyer
     *                         already used a per-buyer rule; without it such a rule never applies)
     * @return array{base: ?string, price: ?string, rule_id: ?int, method: ?string, free_pages: ?int}
     */
    public function quote(string $audience, string $type, Model $item, array $buyer = [], ?\DateTimeInterface $at = null): array
    {
        $at ??= now();
        $base = $this->base($audience, $type, $item, $at);
        $rules = $this->rules($audience, $type, $item, $buyer, $at);

        $freePages = $rules->where('method', 'first_n_pages_free')->max(fn ($r) => (int) $r->value);
        $out = ['base' => $base === null ? null : Money::format($base), 'price' => null, 'rule_id' => null, 'method' => null, 'free_pages' => $freePages ?: null];

        $free = $rules->filter(fn ($r) => in_array($r->method, self::FREE, true) && $this->freeApplies($r, $type, $item, $buyer));
        if ($free->isNotEmpty()) {
            $r = $this->winner($free);
            return ['price' => '0.00', 'rule_id' => $r->id, 'method' => $r->method] + $out;
        }
        if ($base === null) return $out;                                    // no price set: not for sale

        $priced = $rules->filter(fn ($r) => isset(self::PRICE_ORDER[$r->method]) && $r->value !== null);
        if ($priced->isEmpty()) return ['price' => Money::format($base)] + $out;
        $r = $this->winner($priced);
        $v = Money::toPaisa((string) $r->value);
        $paisa = match ($r->method) {
            'fixed_price' => $v,
            'percent_off' => Money::ratio($base, 10000 - min($v, 10000), 10000),      // value in percent, two decimals
            'amount_off' => $base - $v,
        };
        return ['price' => Money::format(max(0, $paisa)), 'rule_id' => $r->id, 'method' => $r->method] + $out;
    }

    /** The newest price row in force, in paisa */
    private function base(string $audience, string $type, Model $item, \DateTimeInterface $at): ?int
    {
        $kind = $type === 'resource' ? 'resource_' . $item->kind : self::KINDS[$type];
        $row = QbPrice::where('audience', $audience)->where('item_kind', $kind)->where('effective_from', '<=', $at)
            ->when($type === 'question', fn ($q) => $q->where('qb_question_type_id', $item->qb_question_type_id))
            ->orderByDesc('effective_from')->orderByDesc('id')->first();
        return $row ? Money::toPaisa((string) $row->amount) : null;
    }

    /** The rules that can apply to this item for this audience at $at, each with its specificity rank */
    private function rules(string $audience, string $type, Model $item, array $buyer, \DateTimeInterface $at): Collection
    {
        $targets = $this->targets($type, $item);
        return QbPriceRule::where('is_active', true)->whereIn('audience', [$audience, 'both'])
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $at))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $at))
            ->get()
            ->filter(function ($r) use ($targets, $buyer) {
                if ($r->method === 'free_for_class_level') {                // the BUYER's class, whatever the item
                    return $r->target_type === 'class_level' && in_array((int) $r->target_ref, array_map('intval', $buyer['class_level_ids'] ?? []), true);
                }
                return in_array((string) $r->target_ref, $targets[$r->target_type] ?? [], true) || ($r->target_type === 'all');
            })
            ->each(fn ($r) => $r->rank = self::RANK[$r->target_type])
            ->values();
    }

    /** target_type => the refs this item matches */
    private function targets(string $type, Model $item): array
    {
        $t = ['item' => ["{$type}:{$item->id}"]];
        if ($type === 'quiz_package') return $t + ['quiz_package' => [(string) $item->id]];
        $topic = $item->qb_topic_id ?? null;
        $chapter = $item->qb_chapter_id ?? null;
        $subject = $item->qb_subject_id ?? null;
        if ($item instanceof QbConcept && $topic) {                           // a concept names only its topic
            $tp = \App\Models\QbTopic::find($topic);
            $chapter = $tp?->qb_chapter_id;
            $subject = $chapter ? \App\Models\QbChapter::find($chapter)?->qb_subject_id : null;
        }
        if ($item instanceof QbResource && !$subject) {                      // filed under a topic or a chapter: its parents count too
            if ($topic) $chapter = \App\Models\QbTopic::find($topic)?->qb_chapter_id;
            if ($chapter) $subject = \App\Models\QbChapter::find($chapter)?->qb_subject_id;
        }
        $t += array_filter(['topic' => $topic ? [(string) $topic] : null, 'chapter' => $chapter ? [(string) $chapter] : null, 'subject' => $subject ? [(string) $subject] : null]);
        if ($item instanceof QbQuestion) {
            $t['question_type'] = [(string) $item->qb_question_type_id];
            $t['class_level'] = $item->classLevels()->pluck('qb_class_levels.id')->map(fn ($v) => (string) $v)->all();
        }
        if ($item instanceof QbResource) $t['resource_kind'] = [$item->kind];
        return $t;
    }

    private function freeApplies(QbPriceRule $r, string $type, Model $item, array $buyer): bool
    {
        return match ($r->method) {
            'free', 'free_for_class_level' => true,
            'first_n_items_free' => $r->value !== null && $this->amongFirst($r, $type, $item, (int) $r->value),
            'free_first_n_per_buyer' => $r->value !== null && isset($buyer['uses']) && ($buyer['uses'])($r->id) < (int) $r->value,
            default => false,
        };
    }

    /** Is the item among the first N published items of the rule's collection (by sort order where the item has one, then id)? */
    private function amongFirst(QbPriceRule $r, string $type, Model $item, int $n): bool
    {
        if ($n <= 0 || in_array($r->target_type, ['item', 'class_level', 'quiz_package'], true) || $type === 'quiz_package') return false;
        $model = $item::class;
        $q = $model::query()->where('status', 'published');
        $ref = $r->target_ref;
        match ($r->target_type) {
            'topic' => $q->where('qb_topic_id', $ref),
            'chapter' => $item instanceof QbConcept ? $q->whereIn('qb_topic_id', \App\Models\QbTopic::where('qb_chapter_id', $ref)->pluck('id')) : $q->where('qb_chapter_id', $ref),
            'subject' => $item instanceof QbConcept
                ? $q->whereIn('qb_topic_id', \App\Models\QbTopic::whereIn('qb_chapter_id', \App\Models\QbChapter::where('qb_subject_id', $ref)->pluck('id'))->pluck('id'))
                : $q->where('qb_subject_id', $ref),
            'question_type' => $q->where('qb_question_type_id', $ref),
            'resource_kind' => $q->where('kind', $ref),
            default => null,                                                // all: every published item of this type
        };
        if ($item instanceof QbConcept) $q->orderBy('sort_order');
        return $q->orderBy('id')->limit($n)->pluck('id')->contains($item->id);
    }

    /** Most specific target, then higher priority, then fixed > percent > amount, then the newest rule */
    private function winner(Collection $rules): QbPriceRule
    {
        return $rules->sort(fn ($a, $b) => [$a->rank, -$a->priority, self::PRICE_ORDER[$a->method] ?? 0, -$a->id]
            <=> [$b->rank, -$b->priority, self::PRICE_ORDER[$b->method] ?? 0, -$b->id])->first();
    }
}
