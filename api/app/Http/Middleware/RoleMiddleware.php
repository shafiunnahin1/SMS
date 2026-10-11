<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// (1) the role must match, (2) super_admin only on the central host, everyone else only on their own tenant host,
// (3) a role the institution type does not allow is refused. Authorization is users.role + this middleware only (D17).
class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = auth()->user();
        if (!$user) return $this->fail('unauthenticated', 'Please login to continue', 401);

        if (!in_array($user->role, $roles, true)) {
            return $this->fail('forbidden', 'You do not have permission to perform this action', 403);
        }

        $tenant = app()->bound('currentInstitution') ? app('currentInstitution') : null;

        if (in_array($user->role, \App\Models\User::PLATFORM_ROLES, true)) {
            // Super Admin and the question-bank writers (D65) never act inside a tenant host, and own no institution
            if ($tenant || $user->institution_id !== null) return $this->fail('forbidden_host', 'Super Admin can only be used on the admin domain', 403);
            return $next($request);
        }

        // Every other role must be on its own tenant host
        if (!$tenant || (int) $user->institution_id !== (int) $tenant->id) {
            return $this->fail('institution_mismatch', 'Access denied — institution mismatch', 403);
        }
        if (!in_array($user->role, config("institution_types.{$tenant->institution_type}.roles", []), true)) {
            return $this->fail('role_not_available', 'This role is not available for this institution type', 403);
        }

        return $next($request);
    }

    private function fail(string $error, string $message, int $status)
    {
        return response()->json(['success' => false, 'error' => $error, 'message' => __("errors.{$error}")], $status);
    }
}
