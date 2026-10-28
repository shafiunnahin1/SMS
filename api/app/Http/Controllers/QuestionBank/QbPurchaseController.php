<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbCurriculumNode, QbQuestion, QbUnlock, Teacher, User};
use App\Services\{InstitutionSettings, QbPurchaseService};
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;

// QB.7 (D66, docs/modules/question-bank.md §4, §5): the question bank on an institution's host for its head teacher and teachers.
// Questions are free to read without their answers (QbQuestionPublicResource); buying opens the answer and paper use for every
// teacher of this institution; the head teacher sees who spent what and sets the monthly caps.
class QbPurchaseController extends Controller
{
    public function __construct(private QbPurchaseService $purchases) {}

    /**
     * GET /question-bank/questions: qbank's All Questions list (D110/D133). Filters as qbank's sidebar, each one or many:
     * q, class_level_ids[], subject_ids[], chapter_ids[], topic_ids[], question_type_ids[], source_types[] (the occurrence's
     * exam type), years[] (the occurrence's year); the single qb_*_id keys still work. ?facets=1 adds the filter choices
     * (question types, source types, years). Each row carries its classes and sources; the answer only once bought.
     */
    public function questions(Request $request)
    {
        $this->staffGate($request);
        $ids = fn () => ['nullable', 'array', 'max:100'];
        $f = $request->validate(['qb_subject_id' => 'nullable|integer', 'qb_chapter_id' => 'nullable|integer', 'qb_topic_id' => 'nullable|integer',
            'qb_question_type_id' => 'nullable|integer', 'difficulty' => 'nullable|integer|min:1|max:5', 'q' => 'nullable|string|max:100', 'per_page' => 'nullable|integer|min:1|max:100',
            'class_level_ids' => $ids(), 'class_level_ids.*' => 'integer', 'subject_ids' => $ids(), 'subject_ids.*' => 'integer',
            'chapter_ids' => $ids(), 'chapter_ids.*' => 'integer', 'topic_ids' => $ids(), 'topic_ids.*' => 'integer',
            'curriculum_node_ids' => $ids(), 'curriculum_node_ids.*' => 'integer|distinct|exists:qb_curriculum_nodes,id',
            'question_type_ids' => $ids(), 'question_type_ids.*' => 'integer', 'source_types' => $ids(), 'source_types.*' => 'string|max:50',
            'years' => $ids(), 'years.*' => 'integer|min:1900|max:2100', 'facets' => 'nullable|boolean']);
        $many = fn (string $list, ?string $one) => array_values(array_unique(array_merge($f[$list] ?? [], isset($one, $f[$one]) ? [$f[$one]] : [])));
        $curriculumNodeIds = $this->curriculumFilterNodeIds($f['curriculum_node_ids'] ?? []);
        $page = QbQuestion::query()
            ->when($many('subject_ids', 'qb_subject_id'), fn ($q, $v) => $q->whereIn('qb_subject_id', $v))
            ->when($many('chapter_ids', 'qb_chapter_id'), fn ($q, $v) => $q->whereIn('qb_chapter_id', $v))
            ->when($many('topic_ids', 'qb_topic_id'), fn ($q, $v) => $q->whereIn('qb_topic_id', $v))
            ->when($curriculumNodeIds, fn ($q) => $q->whereHas('curriculumNodes', fn ($nodes) => $nodes->whereIn('qb_curriculum_nodes.id', $curriculumNodeIds)))
            ->when($many('question_type_ids', 'qb_question_type_id'), fn ($q, $v) => $q->whereIn('qb_question_type_id', $v))
            ->when($f['class_level_ids'] ?? null, fn ($q, $v) => $q->whereHas('classLevels', fn ($c) => $c->whereIn('qb_class_levels.id', $v)))
            ->when($f['source_types'] ?? null, fn ($q, $v) => $q->whereHas('occurrences', fn ($o) => $o->whereIn('exam_type', $v)))
            ->when($f['years'] ?? null, fn ($q, $v) => $q->whereHas('occurrences', fn ($o) => $o->whereIn('year', $v)))
            ->when($f['difficulty'] ?? null, fn ($q, $v) => $q->where('difficulty', $v))
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where('question_text', 'like', '%' . addcslashes($s, '%_\\') . '%'))
            ->with(['classLevels:id', 'occurrences'])
            ->orderByDesc('published_at')->orderByDesc('id')->paginate($f['per_page'] ?? 20);
        $open = QbUnlock::where('item_type', 'question')->whereIn('item_id', collect($page->items())->pluck('id'))->pluck('item_id')->map(fn ($v) => (int) $v)->all();
        $meta = ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()];
        if (!empty($f['facets'])) $meta['facets'] = [
            'question_types' => \App\Models\QbQuestionType::orderBy('id')->get(['id', 'slug', 'name_bn', 'name_en']),
            'source_types' => \App\Models\QbQuestionOccurrence::whereNotNull('exam_type')->distinct()->orderBy('exam_type')->pluck('exam_type')->values(),
            'years' => \App\Models\QbQuestionOccurrence::whereNotNull('year')->distinct()->orderByDesc('year')->pluck('year')->values(),
        ];
        return response()->json(['success' => true,
            'data' => collect($page->items())->map(fn ($q) => QbQuestionPublicResource::make($q, in_array($q->id, $open, true)) + [
                'class_level_ids' => $q->classLevels->pluck('id')->values()->all(),
                'sources' => $q->occurrences->map(fn ($o) => $o->only(['board', 'institution_name', 'exam_type', 'year']))->values()->all(),
            ])->values(),
            'meta' => $meta]);
    }

    /** GET /question-bank/questions/{id}: the question, its answer only once bought, and the price */
    public function question(Request $request, int $id)
    {
        $this->staffGate($request);
        $q = $this->purchases->item('question', $id);
        $open = QbUnlock::where('item_type', 'question')->where('item_id', $q->id)->exists();
        return response()->json(['success' => true, 'data' => QbQuestionPublicResource::make($q, $open) + ['quote' => $open ? null : $this->priceOnly($this->purchases->quote('question', $q))]]);
    }

    /** GET /question-bank/quote?item_type=&item_id= */
    public function quote(Request $request)
    {
        $this->staffGate($request);
        $f = $request->validate(['item_type' => 'required|in:question,concept,resource', 'item_id' => 'required|integer']);
        $item = $this->purchases->item($f['item_type'], (int) $f['item_id']);
        $open = QbUnlock::where('item_type', $f['item_type'])->where('item_id', $item->id)->exists();
        return response()->json(['success' => true, 'data' => ['unlocked' => $open] + $this->priceOnly($this->purchases->quote($f['item_type'], $item))
            + ['balance' => Money::format(Money::toPaisa((string) Tenancy::current()->fresh()->sms_balance))]]);
    }

    /** POST /question-bank/buy {item_type, item_id} */
    public function buy(Request $request)
    {
        $this->staffGate($request);
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
        $this->staffGate($request);
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

    /** A selected syllabus part includes questions linked to any descendant node. */
    private function curriculumFilterNodeIds(array $selected): array
    {
        $nodes = QbCurriculumNode::whereIn('id', $selected)->get(['id', 'qb_curriculum_version_id']);
        $allIds = $nodes->pluck('id')->map(fn ($id) => (int) $id)->all();
        $frontier = $nodes->groupBy('qb_curriculum_version_id')->map(fn ($rows) => $rows->pluck('id')->all());

        while ($frontier->isNotEmpty()) {
            $next = collect();
            foreach ($frontier as $versionId => $parentIds) {
                $children = QbCurriculumNode::where('qb_curriculum_version_id', $versionId)
                    ->whereIn('parent_id', $parentIds)->pluck('id')->map(fn ($id) => (int) $id);
                $allIds = [...$allIds, ...$children->all()];
                if ($children->isNotEmpty()) $next->put($versionId, $children->all());
            }
            $frontier = $next;
        }

        return array_values(array_unique($allIds));
    }

    /** D101: department staff need their X-Department-Id context and this route's exact duty key on every request */
    private function staffGate(Request $request): void
    {
        if ($request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
    }
}
