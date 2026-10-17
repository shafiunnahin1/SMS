<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Resources\QbContentPublicResource;
use App\Models\{QbConcept, QbResource, QbUnlock};
use Illuminate\Http\Request;

// QB.5 (D65, docs/modules/question-bank.md §2, §5): an institution's teachers (and the head teacher) read the platform's published
// concepts and resources on their own host. The catalogue scope shows them only published rows (a draft is a 404); the body of a
// concept and the file of a resource come only once this institution has it in qb_unlocks (QbContentPublicResource). Buying is
// QB.7, prices and free rules QB.6.
class QbLibraryController extends Controller
{
    /** GET /question-bank/curriculum: the class → subject → chapter → topic tree */
    public function curriculum()
    {
        return response()->json(['success' => true, 'data' => QbCurriculumController::treeData()]);
    }

    /** GET /question-bank/concepts?qb_topic_id=: a topic's published concepts (titles; unlocked ones say so) */
    public function concepts(Request $request)
    {
        $f = $request->validate(['qb_topic_id' => 'required|integer']);
        $rows = QbConcept::where('qb_topic_id', $f['qb_topic_id'])->orderBy('sort_order')->orderBy('id')->limit(500)->get();
        $open = $this->unlocked('concept', $rows->pluck('id')->all());
        return response()->json(['success' => true, 'data' => $rows->map(fn ($c) => QbContentPublicResource::concept($c, in_array($c->id, $open, true), full: false))->values()]);
    }

    /** GET /question-bank/concepts/{id} */
    public function concept(int $id)
    {
        $c = QbConcept::findOrFail($id);
        return response()->json(['success' => true, 'data' => QbContentPublicResource::concept($c, $this->unlocked('concept', [$c->id]) !== [])]);
    }

    /** GET /question-bank/resources?kind=&qb_subject_id=&qb_chapter_id=&qb_topic_id=: the published resources filed at that place */
    public function resources(Request $request)
    {
        $f = $request->validate(['kind' => 'nullable|in:slide,book,pdf', 'qb_subject_id' => 'nullable|integer', 'qb_chapter_id' => 'nullable|integer', 'qb_topic_id' => 'nullable|integer']);
        $rows = QbResource::query()
            ->when($f['kind'] ?? null, fn ($q, $v) => $q->where('kind', $v))
            ->when($f['qb_subject_id'] ?? null, fn ($q, $v) => $q->where('qb_subject_id', $v))
            ->when($f['qb_chapter_id'] ?? null, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->when($f['qb_topic_id'] ?? null, fn ($q, $v) => $q->where('qb_topic_id', $v))
            ->orderByDesc('id')->limit(500)->get();
        $open = $this->unlocked('resource', $rows->pluck('id')->all());
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => QbContentPublicResource::resource($r, in_array($r->id, $open, true), full: false))->values()]);
    }

    /** GET /question-bank/resources/{id}: the preview pages always; the PDF only once unlocked */
    public function resource(int $id)
    {
        $r = QbResource::findOrFail($id);
        return response()->json(['success' => true, 'data' => QbContentPublicResource::resource($r, $this->unlocked('resource', [$r->id]) !== [])]);
    }

    /** Which of these items this institution has (qb_unlocks is tenant-bound: only its own rows) */
    private function unlocked(string $type, array $ids): array
    {
        return $ids ? QbUnlock::where('item_type', $type)->whereIn('item_id', $ids)->pluck('item_id')->map(fn ($v) => (int) $v)->all() : [];
    }
}
