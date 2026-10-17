<?php

namespace App\Http\Controllers\Sms;

use App\Http\Controllers\Controller;
use App\Models\SmsLog;
use Illuminate\Http\Request;

// Step 4.6 GET /sms-logs (admin, accountant): the institution's SMS, newest first, cursor-paginated (docs/API.md "Cursor pagination").
// Only this institution's rows (tenant scope); the admin needs the full number to check a delivery, so it is not masked here.
class SmsLogController extends Controller
{
    public function index(Request $request)
    {
        // D101: department staff need D91 context + staff.sms_log.index (same tenant log as the accountant role)
        if ($request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
        $f = $request->validate(['per_page' => 'nullable|integer|min:1|max:100', 'status' => 'nullable|in:sent,failed', 'cursor' => 'nullable|string|max:500']);
        $page = SmsLog::query()->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('id')->cursorPaginate($f['per_page'] ?? 50);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($l) => [
            'id' => $l->id, 'to_phone' => $l->to_phone, 'message' => $l->message, 'status' => $l->status, 'segments' => $l->segments,
            'encoding' => $l->encoding, 'sender_id' => $l->sender_id, 'fallback_used' => (bool) $l->fallback_used, 'error' => $l->error,
            'sent_at' => $l->sent_at?->toIso8601String(),
        ])->values(), 'meta' => ['next_cursor' => $page->nextCursor()?->encode(), 'per_page' => $page->perPage()]]);
    }
}
