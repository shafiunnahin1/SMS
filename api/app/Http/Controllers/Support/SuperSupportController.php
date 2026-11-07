<?php

namespace App\Http\Controllers\Support;

use App\Http\Controllers\Controller;
use App\Models\{Institution, SupportTicket, User};
use App\Services\Support\SupportService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D193 SUP.1: the platform's queue (Super Admin, central host). The list reads every institution's tickets (anyInstitution, ticket
// fields only - no student or personal data); a ticket is read and answered inside its own tenant (Tenancy::as). A ticket past its
// first-response time without an answer is flagged `overdue` (shown red).
class SuperSupportController extends Controller
{
    public function __construct(private SupportService $support) {}

    public function index(Request $request)
    {
        $f = $request->validate(['status' => ['nullable', Rule::in(['open', 'pending_customer', 'pending_platform', 'resolved', 'closed'])]]);
        $rows = SupportTicket::anyInstitution()->with('institution:id,name')->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->orderByDesc('id')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($t) => SupportTicketController::summary($t) + [
            'institution' => $t->institution?->name, 'assigned_to' => $t->assigned_to, 'first_response_due_at' => $t->first_response_due_at?->toIso8601String(),
            'overdue' => !$t->first_responded_at && $t->first_response_due_at?->isPast() && !in_array($t->status, ['resolved', 'closed'], true),
        ])->values()]);
    }

    public function show(int $id)
    {
        return $this->inTicket($id, fn (SupportTicket $t) => response()->json(['success' => true, 'data' => $this->detail($t)]));
    }

    public function message(Request $request, int $id)
    {
        $d = $request->validate(['body' => 'required|string|max:5000', 'is_internal' => 'sometimes|boolean']);
        return $this->inTicket($id, function (SupportTicket $t) use ($request, $d) {
            $this->support->platformReply($t, $request->user(), $d['body'], (bool) ($d['is_internal'] ?? false));
            return response()->json(['success' => true, 'data' => $this->detail($t->fresh())]);
        });
    }

    public function assign(Request $request, int $id)
    {
        $d = $request->validate(['user_id' => ['nullable', 'integer', Rule::exists('users', 'id')->whereNull('institution_id')->where('role', 'super_admin')]]);
        return $this->inTicket($id, function (SupportTicket $t) use ($d) {
            $t->update(['assigned_to' => $d['user_id'] ?? null]);
            return response()->json(['success' => true, 'data' => $this->detail($t->fresh())]);
        });
    }

    public function status(Request $request, int $id)
    {
        $d = $request->validate(['status' => ['required', Rule::in(['pending_customer', 'pending_platform', 'resolved', 'closed'])]]);
        return $this->inTicket($id, fn (SupportTicket $t) => response()->json(['success' => true, 'data' => $this->detail($this->support->setStatus($t, $d['status']))]));
    }

    private function inTicket(int $id, \Closure $fn)
    {
        $institutionId = SupportTicket::anyInstitution()->whereKey($id)->value('institution_id') ?? abort(404);
        return Tenancy::as(Institution::findOrFail($institutionId), fn () => $fn(SupportTicket::findOrFail($id)));
    }

    private function detail(SupportTicket $t): array
    {
        $msgs = $t->messages()->with('author:id,name')->orderBy('id')->get();
        return SupportTicketController::summary($t) + ['institution' => Tenancy::current()?->name, 'assigned_to' => $t->assigned_to, 'rating_note' => $t->rating_note,
            'first_response_due_at' => $t->first_response_due_at?->toIso8601String(), 'first_responded_at' => $t->first_responded_at?->toIso8601String(),
            'messages' => $msgs->map(fn ($m) => ['id' => $m->id, 'author_type' => $m->author_type, 'author' => $m->author?->name, 'body' => $m->body,
                'is_internal' => $m->is_internal, 'created_at' => $m->created_at?->toIso8601String()])->values()];
    }
}
