<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\QbConceptRequest;
use App\Models\{QbConcept, User};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// QB.5 (D65, docs/modules/question-bank.md §3গ, §5): a topic's concept in the writers' panel - written by a writer, reviewed like
// a question (ReviewsQbContent). Institutions read published concepts through QbLibraryController, the body only once unlocked.
class QbConceptController extends Controller
{
    use ReviewsQbContent;

    private const MODEL = QbConcept::class;
    private const AUDIT = 'qb.concept';

    /** GET /writer/concepts?status=&q=: a writer's own; moderators and the Super Admin see all */
    public function index(Request $request)
    {
        return response()->json($this->page($this->visible($request->user()), $request,
            ['id', 'qb_topic_id', 'title_bn', 'title_en', 'status', 'review_note', 'created_by']));
    }

    /** POST /writer/concepts: a new draft (writers and the Super Admin) */
    public function store(QbConceptRequest $request)
    {
        $user = $request->user();
        abort_if($user->role === 'content_moderator', 403);
        $in = $request->validated();
        $c = DB::transaction(function () use ($in, $user) {
            $c = QbConcept::create(collect($in)->except('media_ids')->all() + ['status' => 'draft', 'created_by' => $user->id]);
            $this->pictures($c, $in, $user);
            return $c;
        });
        return response()->json(['success' => true, 'data' => $this->row($c->fresh()), 'message' => __('messages.saved')], 201);
    }

    /** GET /writer/concepts/{id} */
    public function show(Request $request, int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row($this->find($request->user(), $id))]);
    }

    /** PUT /writer/concepts/{id}: the writer, only while draft or rejected; the Super Admin at any time */
    public function update(QbConceptRequest $request, int $id)
    {
        $user = $request->user();
        $in = $request->validated();
        $c = DB::transaction(function () use ($user, $id, $in) {
            $c = $this->editable($user, $id);
            $c->update(collect($in)->except('media_ids')->all());
            $this->pictures($c, $in, $user);
            return $c;
        });
        return response()->json(['success' => true, 'data' => $this->row($c->fresh()), 'message' => __('messages.saved')]);
    }

    private function pictures(QbConcept $c, array $in, User $user): void
    {
        if (!array_key_exists('media_ids', $in)) return;
        $this->ownMedia($in['media_ids'], $c->media()->pluck('qb_media.id')->all(), $user, 'media_ids');
        $c->media()->sync($in['media_ids']);
    }

    private function row(QbConcept $c): array
    {
        return $c->only(['id', 'qb_topic_id', 'title_bn', 'title_en', 'body_text', 'body_json', 'sort_order', 'status', 'review_note', 'created_by', 'reviewed_by'])
            + ['updated_at' => $c->updated_at?->toIso8601String(), 'media_ids' => $c->media()->pluck('qb_media.id')->all(),
                'media' => $c->media()->get()->map(fn ($m) => QbMediaController::view($m))->values()->all()];
    }
}
