<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** D90/R3.6a: ship the new login identity without granting legacy business access.
 * R3.6b must add reviewed capability/resource enforcement before opening business routes.
 */
class StaffIdentityBoundary
{
    private const OWN_IDENTITY = [
        'PATCH api/v1/auth/change-password', 'GET api/v1/auth/sessions', 'DELETE api/v1/auth/sessions/{id}',
        'POST api/v1/auth/logout-all', 'PUT api/v1/auth/locale', 'GET api/v1/notifications',
        'PATCH api/v1/notifications/read-all', 'PATCH api/v1/notifications/{id}/read', 'PATCH api/v1/staff/profile',
        'GET api/v1/staff/departments', 'HEAD api/v1/staff/departments',
        'GET api/v1/staff/departments/{id}/portal', 'HEAD api/v1/staff/departments/{id}/portal',
    ];
    public function handle(Request $request, Closure $next)
    {
        if ($request->user()?->role === 'institution_staff'
            && !in_array($request->method().' '.$request->route()->uri(), self::OWN_IDENTITY, true)) {
            return response()->json(['success' => false, 'error' => 'forbidden', 'message' => __('errors.forbidden')], 403);
        }
        return $next($request);
    }
}
