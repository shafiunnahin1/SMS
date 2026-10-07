<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Expiry only. D47: no student/batch/size limits of any kind - never add max_students / max_batches here.
// Module checks are route `module:x` middleware (ModuleGate), not this class.
class SubscriptionCheck
{
    // Expired institutions must still be able to log in, see their status and pay
    private const BYPASS = ['api/v1/auth/*', 'api/v1/subscription*', 'api/v1/billing/*', 'api/v1/health', 'api/v1/bootstrap'];
    private const GRACE_DAYS = 3;

    public function handle(Request $request, Closure $next)
    {
        if (auth()->user()?->role === 'super_admin') return $next($request);

        $institution = app()->bound('currentInstitution') ? app('currentInstitution') : null;
        if (!$institution || $request->is(...self::BYPASS)) return $next($request);

        $expires = $institution->subscription_expires_at;
        if ($expires && $expires->copy()->addDays(self::GRACE_DAYS)->isPast()) {
            return response()->json([
                'success' => false, 'error' => 'subscription_expired',
                'message' => __('errors.subscription_expired'),
                'expired_at' => $expires, 'renew_url' => url('/admin/subscription'),
            ], 403);
        }

        return $next($request);
    }
}
