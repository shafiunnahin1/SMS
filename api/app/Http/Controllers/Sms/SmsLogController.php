<?php

namespace App\Http\Controllers\Sms;

use App\Http\Controllers\Controller;
use App\Exceptions\BusinessException;
use App\Models\{AuditLog, SmsLog};
use App\Services\Sms\SmsEventPolicy;
use App\Services\SmsService;
use Illuminate\Http\Request;

// Step 4.6 GET /sms-logs (admin, accountant): the institution's SMS, newest first, cursor-paginated (docs/API.md "Cursor pagination").
// Only this institution's rows (tenant scope); the admin needs the full number to check a delivery, so it is not masked here.
class SmsLogController extends Controller
{
    public function index(Request $request)
    {
        // D101: department staff need D91 context + staff.sms_log.index (same tenant log as the accountant role)
        if ($request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
        $f = $request->validate(['per_page' => 'nullable|integer|min:1|max:100', 'status' => 'nullable|in:sent,failed,pending,discarded', 'cursor' => 'nullable|string|max:500']);
        $page = SmsLog::query()->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('id')->cursorPaginate($f['per_page'] ?? 50);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($l) => [
            'id' => $l->id, 'to_phone' => $l->to_phone, 'message' => $l->message, 'status' => $l->status, 'segments' => $l->segments,
            'encoding' => $l->encoding, 'sender_id' => $l->sender_id, 'fallback_used' => (bool) $l->fallback_used, 'error' => $l->error,
            'sent_at' => $l->sent_at?->toIso8601String(), 'event_key' => $l->event_key,
        ])->values(), 'meta' => ['next_cursor' => $page->nextCursor()?->encode(), 'per_page' => $page->perPage()]]);
    }

    /** D208 SMSC.3 POST /sms-logs/{id}/send: send one pending (manual) SMS now; the same row becomes sent or failed */
    public function send(Request $request, int $id)
    {
        $log = $this->pendingOr404($id);
        return response()->json(['success' => true, 'data' => ['id' => $log->id, 'status' => $this->sendOne($log, $request->user()->id)]]);
    }

    /** D208 SMSC.3 POST /sms-logs/{id}/discard: the pending SMS is not sent; the row stays as a record */
    public function discard(Request $request, int $id)
    {
        $log = $this->pendingOr404($id);
        $log->update(['status' => 'discarded']);
        AuditLog::record('sms.discarded', $log, ['event_key' => $log->event_key]);
        return response()->json(['success' => true, 'data' => ['id' => $log->id, 'status' => 'discarded']]);
    }

    /** D208 SMSC.3 POST /sms-logs/send-pending {ids: [..]}: send several pending SMS; rows no longer pending are skipped */
    public function sendPending(Request $request)
    {
        $f = $request->validate(['ids' => 'required|array|min:1|max:200', 'ids.*' => 'integer|distinct']);
        $out = ['sent' => 0, 'failed' => 0, 'skipped' => 0];
        foreach (SmsLog::query()->whereIn('id', $f['ids'])->where('status', 'pending')->orderBy('id')->get() as $log) {
            $s = $this->sendOne($log, $request->user()->id);
            $out[$s === 'sent' ? 'sent' : ($s === 'failed' ? 'failed' : 'skipped')]++;
        }
        $out['skipped'] += count($f['ids']) - array_sum($out);
        return response()->json(['success' => true, 'data' => $out]);
    }

    private function pendingOr404(int $id): SmsLog
    {
        $log = SmsLog::query()->findOrFail($id);
        if ($log->status !== 'pending') throw new BusinessException('only a pending SMS can be sent or discarded', 'sms_not_pending', 409);
        return $log;
    }

    /** returns the row's new status; a guardian who switched SMS off (non-transactional) -> discarded, never sent */
    private function sendOne(SmsLog $log, int $by): string
    {
        $transactional = in_array($log->event_key, SmsEventPolicy::TRANSACTIONAL, true);
        app(SmsService::class)->send($log->to_phone, $log->message, $by, $transactional, true, $log->event_key, $log);
        $log->refresh();
        if ($log->status === 'pending') $log->update(['status' => 'discarded', 'error' => 'no_consent']);
        // who sent which event's SMS; never the phone or the text (G9)
        AuditLog::record('sms.sent_manually', $log, ['event_key' => $log->event_key, 'status' => $log->status]);
        return $log->status;
    }
}
