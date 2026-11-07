<?php

namespace App\Http\Controllers\Support;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Services\Support\SupportService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D193 SUP.1: the institution's side (admin, accountant). Every ticket of the own institution; internal platform notes are never
// returned. Attachments, the context snapshot and the support access grant are not built (DECISIONS 2026-11-07 SUP.1).
class SupportTicketController extends Controller
{
    public function __construct(private SupportService $support) {}

    public function index(Request $request)
    {
        $f = $request->validate(['status' => ['nullable', Rule::in(['open', 'pending_customer', 'pending_platform', 'resolved', 'closed'])]]);
        $rows = SupportTicket::when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))->orderByDesc('id')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($t) => self::summary($t))->values()]);
    }

    public function store(Request $request)
    {
        $d = $request->validate([
            'subject' => 'required|string|max:150', 'category' => ['required', Rule::in(SupportTicket::CATEGORIES)],
            'priority' => ['required', Rule::in(SupportTicket::PRIORITIES)], 'body' => 'required|string|max:5000',
        ]);
        $t = $this->support->open($request->user(), $d);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->detail($t)], 201);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->detail(SupportTicket::findOrFail($id))]);
    }

    public function message(Request $request, int $id)
    {
        $t = SupportTicket::findOrFail($id);
        $this->support->institutionReply($t, $request->user(), $request->validate(['body' => 'required|string|max:5000'])['body']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->detail($t->fresh())]);
    }

    public function close(int $id)
    {
        $t = $this->support->setStatus(SupportTicket::findOrFail($id), 'closed');
        return response()->json(['success' => true, 'data' => $this->detail($t)]);
    }

    public function reopen(int $id)
    {
        $t = $this->support->reopen(SupportTicket::findOrFail($id));
        return response()->json(['success' => true, 'data' => $this->detail($t)]);
    }

    public function rate(Request $request, int $id)
    {
        $t = SupportTicket::findOrFail($id);
        $d = $request->validate(['rating' => 'required|integer|min:1|max:5', 'note' => 'nullable|string|max:255']);
        return response()->json(['success' => true, 'data' => $this->detail($this->support->rate($t, $d['rating'], $d['note'] ?? null))]);
    }

    public static function summary(SupportTicket $t): array
    {
        return ['id' => $t->id, 'ticket_no' => $t->ticket_no, 'subject' => $t->subject, 'category' => $t->category, 'priority' => $t->priority, 'status' => $t->status,
            'created_at' => $t->created_at?->toIso8601String(), 'updated_at' => $t->updated_at?->toIso8601String(), 'rating' => $t->rating];
    }

    private function detail(SupportTicket $t): array
    {
        $msgs = $t->messages()->where('is_internal', false)->with('author:id,name')->orderBy('id')->get();
        return self::summary($t) + ['rating_note' => $t->rating_note, 'messages' => $msgs->map(fn ($m) => ['id' => $m->id, 'author_type' => $m->author_type,
            'author' => $m->author_type === 'platform' ? null : $m->author?->name, 'body' => $m->body, 'created_at' => $m->created_at?->toIso8601String()])->values()];
    }
}
