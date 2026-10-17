<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\QuestionBank\QbWriterRequest;
use App\Models\{AuditLog, QbQuestion, User};
use Illuminate\Http\Request;

// QB.2 (D65, docs/modules/question-bank.md §1): the platform's question-bank writers and moderators - users with institution_id
// NULL that work on the central host only. The Super Admin adds them (they change the password on first login) and switches them
// off instead of deleting them: their questions keep created_by, and switching off revokes every token (UserObserver).
class QbWriterController extends Controller
{
    private const ROLES = ['content_writer', 'content_moderator'];

    /** GET /super/qb/writers */
    public function index()
    {
        $users = User::platform()->whereIn('role', self::ROLES)->orderBy('name')->get();
        $counts = QbQuestion::withTrashed()->whereIn('created_by', $users->pluck('id'))
            ->selectRaw('created_by, status, COUNT(*) AS n')->groupBy('created_by', 'status')->get()->groupBy('created_by');
        return response()->json(['success' => true, 'data' => $users->map(fn ($u) => $this->row($u) + [
            'questions' => ($counts[$u->id] ?? collect())->mapWithKeys(fn ($r) => [$r->status => (int) $r->n]),
        ])->values()]);
    }

    /** POST /super/qb/writers */
    public function store(QbWriterRequest $request)
    {
        $in = $request->validated();
        $user = User::create(['institution_id' => null, 'name' => $in['name'], 'role' => $in['role'], 'phone' => $in['phone'], 'email' => $in['email'] ?? null,
            'password' => $in['password'], 'is_active' => true, 'must_change_password' => true]);
        AuditLog::record('qb.writer.created', $user, ['role' => $user->role]);
        return response()->json(['success' => true, 'data' => $this->row($user), 'message' => __('messages.saved')], 201);
    }

    /** PATCH /super/qb/writers/{id}: name, role, phone, email, is_active */
    public function update(QbWriterRequest $request, int $id)
    {
        $user = User::platform()->whereIn('role', self::ROLES)->findOrFail($id);
        $in = $request->validated();
        $user->update($in);
        AuditLog::record('qb.writer.updated', $user, ['changed' => array_keys($in)]);
        return response()->json(['success' => true, 'data' => $this->row($user->fresh()), 'message' => __('messages.saved')]);
    }

    /** PATCH /writer/change-password: a writer's own password (first login, or any time) */
    public function changePassword(ChangePasswordRequest $request)
    {
        // UserObserver keeps the token in use and revokes the others
        $request->user()->forceFill(['password' => $request->input('password'), 'must_change_password' => false])->save();
        return response()->json(['success' => true, 'message' => __('messages.password_changed')]);
    }

    private function row(User $u): array
    {
        return ['id' => $u->id, 'name' => $u->name, 'role' => $u->role, 'phone' => $u->phone, 'email' => $u->email, 'is_active' => (bool) $u->is_active,
            'must_change_password' => (bool) $u->must_change_password, 'last_login_at' => $u->last_login_at?->toIso8601String()];
    }
}
