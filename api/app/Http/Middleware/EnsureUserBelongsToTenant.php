<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Alias `tenant.user`: runs after `tenant` + `auth:sanctum` on every tenant route, so even routes without a role
// check require user.institution_id === bound tenant.
class EnsureUserBelongsToTenant
{
    public function handle(Request $request, Closure $next)
    {
        $user   = $request->user();
        $tenant = app('currentInstitution');          // `tenant` middleware ran first, so this is bound
        if (!$user || in_array($user->role, \App\Models\User::PLATFORM_ROLES, true) || (int) $user->institution_id !== (int) $tenant->id) {
            return response()->json(['success' => false, 'error' => 'institution_mismatch',
                                     'message' => __('errors.institution_mismatch')], 403);
        }
        return $next($request);
    }
}
