<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, QbMedia, User};
use Illuminate\Database\Eloquent\{Builder, Model};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// QB.5 (D65, docs/modules/question-bank.md §1, §3গ): a concept or a resource goes through the same review as a question (QB.2) -
// a writer sees and edits only their own, and only while it is a draft or came back rejected; a moderator publishes or returns it
// with a reason and edits nothing; the Super Admin may do all of it; every status move is in the audit log. The using controller
// names its model (MODEL), its audit prefix (AUDIT) and its row shape (row()).
trait ReviewsQbContent
{
    private const EDITABLE = ['draft', 'rejected'];

    /** POST .../{id}/submit: draft | rejected -> review (the author, or the Super Admin) */
    public function submit(Request $request, int $id)
    {
        $user = $request->user();
        abort_if($user->role === 'content_moderator', 403);
        return $this->move($user, $id, self::EDITABLE, 'review', fn ($m) => ['review_note' => null]);
    }

    /** POST .../{id}/publish: review -> published (moderator, Super Admin) */
    public function publish(Request $request, int $id)
    {
        return $this->move($request->user(), $id, ['review'], 'published', fn ($m) => ['reviewed_by' => $request->user()->id, 'review_note' => null]);
    }

    /** POST .../{id}/reject {reason}: review -> rejected; the reason goes back to the writer */
    public function reject(Request $request, int $id)
    {
        $f = $request->validate(['reason' => 'required|string|min:3|max:500']);
        return $this->move($request->user(), $id, ['review'], 'rejected', fn ($m) => ['reviewed_by' => $request->user()->id, 'review_note' => $f['reason']]);
    }

    private function move(User $user, int $id, array $from, string $to, \Closure $extra)
    {
        $m = DB::transaction(function () use ($user, $id, $from, $to, $extra) {
            $m = $this->find($user, $id, lock: true);
            if (!in_array($m->status, $from, true)) throw new BusinessException("only a {$from[0]} item can move to {$to}", 'qb_wrong_status', 422);
            $m->update(['status' => $to] + $extra($m));
            AuditLog::record(self::AUDIT . '.' . ['review' => 'submitted', 'published' => 'published', 'rejected' => 'rejected'][$to], $m, ['from' => $from, 'to' => $to]);
            return $m;
        });
        return response()->json(['success' => true, 'data' => $this->row($m->fresh()), 'message' => __('messages.saved')]);
    }

    /** A writer may only edit their own draft or rejected item; the Super Admin at any time; a moderator never */
    private function editable(User $user, int $id): Model
    {
        abort_if($user->role === 'content_moderator', 403);
        $m = $this->find($user, $id, lock: true);
        if ($user->role !== 'super_admin' && !in_array($m->status, self::EDITABLE, true)) {
            throw new BusinessException('only a draft or a rejected item can be edited', 'qb_wrong_status', 422);
        }
        return $m;
    }

    /** What the user may see: a writer only their own (another writer's is a 404, not a 403) */
    private function visible(User $user): Builder
    {
        $model = self::MODEL;
        return $user->role === 'content_writer' ? $model::where('created_by', $user->id) : $model::query();
    }

    private function find(User $user, int $id, bool $lock = false): Model
    {
        $q = $this->visible($user);
        return ($lock ? $q->lockForUpdate() : $q)->findOrFail($id);
    }

    /** Pictures must be the editor's own uploads or already on the item (the Super Admin may use any) */
    private function ownMedia(array $ids, array $linked, User $user, string $field): void
    {
        $foreign = QbMedia::whereIn('id', $ids)->whereNotIn('id', $linked)->where('uploaded_by', '!=', $user->id)->exists();
        if ($foreign && $user->role !== 'super_admin') throw ValidationException::withMessages([$field => __('errors.qb_media_not_yours')]);
    }

    private function page(Builder $q, Request $request, array $columns): array
    {
        $f = $request->validate(['status' => 'nullable|in:draft,review,published,rejected', 'q' => 'nullable|string|max:100', 'per_page' => 'nullable|integer|min:1|max:100']);
        $page = $q->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where('title_bn', 'like', '%' . addcslashes($s, '%_\\') . '%'))
            ->orderByDesc('updated_at')->orderByDesc('id')->paginate($f['per_page'] ?? 25);
        $authors = User::platform()->whereIn('id', collect($page->items())->pluck('created_by')->unique())->pluck('name', 'id');
        return ['success' => true,
            'data' => collect($page->items())->map(fn ($m) => $m->only($columns) + ['updated_at' => $m->updated_at?->toIso8601String(), 'author' => $authors[$m->created_by] ?? null])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]];
    }
}
