<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Alias `host.user` for routes served on BOTH host kinds (/auth/logout, /auth/me): Laravel keeps one route per method+URI,
// so the template's two copies (central for Super Admin, tenant for everyone else) are one route with this check.
// Tenant host: the `tenant.user` rule. Central host: Super Admin only.
class EnsureHostUser
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        $tenant = app()->bound('currentInstitution') ? app('currentInstitution') : null;
        $ok = $tenant
            ? ($user && $user->role !== 'super_admin' && (int) $user->institution_id === (int) $tenant->id)
            : ($user?->role === 'super_admin' && $user->institution_id === null);
        if (!$ok) {
            return response()->json(['success' => false, 'error' => $user?->role === 'super_admin' ? 'forbidden_host' : 'institution_mismatch',
                'message' => 'Access denied for this host'], 403);
        }
        return $next($request);
    }
}
