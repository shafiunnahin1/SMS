<?php

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

// Admin: the CURRENT institution's audit trail (AuditLog is tenant-scoped, fail-closed). Read-only - audit rows are never edited.
class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['action' => 'nullable|string|max:100', 'model' => 'nullable|string|max:50', 'user_id' => 'nullable|integer',
                            'from' => 'nullable|date', 'to' => 'nullable|date', 'per_page' => 'nullable|integer|min:1|max:100']);
        $page = AuditLog::with('user:id,name,role')
            ->when($request->input('action'), fn ($q, $v) => $q->where('action', $v))
            ->when($request->input('model'), fn ($q, $v) => $q->where('model', $v))
            ->when($request->input('user_id'), fn ($q, $v) => $q->where('user_id', $v))
            ->when($request->input('from'), fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->input('to'), fn ($q, $v) => $q->where('created_at', '<=', $v . ' 23:59:59'))
            ->orderByDesc('id')->paginate((int) $request->input('per_page', 20));

        return response()->json(['success' => true, 'data' => $page->items(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]]);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => AuditLog::with('user:id,name,role')->findOrFail($id)]);
    }
}
