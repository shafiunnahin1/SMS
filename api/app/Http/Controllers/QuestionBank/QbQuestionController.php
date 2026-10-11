<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\QbQuestionRequest;
use App\Models\{AuditLog, QbChapter, QbQuestion, QbQuestionRevision, QbQuestionType, QbTopic, User};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// QB.2 (D65, docs/modules/question-bank.md §1, §3খ): the writers' panel on the central host. A writer (content_writer) writes
// questions and sees only their own; they edit a question only while it is a draft or came back rejected, then submit it for
// review. A moderator (content_moderator) publishes or rejects (with the reason) what is in review and edits nothing. The Super
// Admin may do all of it. Every save stores a qb_question_revisions snapshot; every status move is in the audit log.
class QbQuestionController extends Controller
{
    private const EDITABLE = ['draft', 'rejected'];

    /** GET /writer/curriculum: the class → subject → chapter → topic tree to file a question under */
    public function curriculum()
    {
        return response()->json(['success' => true, 'data' => QbCurriculumController::treeData()]);
    }

    /** GET /writer/question-types: the active types */
    public function types()
    {
        return response()->json(['success' => true, 'data' => QbQuestionType::where('is_active', true)->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'slug', 'name_bn', 'name_en', 'family'])]);
    }

    /** GET /writer/questions?status=&qb_subject_id=&q=: a writer's own; moderators and the Super Admin see all */
    public function index(Request $request)
    {
        $f = $request->validate(['status' => 'nullable|in:draft,review,published,rejected', 'qb_subject_id' => 'nullable|integer',
            'q' => 'nullable|string|max:100', 'per_page' => 'nullable|integer|min:1|max:100']);
        $page = $this->visible($request->user())
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['qb_subject_id'] ?? null, fn ($q, $s) => $q->where('qb_subject_id', $s))
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where('question_text', 'like', '%' . addcslashes($s, '%_\\') . '%'))
            ->orderByDesc('updated_at')->orderByDesc('id')->paginate($f['per_page'] ?? 25);
        $authors = User::platform()->whereIn('id', collect($page->items())->pluck('created_by')->unique())->pluck('name', 'id');
        return response()->json(['success' => true,
            'data' => collect($page->items())->map(fn ($q) => $this->row($q) + ['author' => $authors[$q->created_by] ?? null])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]]);
    }

    /** POST /writer/questions: a new draft (writers and the Super Admin; a moderator only reviews) */
    public function store(QbQuestionRequest $request)
    {
        $user = $request->user();
        abort_if($user->role === 'content_moderator', 403);
        $in = $this->placed($request->validated());
        $q = DB::transaction(function () use ($in, $user) {
            $q = QbQuestion::create(collect($in)->except('class_level_ids')->all() + ['status' => 'draft', 'created_by' => $user->id]);
            if (array_key_exists('class_level_ids', $in)) $q->classLevels()->sync($in['class_level_ids']);
            $this->revision($q, $user);
            return $q;
        });
        return response()->json(['success' => true, 'data' => $this->row($q->fresh()), 'message' => __('messages.saved')], 201);
    }

    /** GET /writer/questions/{id} */
    public function show(Request $request, int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row($this->find($request->user(), $id))]);
    }

    /** PUT /writer/questions/{id}: the writer, only while draft or rejected; the Super Admin at any time */
    public function update(QbQuestionRequest $request, int $id)
    {
        $user = $request->user();
        abort_if($user->role === 'content_moderator', 403);
        $in = $request->validated();
        $q = DB::transaction(function () use ($user, $id, $in) {
            $q = $this->find($user, $id, lock: true);
            if ($user->role !== 'super_admin' && !in_array($q->status, self::EDITABLE, true)) {
                throw new BusinessException('only a draft or a rejected question can be edited', 'qb_wrong_status', 422);
            }
            $in = $this->placed($in + $q->only(['qb_subject_id', 'qb_chapter_id', 'qb_topic_id']));
            $q->update(collect($in)->except('class_level_ids')->all());
            if (array_key_exists('class_level_ids', $in)) $q->classLevels()->sync($in['class_level_ids']);
            $this->revision($q, $user);
            return $q;
        });
        return response()->json(['success' => true, 'data' => $this->row($q->fresh()), 'message' => __('messages.saved')]);
    }

    /** GET /writer/questions/{id}/revisions: newest first */
    public function revisions(Request $request, int $id)
    {
        $q = $this->find($request->user(), $id);
        $rows = QbQuestionRevision::where('qb_question_id', $q->id)->orderByDesc('id')->limit(100)->get();
        $editors = User::platform()->whereIn('id', $rows->pluck('edited_by')->unique())->pluck('name', 'id');
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => ['id' => $r->id, 'edited_by' => $editors[$r->edited_by] ?? null,
            'created_at' => $r->created_at?->toIso8601String(), 'snapshot' => $r->snapshot])->values()]);
    }

    /** POST /writer/questions/{id}/submit: draft | rejected -> review (the author, or the Super Admin) */
    public function submit(Request $request, int $id)
    {
        $user = $request->user();
        abort_if($user->role === 'content_moderator', 403);
        return $this->move($user, $id, self::EDITABLE, 'review', 'qb.question.submitted', fn ($q) => ['review_note' => null]);
    }

    /** POST /writer/questions/{id}/publish: review -> published (moderator, Super Admin) */
    public function publish(Request $request, int $id)
    {
        return $this->move($request->user(), $id, ['review'], 'published', 'qb.question.published',
            fn ($q) => ['reviewed_by' => $request->user()->id, 'published_at' => now(), 'review_note' => null]);
    }

    /** POST /writer/questions/{id}/reject {reason}: review -> rejected; the reason goes back to the writer */
    public function reject(Request $request, int $id)
    {
        $f = $request->validate(['reason' => 'required|string|min:3|max:500']);
        return $this->move($request->user(), $id, ['review'], 'rejected', 'qb.question.rejected',
            fn ($q) => ['reviewed_by' => $request->user()->id, 'review_note' => $f['reason']]);
    }

    private function move(User $user, int $id, array $from, string $to, string $action, \Closure $extra)
    {
        $q = DB::transaction(function () use ($user, $id, $from, $to, $action, $extra) {
            $q = $this->find($user, $id, lock: true);
            if (!in_array($q->status, $from, true)) throw new BusinessException("only a {$from[0]} question can move to {$to}", 'qb_wrong_status', 422);
            $q->update(['status' => $to] + $extra($q));
            AuditLog::record($action, $q, ['from' => $from, 'to' => $to]);
            return $q;
        });
        return response()->json(['success' => true, 'data' => $this->row($q->fresh()), 'message' => __('messages.saved')]);
    }

    /** What the user may see: a writer only their own questions (another writer's is a 404, not a 403) */
    private function visible(User $user)
    {
        return $user->role === 'content_writer' ? QbQuestion::where('created_by', $user->id) : QbQuestion::query();
    }

    private function find(User $user, int $id, bool $lock = false): QbQuestion
    {
        $q = $this->visible($user);
        return ($lock ? $q->lockForUpdate() : $q)->findOrFail($id);
    }

    /** The chapter must belong to the subject and the topic to the chapter (a topic alone fills in its chapter) */
    private function placed(array $in): array
    {
        if (!empty($in['qb_topic_id'])) {
            $chapter = QbTopic::find($in['qb_topic_id'])->qb_chapter_id;
            if (!empty($in['qb_chapter_id']) && (int) $in['qb_chapter_id'] !== (int) $chapter) throw ValidationException::withMessages(['qb_topic_id' => __('errors.qb_topic_mismatch')]);
            $in['qb_chapter_id'] = $chapter;
        }
        if (!empty($in['qb_chapter_id']) && (int) QbChapter::find($in['qb_chapter_id'])->qb_subject_id !== (int) $in['qb_subject_id']) {
            throw ValidationException::withMessages(['qb_chapter_id' => __('errors.qb_chapter_mismatch')]);
        }
        return $in;
    }

    private function revision(QbQuestion $q, User $user): void
    {
        $q->refresh();
        QbQuestionRevision::create(['qb_question_id' => $q->id, 'edited_by' => $user->id,
            'snapshot' => $q->only(['qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode',
                'question_json', 'question_text', 'answer_json', 'answer_text', 'explanation_json', 'explanation_text', 'status'])
                + ['class_level_ids' => $q->classLevels()->pluck('qb_class_levels.id')->all()]]);
    }

    private function row(QbQuestion $q): array
    {
        return $q->only(['id', 'qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode',
            'question_json', 'question_text', 'answer_json', 'answer_text', 'explanation_json', 'explanation_text', 'status', 'review_note', 'created_by', 'reviewed_by'])
            + ['class_level_ids' => $q->classLevels()->pluck('qb_class_levels.id')->all(), 'published_at' => $q->published_at?->toIso8601String(),
                'updated_at' => $q->updated_at?->toIso8601String()];
    }
}
