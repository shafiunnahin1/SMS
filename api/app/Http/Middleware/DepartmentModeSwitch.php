<?php

namespace App\Http\Middleware;

use App\Support\DepartmentMode;
use Closure;
use Illuminate\Http\Request;

// D206 TDM.2: runs right after the login checks, before StaffIdentityBoundary and the role middleware: a teacher with a selected
// department on a route that admits staff acts as department staff for this request (App\Support\DepartmentMode).
class DepartmentModeSwitch
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        if (DepartmentMode::applies($request, $user)) {
            DepartmentMode::enter($request, $user);
            // D206 TDM.3: never on their own matters (owner choice)
            if (\App\Support\OwnMatter::refused($request, $user)) {
                return response()->json(['success' => false, 'error' => 'own_matter', 'message' => __('errors.own_matter')], 403);
            }
        }
        return $next($request);
    }
}
