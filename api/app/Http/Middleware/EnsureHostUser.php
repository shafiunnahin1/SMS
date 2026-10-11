<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Alias `host.user` for routes served on BOTH host kinds (/auth/logout, /auth/me): Laravel keeps one route per method+URI,
// so the template's two copies (central for Super Admin, tenant for everyone else) are one route with this check.
// Tenant host: the `tenant.user` rule. Central host: platform accounts only (Super Admin; D65 writers / moderators).
class EnsureHostUser
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        $tenant = app()->bound('currentInstitution') ? app('currentInstitution') : null;
        $ok = $tenant
            ? ($user && !in_array($user->role, \App\Models\User::PLATFORM_ROLES, true) && (int) $user->institution_id === (int) $tenant->id)
            : ($user && in_array($user->role, \App\Models\User::PLATFORM_ROLES, true) && $user->institution_id === null);
        if (!$ok) {
            return response()->json(['success' => false, 'error' => $user?->role === 'super_admin' ? 'forbidden_host' : 'institution_mismatch',
                'message' => __('errors.' . ($user?->role === 'super_admin' ? 'forbidden_host' : 'institution_mismatch'))], 403);
        }
        return $next($request);
    }
}
