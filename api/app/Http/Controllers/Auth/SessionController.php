<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Auth\TokenService;
use Illuminate\Http\Request;

// docs/AUTHORIZATION.md "Session API"
class SessionController extends Controller
{
    public function __construct(private TokenService $tokens) {}

    public function index(Request $request)
    {
        return response()->json(['success' => true, 'data' => SessionResource::collection($request->user()->tokens()->orderByDesc('id')->get())]);
    }

    /** Log one of MY devices out (another user's token id is simply not found) */
    public function destroy(Request $request, int $id)
    {
        $request->user()->tokens()->whereKey($id)->firstOrFail()->delete();
        return response()->json(['success' => true, 'message' => __('messages.session_ended')]);
    }

    public function logoutAll(Request $request)
    {
        $this->tokens->revokeAll($request->user());
        return response()->json(['success' => true, 'message' => __('messages.logged_out_all')]);
    }

    /** Admin: only users of the admin's own institution are found (User::inTenant) */
    public function forceLogout(int $id)
    {
        $user = User::inTenant()->findOrFail($id);
        $this->tokens->revokeAll($user);
        AuditLog::record('auth.force_logout', $user);
        return response()->json(['success' => true, 'message' => __('messages.user_logged_out')]);
    }

    public function unlock(int $id)
    {
        $user = User::inTenant()->findOrFail($id);
        $user->forceFill(['locked_until' => null, 'failed_login_attempts' => 0])->save();
        AuditLog::record('auth.unlocked', $user);
        return response()->json(['success' => true, 'message' => __('messages.account_unlocked')]);
    }
}
