<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\QbPriceRuleRequest;
use App\Models\{AuditLog, QbConcept, QbPrice, QbPriceRule, QbQuestion, QbResource};
use App\Services\QbPricingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

// QB.6 (D66, docs/modules/question-bank.md §4): the Super Admin's prices and rules on the central host. A price is never edited:
// a change is a new qb_prices row from a moment on (old purchases keep their price). A rule is never deleted: it is switched off
// (and its note / end time can change). The preview quotes sample items with a rule BEFORE it is saved (the rule is written in a
// transaction that is always rolled back).
class QbPricingController extends Controller
{
    public function __construct(private QbPricingService $pricing) {}

    /** GET /super/qb/prices: the price in force per (audience, kind, question type) and the history */
    public function prices()
    {
        $rows = QbPrice::orderByDesc('effective_from')->orderByDesc('id')->limit(500)->get();
        $current = $rows->filter(fn ($p) => $p->effective_from <= now())->unique(fn ($p) => "{$p->audience}|{$p->item_kind}|{$p->qb_question_type_id}")->values();
        $shape = fn ($p) => $p->only(['id', 'audience', 'item_kind', 'qb_question_type_id', 'amount']) + ['effective_from' => $p->effective_from?->toIso8601String()];
        return response()->json(['success' => true, 'data' => ['current' => $current->map($shape), 'history' => $rows->map($shape)]]);
    }

    /** POST /super/qb/prices {audience, item_kind, qb_question_type_id?, amount, effective_from?} */
    public function storePrice(Request $request)
    {
        $f = $request->validate([
            'audience' => 'required|in:institution,student',
            'item_kind' => 'required|in:question_answer,concept,resource_slide,resource_book,resource_pdf,quiz_package',
            'qb_question_type_id' => ['nullable', 'integer', Rule::requiredIf($request->input('item_kind') === 'question_answer'),
                Rule::prohibitedIf($request->input('item_kind') !== 'question_answer'), 'exists:qb_question_types,id'],
            'amount' => ['required', 'regex:/^\d{1,8}(\.\d{1,2})?$/'],
            'effective_from' => 'nullable|date|after_or_equal:' . now()->subMinute()->toDateTimeString(),     // never back-dated
        ]);
        $p = QbPrice::create(['effective_from' => $f['effective_from'] ?? now(), 'created_by' => $request->user()->id] + $f);   // the form sends null = now
        AuditLog::record('qb.price.created', $p, $p->only(['audience', 'item_kind', 'qb_question_type_id', 'amount']));
        return response()->json(['success' => true, 'data' => $p->fresh(), 'message' => __('messages.saved')], 201);
    }

    /** GET /super/qb/price-rules?active= */
    public function rules(Request $request)
    {
        $f = $request->validate(['active' => 'nullable|boolean']);
        $rows = QbPriceRule::when(array_key_exists('active', $f) && $f['active'] !== null, fn ($q) => $q->where('is_active', (bool) $f['active']))
            ->orderByDesc('is_active')->orderByDesc('id')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** POST /super/qb/price-rules */
    public function storeRule(QbPriceRuleRequest $request)
    {
        $r = QbPriceRule::create($this->rule($request) + ['created_by' => $request->user()->id]);
        AuditLog::record('qb.price_rule.created', $r, $r->only(['target_type', 'target_ref', 'audience', 'method', 'value']));
        return response()->json(['success' => true, 'data' => $r->fresh(), 'message' => __('messages.saved')], 201);
    }

    /** PUT /super/qb/price-rules/{id} {is_active?, ends_at?, note?, priority?}: the rule itself (target, method, value) never changes */
    public function updateRule(Request $request, int $id)
    {
        $f = $request->validate(['is_active' => 'sometimes|boolean', 'ends_at' => 'sometimes|nullable|date', 'note' => 'sometimes|nullable|string|max:250',
            'priority' => 'sometimes|integer|min:-1000|max:1000',
            'target_type' => 'prohibited', 'target_ref' => 'prohibited', 'method' => 'prohibited', 'value' => 'prohibited', 'audience' => 'prohibited']);
        $r = QbPriceRule::findOrFail($id);
        $r->update($f);
        AuditLog::record('qb.price_rule.updated', $r, $f);
        return response()->json(['success' => true, 'data' => $r->fresh(), 'message' => __('messages.saved')]);
    }

    /** POST /super/qb/price-rules/preview {rule..., audience_for: institution|student, items: [{type, id}]}: price with and without the rule */
    public function preview(QbPriceRuleRequest $request)
    {
        $f = $request->validate(['quote_audience' => 'required|in:institution,student', 'items' => 'required|array|min:1|max:20',
            'items.*.type' => 'required|in:question,concept,resource', 'items.*.id' => 'required|integer']);
        $models = ['question' => QbQuestion::class, 'concept' => QbConcept::class, 'resource' => QbResource::class];
        $items = collect($f['items'])->map(fn ($i) => [$i['type'], $models[$i['type']]::find($i['id'])]);
        if ($items->contains(fn ($i) => $i[1] === null)) throw ValidationException::withMessages(['items' => __('errors.qb_no_such_item')]);
        $before = $items->map(fn ($i) => $this->pricing->quote($f['quote_audience'], $i[0], $i[1]));
        DB::beginTransaction();
        try {
            $rule = QbPriceRule::create($this->rule($request) + ['created_by' => $request->user()->id]);
            $after = $items->map(function ($i) use ($f, $rule) {
                $q = $this->pricing->quote($f['quote_audience'], $i[0], $i[1]);
                $mine = $q['rule_id'] === $rule->id;
                return ['by_this_rule' => $mine, 'rule_id' => $mine ? null : $q['rule_id']] + $q;   // the unsaved rule has no id
            });
        } finally {
            DB::rollBack();                                                 // a preview never saves the rule
        }
        return response()->json(['success' => true, 'data' => $items->keys()->map(fn ($k) => ['type' => $items[$k][0], 'id' => $items[$k][1]->id,
            'before' => $before[$k], 'after' => $after[$k]])->values()]);
    }

    private function rule(QbPriceRuleRequest $request): array
    {
        $f = collect($request->validated())->only(['target_type', 'target_ref', 'audience', 'method', 'value', 'priority', 'starts_at', 'ends_at', 'note'])->all();
        return array_merge($f, ['target_ref' => $f['target_type'] === 'all' ? null : $f['target_ref'], 'value' => ($f['value'] ?? '') === '' ? null : $f['value'], 'is_active' => true]);
    }
}
