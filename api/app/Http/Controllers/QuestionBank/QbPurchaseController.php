<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbQuestion, QbUnlock, Teacher, User};
use App\Services\{InstitutionSettings, QbPurchaseService};
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;

// QB.7 (D66, docs/modules/question-bank.md §4, §5): the question bank on an institution's host for its head teacher and teachers.
// Questions are free to read without their answers (QbQuestionPublicResource); buying opens the answer and paper use for every
// teacher of this institution; the head teacher sees who spent what and sets the monthly caps.
class QbPurchaseController extends Controller
{
    public function __construct(private QbPurchaseService $purchases) {}

    /** GET /question-bank/questions?qb_subject_id=&qb_chapter_id=&qb_topic_id=&qb_question_type_id=&difficulty=&q=&page= */
    public function questions(Request $request)
    {
        $f = $request->validate(['qb_subject_id' => 'nullable|integer', 'qb_chapter_id' => 'nullable|integer', 'qb_topic_id' => 'nullable|integer',
            'qb_question_type_id' => 'nullable|integer', 'difficulty' => 'nullable|integer|min:1|max:5', 'q' => 'nullable|string|max:100', 'per_page' => 'nullable|integer|min:1|max:50']);
        $page = QbQuestion::query()
            ->when($f['qb_subject_id'] ?? null, fn ($q, $v) => $q->where('qb_subject_id', $v))
            ->when($f['qb_chapter_id'] ?? null, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->when($f['qb_topic_id'] ?? null, fn ($q, $v) => $q->where('qb_topic_id', $v))
            ->when($f['qb_question_type_id'] ?? null, fn ($q, $v) => $q->where('qb_question_type_id', $v))
            ->when($f['difficulty'] ?? null, fn ($q, $v) => $q->where('difficulty', $v))
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where('question_text', 'like', '%' . addcslashes($s, '%_\\') . '%'))
            ->orderByDesc('published_at')->orderByDesc('id')->paginate($f['per_page'] ?? 20);
        $open = QbUnlock::where('item_type', 'question')->whereIn('item_id', collect($page->items())->pluck('id'))->pluck('item_id')->map(fn ($v) => (int) $v)->all();
        return response()->json(['success' => true,
            'data' => collect($page->items())->map(fn ($q) => QbQuestionPublicResource::make($q, in_array($q->id, $open, true)))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]]);
    }

    /** GET /question-bank/questions/{id}: the question, its answer only once bought, and the price */
    public function question(int $id)
    {
        $q = $this->purchases->item('question', $id);
        $open = QbUnlock::where('item_type', 'question')->where('item_id', $q->id)->exists();
        return response()->json(['success' => true, 'data' => QbQuestionPublicResource::make($q, $open) + ['quote' => $open ? null : $this->priceOnly($this->purchases->quote('question', $q))]]);
    }

    /** GET /question-bank/quote?item_type=&item_id= */
    public function quote(Request $request)
    {
        $f = $request->validate(['item_type' => 'required|in:question,concept,resource', 'item_id' => 'required|integer']);
        $item = $this->purchases->item($f['item_type'], (int) $f['item_id']);
        $open = QbUnlock::where('item_type', $f['item_type'])->where('item_id', $item->id)->exists();
        return response()->json(['success' => true, 'data' => ['unlocked' => $open] + $this->priceOnly($this->purchases->quote($f['item_type'], $item))
            + ['balance' => Money::format(Money::toPaisa((string) Tenancy::current()->fresh()->sms_balance))]]);
    }

    /** POST /question-bank/buy {item_type, item_id} */
    public function buy(Request $request)
    {
        $f = $request->validate(['item_type' => 'required|in:question,concept,resource', 'item_id' => 'required|integer', 'price' => 'prohibited', 'amount' => 'prohibited']);
        $r = $this->purchases->buy($request->user(), $f['item_type'], (int) $f['item_id']);
        return response()->json(['success' => true, 'data' => ['item_type' => $r['unlock']->item_type, 'item_id' => (int) $r['unlock']->item_id,
            'charged' => $r['charged'], 'already_owned' => $r['already'], 'reason' => $r['unlock']->reason,
            'balance' => Money::format(Money::toPaisa((string) Tenancy::current()->fresh()->sms_balance))], 'message' => __('messages.saved')], $r['already'] ? 200 : 201);
    }

    /** POST /question-bank/buy-many {question_ids}: a paper's not-yet-bought questions, after the teacher confirmed the total. Each is
     *  its own purchase (already owned ones cost nothing); the first refusal (402 / 422) stops the rest, the ones before it stay bought. */
    public function buyMany(Request $request)
    {
        $f = $request->validate(['question_ids' => 'required|array|min:1|max:100', 'question_ids.*' => 'integer|distinct', 'price' => 'prohibited', 'amount' => 'prohibited']);
        $charged = 0;
        foreach ($f['question_ids'] as $id) $charged += Money::toPaisa($this->purchases->buy($request->user(), 'question', (int) $id)['charged']);
        return response()->json(['success' => true, 'data' => ['charged' => Money::format($charged), 'count' => count($f['question_ids']),
            'balance' => Money::format(Money::toPaisa((string) Tenancy::current()->fresh()->sms_balance))], 'message' => __('messages.saved')]);
    }

    /** GET /question-bank/spending?from=&to= (admin): per person who bought - total, count, by item type; the caps */
    public function spending(Request $request)
    {
        $f = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from']);
        $from = isset($f['from']) ? \Carbon\Carbon::parse($f['from'])->startOfDay() : now()->startOfMonth();
        $to = isset($f['to']) ? \Carbon\Carbon::parse($f['to'])->endOfDay() : now()->endOfDay();
        $rows = QbUnlock::whereBetween('created_at', [$from, $to])->get(['unlocked_by', 'item_type', 'price']);
        $users = User::whereIn('id', $rows->pluck('unlocked_by')->unique())->get(['id', 'name', 'role'])->keyBy('id');
        $teachers = Teacher::whereIn('user_id', $users->keys())->get(['id', 'user_id', 'qb_monthly_cap'])->keyBy('user_id');
        $i = Tenancy::current();
        $data = $rows->groupBy('unlocked_by')->map(fn ($g, $uid) => [
            'user_id' => (int) $uid, 'name' => $users[$uid]->name ?? null, 'role' => $users[$uid]->role ?? null,
            'total' => Money::format($g->sum(fn ($r) => Money::toPaisa((string) $r->price))), 'count' => $g->count(),
            'by_type' => $g->groupBy('item_type')->map(fn ($t) => ['count' => $t->count(), 'total' => Money::format($t->sum(fn ($r) => Money::toPaisa((string) $r->price)))]),
            'teacher_id' => $teachers[$uid]->id ?? null, 'cap' => $teachers[$uid]->qb_monthly_cap ?? null,
        ])->sortByDesc(fn ($r) => Money::toPaisa($r['total']))->values();
        return response()->json(['success' => true, 'data' => $data, 'meta' => ['from' => $from->toDateString(), 'to' => $to->toDateString(),
            'default_cap' => ($i->settings ?? [])['qb_teacher_monthly_cap'] ?? null,
            'total' => Money::format($rows->sum(fn ($r) => Money::toPaisa((string) $r->price)))]]);
    }

    /** PUT /question-bank/caps {default_cap?, teachers?: [{id (teacher id), cap|null}]} (admin) */
    public function caps(Request $request, InstitutionSettings $settings)
    {
        $f = $request->validate(['default_cap' => ['sometimes', 'nullable', 'regex:/^\d{1,8}(\.\d{1,2})?$/'],
            'teachers' => 'sometimes|array|max:500', 'teachers.*.id' => 'required|integer', 'teachers.*.cap' => ['present', 'nullable', 'regex:/^\d{1,8}(\.\d{1,2})?$/']]);
        $i = Tenancy::current();
        if (array_key_exists('default_cap', $f)) $settings->merge($i, ['qb_teacher_monthly_cap' => $f['default_cap'] === null ? null : Money::format(Money::toPaisa((string) $f['default_cap']))]);
        foreach ($f['teachers'] ?? [] as $t) {
            Teacher::findOrFail($t['id'])->forceFill(['qb_monthly_cap' => $t['cap']])->save();         // another institution's teacher: 404
        }
        \App\Models\AuditLog::record('qb.caps.updated', $i, $f);
        return response()->json(['success' => true, 'message' => __('messages.saved')]);
    }

    private function priceOnly(array $q): array
    {
        return ['price' => $q['price'], 'base' => $q['base'], 'free_pages' => $q['free_pages']];
    }
}
