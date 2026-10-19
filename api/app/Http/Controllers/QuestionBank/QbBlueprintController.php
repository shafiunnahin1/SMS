<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, QbBlueprint, QbBlueprintItem};
use App\Services\QbBlueprintPlanner;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// D126 (3), R2.1.5: qbank's assessment blueprints. The Super Admin writes them on the central host (rules: section, type, count,
// marks each, optional chapter / topic / difficulty; the total is summed by the server). On an institution's host the head teacher
// and teachers list the active ones, get a paper plan (what each rule found, and what is short) and, to swap a picked question,
// the rule's other eligible questions; the paper itself is then saved through QB.8 (purchase confirmation included).
class QbBlueprintController extends Controller
{
    /** GET /super/qb/blueprints */
    public function index()
    {
        return response()->json(['success' => true, 'data' => QbBlueprint::with('items')->orderByDesc('id')->get()->map(fn ($b) => $this->view($b))->values()]);
    }

    /** POST /super/qb/blueprints */
    public function store(Request $request)
    {
        $in = $this->validated($request);
        $bp = DB::transaction(function () use ($in, $request) {
            $bp = QbBlueprint::create(collect($in)->except('items')->all() + ['created_by' => $request->user()->id]);
            $this->items($bp, $in['items']);
            return $bp;
        });
        AuditLog::record('qb.blueprint.created', $bp, ['total_marks' => $bp->fresh()->total_marks]);
        return response()->json(['success' => true, 'data' => $this->view($bp->fresh('items'))], 201);
    }

    /** PUT /super/qb/blueprints/{id}: the whole blueprint again (rules replaced) */
    public function update(Request $request, int $id)
    {
        $bp = QbBlueprint::findOrFail($id);
        $in = $this->validated($request);
        DB::transaction(function () use ($bp, $in) {
            $bp->update(collect($in)->except('items')->all());
            QbBlueprintItem::where('qb_blueprint_id', $bp->id)->delete();
            $this->items($bp, $in['items']);
        });
        return response()->json(['success' => true, 'data' => $this->view($bp->fresh('items'))]);
    }

    /** DELETE /super/qb/blueprints/{id}: papers made from it keep their questions (a paper never points at its blueprint) */
    public function destroy(int $id)
    {
        QbBlueprint::findOrFail($id)->delete();
        return response()->json(['success' => true]);
    }

    /** GET /question-bank/blueprints?qb_subject_id= : the active ones */
    public function available(Request $request)
    {
        $f = $request->validate(['qb_subject_id' => 'nullable|integer']);
        $rows = QbBlueprint::with('items')->where('is_active', true)->when($f['qb_subject_id'] ?? null, fn ($q, $v) => $q->where('qb_subject_id', $v))->orderBy('name_bn')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($b) => $this->view($b))->values()]);
    }

    /** POST /question-bank/blueprints/{id}/plan {exclude_ids?}: the paper plan - picked questions per section, wanted/found/short per rule */
    public function plan(Request $request, int $id, QbBlueprintPlanner $planner)
    {
        $bp = QbBlueprint::where('is_active', true)->findOrFail($id);
        $in = $request->validate(['exclude_ids' => 'nullable|array|max:500', 'exclude_ids.*' => 'integer']);
        return response()->json(['success' => true, 'data' => ['blueprint' => $this->view($bp->load('items'))] + $planner->plan($bp, $in['exclude_ids'] ?? [])]);
    }

    /** GET /question-bank/blueprints/{id}/candidates?rule=&used[]= : other eligible questions for one rule (to swap a picked one) */
    public function candidates(Request $request, int $id, QbBlueprintPlanner $planner)
    {
        $bp = QbBlueprint::where('is_active', true)->findOrFail($id);
        $in = $request->validate(['rule' => 'required|integer|min:0', 'used' => 'nullable|array|max:500', 'used.*' => 'integer']);
        return response()->json(['success' => true, 'data' => $planner->candidates($bp, (int) $in['rule'], $in['used'] ?? [])]);
    }

    private function validated(Request $request): array
    {
        $in = $request->validate([
            'name_bn' => 'required|string|max:200', 'name_en' => 'nullable|string|max:200',
            'qb_class_level_id' => 'nullable|integer|exists:qb_class_levels,id', 'qb_subject_id' => 'required|integer|exists:qb_subjects,id',
            'exam_type' => 'nullable|string|max:50', 'duration_minutes' => 'nullable|integer|min:1|max:600', 'is_active' => 'sometimes|boolean',
            'items' => 'required|array|min:1|max:60',
            'items.*.section_title' => 'required|string|max:200',
            'items.*.qb_question_type_id' => 'required|integer|exists:qb_question_types,id',
            'items.*.question_count' => 'required|integer|min:1|max:200',
            'items.*.marks_each' => ['required', 'regex:/^\d{1,3}(\.\d{1,2})?$/'],
            'items.*.qb_chapter_id' => 'nullable|integer|exists:qb_chapters,id',
            'items.*.qb_topic_id' => 'nullable|integer|exists:qb_topics,id',
            'items.*.difficulty' => 'nullable|integer|min:1|max:5',
            'total_marks' => 'prohibited',
        ]);
        $total = collect($in['items'])->sum(fn ($i) => Money::toPaisa((string) $i['marks_each']) * (int) $i['question_count']);   // the server sums
        return $in + ['total_marks' => Money::format($total)];
    }

    private function items(QbBlueprint $bp, array $items): void
    {
        foreach (array_values($items) as $k => $i) QbBlueprintItem::create(['qb_blueprint_id' => $bp->id, 'sort_order' => $k] + collect($i)->only(['section_title',
            'qb_question_type_id', 'question_count', 'marks_each', 'qb_chapter_id', 'qb_topic_id', 'difficulty'])->all());
    }

    private function view(QbBlueprint $b): array
    {
        return $b->only(['id', 'name_bn', 'name_en', 'qb_class_level_id', 'qb_subject_id', 'exam_type', 'total_marks', 'duration_minutes', 'is_active'])
            + ['items' => $b->items->map(fn ($i) => $i->only(['section_title', 'qb_question_type_id', 'question_count', 'marks_each', 'qb_chapter_id', 'qb_topic_id', 'difficulty']))->values()];
    }
}
