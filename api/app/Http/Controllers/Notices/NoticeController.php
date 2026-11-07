<?php

namespace App\Http\Controllers\Notices;

use App\Http\Controllers\Controller;
use App\Http\Requests\Notices\NoticeRequest;
use App\Models\{AuditLog, Notice, NoticeReceipt, User};
use App\Services\Notices\NoticeAudience;
use Illuminate\Http\Request;

// D193 NTC.1 (docs/API.md "Notices", communication-plus.md §৫): the admin writes notices (CRUD, scheduled publish, ask for
// acknowledgement) and sees who read / acknowledged; every reader lists the notices meant for them, opening one marks it read and
// the acknowledge button records the acknowledgement. Another institution's notice, or one not meant for the reader, is a 404.
class NoticeController extends Controller
{
    public function __construct(private NoticeAudience $audience) {}

    public function index(Request $request)
    {
        $user = $request->user();
        $page = $this->audience->visible($user)->orderByDesc('published_at')->orderByDesc('id')->paginate(min((int) $request->input('per_page', 20), 100));
        $mine = NoticeReceipt::where('user_id', $user->id)->whereIn('notice_id', collect($page->items())->pluck('id'))->get()->keyBy('notice_id');
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($n) => $this->row($n, $mine[$n->id] ?? null, $user)),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]]);
    }

    /** Opening a notice marks it read for its reader (never for the admin) */
    public function show(Request $request, int $id)
    {
        $user = $request->user();
        $notice = $this->audience->visible($user)->findOrFail($id);
        $receipt = null;
        if ($user->role !== 'admin') {
            $receipt = NoticeReceipt::firstOrCreate(['notice_id' => $notice->id, 'user_id' => $user->id], ['read_at' => now()]);
            if (!$receipt->read_at) $receipt->update(['read_at' => now()]);
        }
        return response()->json(['success' => true, 'data' => $this->row($notice, $receipt, $user)]);
    }

    public function store(NoticeRequest $request)
    {
        $f = $request->validated();
        $notice = Notice::create($f + ['created_by' => $request->user()->id, 'published_at' => $f['published_at'] ?? now()]);
        AuditLog::record('notice.created', $notice);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($notice->fresh(), null, $request->user())], 201);
    }

    public function update(NoticeRequest $request, int $id)
    {
        $notice = Notice::findOrFail($id);
        $notice->update($request->validated());
        AuditLog::record('notice.updated', $notice);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($notice->fresh(), null, $request->user())]);
    }

    public function destroy(int $id)
    {
        $notice = Notice::findOrFail($id);
        $notice->delete();                                                  // soft delete (R7); receipts stay
        AuditLog::record('notice.deleted', $notice);
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** POST /notices/{id}/ack: the reader's explicit acknowledgement (once; repeating keeps the first time) */
    public function ack(Request $request, int $id)
    {
        $user = $request->user();
        $notice = $this->audience->visible($user)->findOrFail($id);
        abort_unless($notice->require_ack, 422, __('errors.notice_no_ack'));
        $receipt = NoticeReceipt::firstOrCreate(['notice_id' => $notice->id, 'user_id' => $user->id], ['read_at' => now()]);
        if (!$receipt->acknowledged_at) $receipt->update(['acknowledged_at' => now(), 'read_at' => $receipt->read_at ?? now()]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($notice, $receipt->fresh(), $user)]);
    }

    /** GET /notices/{id}/receipts (admin): every reader the notice is for - read / acknowledged / not yet; overdue when the deadline passed */
    public function receipts(int $id)
    {
        $notice = Notice::findOrFail($id);
        $ids = $this->audience->recipients($notice);
        $got = NoticeReceipt::where('notice_id', $notice->id)->get()->keyBy('user_id');
        $users = User::inTenant()->whereIn('id', $ids)->orderBy('name')->get(['id', 'name', 'role']);
        $overdue = $notice->require_ack && $notice->ack_deadline && $notice->ack_deadline->endOfDay()->isPast();
        $rows = $users->map(fn ($u) => ['user_id' => $u->id, 'name' => $u->name, 'role' => $u->role,
            'read_at' => $got->get($u->id)?->read_at?->toIso8601String(), 'acknowledged_at' => $got->get($u->id)?->acknowledged_at?->toIso8601String()])->values();
        $read = $rows->whereNotNull('read_at')->count();
        $acked = $rows->whereNotNull('acknowledged_at')->count();
        return response()->json(['success' => true, 'data' => ['recipients' => $rows, 'total' => $rows->count(), 'read' => $read, 'acknowledged' => $acked,
            'overdue' => $overdue && $acked < $rows->count()]]);
    }

    private function row(Notice $n, ?NoticeReceipt $r, User $user): array
    {
        $row = ['id' => $n->id, 'title' => $n->title, 'content' => $n->content, 'target' => $n->target, 'program_id' => $n->program_id, 'batch_id' => $n->batch_id,
            'published_at' => $n->published_at?->toIso8601String(), 'require_ack' => (bool) $n->require_ack, 'ack_deadline' => $n->ack_deadline?->toDateString(),
            'read_at' => $r?->read_at?->toIso8601String(), 'acknowledged_at' => $r?->acknowledged_at?->toIso8601String()];
        if ($user->role === 'admin') $row['scheduled'] = $n->published_at && $n->published_at->isFuture();
        return $row;
    }
}
