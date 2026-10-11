<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\QbQuestionRequest;
use App\Models\{AuditLog, QbChapter, QbMedia, QbQuestion, QbQuestionRevision, QbQuestionType, QbTopic, User};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// QB.2 (D65, docs/modules/question-bank.md §1, §3খ): the writers' panel on the central host. A writer (content_writer) writes
// questions and sees only their own; they edit a question only while it is a draft or came back rejected, then submit it for
// review. A moderator (content_moderator) publishes or rejects (with the reason) what is in review and edits nothing. The Super
// Admin may do all of it. Every save stores a qb_question_revisions snapshot; every status move is in the audit log.
// QB.3: the parts of the core types - options (mcq, true_false), creative parts (creative), occurrences and pictures. A draft may
// be incomplete; sending it for review checks that its type is complete (options with a right one, parts, an answer).
class QbQuestionController extends Controller
{
    private const EDITABLE = ['draft', 'rejected'];
    private const CHILDREN = ['class_level_ids', 'options', 'creative_parts', 'occurrences', 'media_ids', 'stimuli', 'items'];

    /** GET /writer/curriculum: the class → subject → chapter → topic tree to file a question under */
    public function curriculum()
    {
        return response()->json(['success' => true, 'data' => QbCurriculumController::treeData()]);
    }

    /** GET /writer/question-types: the active types */
    public function types()
    {
        return response()->json(['success' => true, 'data' => QbQuestionType::where('is_active', true)->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'slug', 'name_bn', 'name_en', 'family', 'ui_config'])
            ->map(fn ($t) => $t->only(['id', 'slug', 'name_bn', 'name_en', 'family']) + ['structure' => $t->ui_config['structure'] ?? null])]);   // QB.4: the editor section
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
            'data' => collect($page->items())->map(fn ($q) => $q->only(['id', 'qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks',
                'language', 'question_text', 'status', 'review_note', 'created_by']) + ['updated_at' => $q->updated_at?->toIso8601String(), 'author' => $authors[$q->created_by] ?? null])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]]);
    }

    /** POST /writer/questions: a new draft (writers and the Super Admin; a moderator only reviews) */
    public function store(QbQuestionRequest $request)
    {
        $user = $request->user();
        abort_if($user->role === 'content_moderator', 403);
        $in = $this->placed($request->validated());
        $q = DB::transaction(function () use ($in, $user) {
            $q = QbQuestion::create(collect($in)->except(self::CHILDREN)->all() + ['status' => 'draft', 'created_by' => $user->id]);
            $this->children($q, $in, $user);
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
            $q->update(collect($in)->except(self::CHILDREN)->all());
            $this->children($q, $in, $user);
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
        return $this->move($user, $id, self::EDITABLE, 'review', 'qb.question.submitted', function ($q) {
            $this->complete($q);
            return ['review_note' => null];
        });
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

    /** Replace each list that came in the request (absent = unchanged); pictures must be the editor's own uploads or already on it */
    private function children(QbQuestion $q, array $in, User $user): void
    {
        if (array_key_exists('class_level_ids', $in)) $q->classLevels()->sync($in['class_level_ids']);
        if (array_key_exists('options', $in)) {
            $q->options()->delete();
            foreach (array_values($in['options']) as $i => $o) $q->options()->create(['label' => $o['label'], 'content_text' => $o['content_text'],
                'content_json' => $o['content_json'] ?? null, 'is_correct' => (bool) $o['is_correct'], 'sort_order' => $i]);
        }
        if (array_key_exists('creative_parts', $in)) {
            $q->creativeParts()->delete();
            foreach (array_values($in['creative_parts']) as $i => $p) $q->creativeParts()->create(collect($p)->only(['part_label', 'cognitive_level', 'marks',
                'question_text', 'question_json', 'answer_text', 'answer_json'])->all() + ['sort_order' => $i]);
        }
        if (array_key_exists('stimuli', $in) || array_key_exists('items', $in)) {       // QB.4: one list of each, replaced together
            $q->items()->delete();
            $stimuli = [];
            if (array_key_exists('stimuli', $in)) {
                $q->stimuli()->delete();
                foreach (array_values($in['stimuli']) as $i => $st) $stimuli[$i] = $q->stimuli()->create(['label' => $st['label'] ?? null, 'content_text' => $st['content_text'] ?? null,
                    'content_json' => $st['content_json'] ?? null, 'sort_order' => $i])->id;
            } else {
                $stimuli = $q->stimuli()->pluck('id')->all();
            }
            foreach (array_values($in['items'] ?? []) as $i => $it) {
                $sid = isset($it['stimulus_index']) ? ($stimuli[$it['stimulus_index']] ?? null) : null;
                if (isset($it['stimulus_index']) && !$sid) throw ValidationException::withMessages(["items.{$i}.stimulus_index" => __('errors.qb_no_such_stimulus')]);
                $q->items()->create(['qb_question_stimulus_id' => $sid, 'item_type' => $it['item_type'], 'prompt_text' => $it['prompt_text'] ?? null,
                    'prompt_json' => $it['prompt_json'] ?? null, 'answer_json' => $it['answer_json'] ?? null, 'marks' => $it['marks'] ?? 0, 'sort_order' => $i]);
            }
        }
        if (array_key_exists('occurrences', $in)) {
            $q->occurrences()->delete();
            foreach ($in['occurrences'] as $o) $q->occurrences()->create(collect($o)->only(['board', 'institution_name', 'exam_type', 'year', 'note'])->all());
        }
        if (array_key_exists('media_ids', $in)) {
            $linked = $q->media()->pluck('qb_media.id')->all();
            $foreign = QbMedia::whereIn('id', $in['media_ids'])->whereNotIn('id', $linked)->where('uploaded_by', '!=', $user->id)->exists();
            if ($foreign && $user->role !== 'super_admin') throw ValidationException::withMessages(['media_ids' => __('errors.qb_media_not_yours')]);
            $q->media()->sync($in['media_ids']);
        }
    }

    /** Sending for review: the type's own parts must be there (a draft may be unfinished) */
    private function complete(QbQuestion $q): void
    {
        $family = $q->type?->family;
        $structure = $q->type?->ui_config['structure'] ?? null;
        $options = $q->options()->get();
        $items = $q->items()->get();
        $errors = $structure && ($structure !== 'gap' || $items->isNotEmpty()) ? $this->structured($structure, $q, $items) : match ($family) {
            'mcq' => $options->count() < 2 ? ['options' => 'qb_needs_options'] : ($options->where('is_correct', true)->isEmpty() ? ['options' => 'qb_needs_correct'] : []),
            'true_false' => ($options->count() !== 2 || $options->where('is_correct', true)->count() !== 1) ? ['options' => 'qb_true_false'] : [],
            'creative' => $q->creativeParts()->count() === 0 ? ['creative_parts' => 'qb_needs_parts'] : [],
            'fill_gap' => !str_contains((string) $q->question_text, '___') ? ['question_text' => 'qb_needs_blank'] : (blank($q->answer_text) ? ['answer_text' => 'qb_needs_answer'] : []),
            default => blank($q->answer_text) ? ['answer_text' => 'qb_needs_answer'] : [],
        };
        if ($errors) throw ValidationException::withMessages(array_map(fn ($code) => __("errors.{$code}"), $errors));
    }

    /** QB.4: the structured types' own parts (a gap type without items keeps the QB.3 rule: a ___ in the text and an answer) */
    private function structured(string $structure, QbQuestion $q, \Illuminate\Support\Collection $items): array
    {
        $only = fn (string $type) => $items->isNotEmpty() && $items->every(fn ($i) => $i->item_type === $type);
        $filled = fn ($v) => is_string($v) ? trim($v) !== '' : !empty($v);
        return match ($structure) {
            'gap' => $only('gap') && $items->every(fn ($i) => collect($i->answer_json['answers'] ?? [])->filter($filled)->isNotEmpty()) ? [] : ['items' => 'qb_gaps_need_answers'],
            'match' => $items->count() >= 2 && $only('match_pair') && $items->every(fn ($i) => $filled($i->prompt_text) && $filled($i->answer_json['right'] ?? null)) ? [] : ['items' => 'qb_needs_pairs'],
            'order' => $items->count() >= 2 && $only('order_step') && $items->pluck('answer_json.position')->map(fn ($p) => (int) $p)->sort()->values()->all() === range(1, $items->count())
                ? [] : ['items' => 'qb_needs_order'],
            'passage' => $q->stimuli()->whereNotNull('content_text')->where('content_text', '!=', '')->exists() && $only('sub_question')
                && $items->every(fn ($i) => $filled($i->prompt_text) && $filled($i->answer_json['answer_text'] ?? null)) ? [] : ['items' => 'qb_needs_passage'],
            'passage_mcq' => $q->stimuli()->whereNotNull('content_text')->where('content_text', '!=', '')->exists() && $only('sub_mcq')
                && $items->every(fn ($i) => count($i->prompt_json['options'] ?? []) >= 2 && is_int($i->answer_json['correct'] ?? null)
                    && $i->answer_json['correct'] >= 0 && $i->answer_json['correct'] < count($i->prompt_json['options'])) ? [] : ['items' => 'qb_needs_passage_mcq'],
            default => [],
        };
    }

    private function revision(QbQuestion $q, User $user): void
    {
        $q->refresh();
        QbQuestionRevision::create(['qb_question_id' => $q->id, 'edited_by' => $user->id,
            'snapshot' => $q->only(['qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode',
                'question_json', 'question_text', 'answer_json', 'answer_text', 'explanation_json', 'explanation_text', 'status'])
                + ['class_level_ids' => $q->classLevels()->pluck('qb_class_levels.id')->all()] + $this->parts($q)]);
    }

    private function row(QbQuestion $q): array
    {
        return $q->only(['id', 'qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode',
            'question_json', 'question_text', 'answer_json', 'answer_text', 'explanation_json', 'explanation_text', 'status', 'review_note', 'created_by', 'reviewed_by'])
            + ['class_level_ids' => $q->classLevels()->pluck('qb_class_levels.id')->all(), 'published_at' => $q->published_at?->toIso8601String(),
                'updated_at' => $q->updated_at?->toIso8601String()]
            + $this->parts($q) + ['media' => $q->media()->get()->map(fn ($m) => QbMediaController::view($m))->values()->all()];
    }

    /** The parts with their answers - the writers' panel only; an institution or a student gets QbQuestionPublicResource */
    private function parts(QbQuestion $q): array
    {
        return [
            'options' => $q->options()->get(['label', 'content_text', 'content_json', 'is_correct'])->map(fn ($o) => ['label' => $o->label, 'content_text' => $o->content_text,
                'content_json' => $o->content_json, 'is_correct' => (bool) $o->is_correct])->all(),
            'creative_parts' => $q->creativeParts()->get()->map(fn ($p) => $p->only(['part_label', 'cognitive_level', 'marks', 'question_text', 'question_json', 'answer_text', 'answer_json']))->all(),
            'occurrences' => $q->occurrences()->get()->map(fn ($o) => $o->only(['board', 'institution_name', 'exam_type', 'year', 'note']))->all(),
            'media_ids' => $q->media()->pluck('qb_media.id')->all(),
            'stimuli' => $q->stimuli()->get()->map(fn ($st) => ['id' => $st->id] + $st->only(['label', 'content_text', 'content_json']))->all(),
            'items' => $q->items()->get()->map(fn ($it) => $it->only(['item_type', 'prompt_text', 'prompt_json', 'answer_json', 'marks', 'qb_question_stimulus_id']))->all(),
        ];
    }
}
