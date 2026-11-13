<?php

namespace App\Http\Controllers\Memo;

use App\Http\Controllers\Controller;
use App\Models\{MemoNumber, User};
use App\Services\Memo\MemoService;
use App\Support\BanglaFormat;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D210 MEMO.1: the memo register - every number issued, newest first (filters: year, kind, status) - and cancelling one (the number
// stays, marked cancelled, with the reason; never deleted or given again).
class MemoRegisterController extends Controller
{
    public function index(Request $request)
    {
        $f = $request->validate(['year' => 'nullable|integer|min:2000|max:2100', 'doc_kind' => ['nullable', Rule::in(MemoService::KINDS)],
            'status' => 'nullable|in:issued,cancelled', 'page' => 'nullable|integer|min:1']);
        $page = MemoNumber::query()->with('file:id,year')
            ->when($f['year'] ?? null, fn ($q, $y) => $q->whereHas('file', fn ($w) => $w->where('year', $y)))
            ->when($f['doc_kind'] ?? null, fn ($q, $k) => $q->where('doc_kind', $k))->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('id')->paginate(50);
        $names = User::inTenant()->whereIn('id', collect($page->items())->pluck('issued_by')->filter())->pluck('name', 'id');
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($m) => [
            'id' => $m->id, 'memo_no' => $m->memo_no, 'memo_no_bn' => BanglaFormat::digits($m->memo_no), 'doc_kind' => $m->doc_kind, 'recipient' => $m->recipient,
            'source_key' => $m->source_key, 'status' => $m->status, 'issued_by' => $names[$m->issued_by] ?? null, 'issued_at' => $m->issued_at?->toIso8601String(),
            'cancelled_at' => $m->cancelled_at?->toIso8601String(), 'cancel_reason' => $m->cancel_reason,
        ])->values(), 'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    public function cancel(Request $request, MemoService $memos, int $id)
    {
        $m = MemoNumber::findOrFail($id);
        $d = $request->validate(['reason' => 'required|string|max:255']);
        $m = $memos->cancel($m, $d['reason']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $m->id, 'status' => $m->status]]);
    }
}
