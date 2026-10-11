<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Alias `password.fresh` (docs/AUTHORIZATION.md "First Login Password Change"): a user created with a default password
// (e.g. student ID) can only change it, read themselves and log out until they do.
class EnsurePasswordChanged
{
    private const ALLOWED = ['api/v1/auth/change-password', 'api/v1/auth/me', 'api/v1/auth/logout', 'api/v1/auth/logout-all', 'api/v1/auth/sessions*', 'api/v1/auth/locale', 'api/v1/writer/change-password'];

    public function handle(Request $request, Closure $next)
    {
        if ($request->user()?->must_change_password && !$request->is(...self::ALLOWED)) {
            return response()->json(['success' => false, 'error' => 'must_change_password', 'message' => __('errors.must_change_password')], 403);
        }
        return $next($request);
    }
}
