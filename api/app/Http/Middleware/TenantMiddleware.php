<?php

namespace App\Http\Middleware;

use App\Services\Tenancy\TenantResolver;
use Closure;
use Illuminate\Http\Request;

// The tenant comes ONLY from the request Host - no client-supplied header is trusted.
// Modes: tenant (required) | tenant:optional | tenant:central (docs/templates/laravel-core-files.md "routes/api.php").
class TenantMiddleware
{
    // Paths a SUSPENDED institution may still reach (to see why and to pay)
    private const SUSPENDED_ALLOWED = ['api/v1/auth/*', 'api/v1/bootstrap', 'api/v1/health', 'api/v1/subscription*', 'api/v1/billing/*'];

    public function __construct(private TenantResolver $resolver) {}

    public function handle(Request $request, Closure $next, string $mode = 'required')
    {
        $host    = strtolower($request->getHost());
        $central = $this->resolver->isCentralHost($host);

        if ($mode === 'central') {
            return $central ? $next($request) : $this->fail('not_found', 'Not found', 404);
        }

        if ($central) {
            // optional: login/bootstrap/health on the central host (no tenant bound)
            return $mode === 'optional'
                ? $next($request)
                : $this->fail('institution_not_found', 'Institution not found for this domain', 404);
        }

        $institution = $this->resolver->resolve($host);
        if (!$institution) {
            return $this->fail('institution_not_found', 'Institution not found for this domain', 404);
        }

        if ($institution->status === 'suspended' && !$request->is(...self::SUSPENDED_ALLOWED)) {
            return $this->fail('institution_suspended', 'এই প্রতিষ্ঠানের অ্যাকাউন্ট স্থগিত আছে', 403);
        }

        app()->instance('currentInstitution', $institution);
        return $next($request);
    }

    /** Never leave a tenant bound after the response (long-lived workers / Octane) */
    public function terminate($request, $response): void { app()->forgetInstance('currentInstitution'); }

    private function fail(string $error, string $message, int $status)
    {
        return response()->json(['success' => false, 'error' => $error, 'message' => __("errors.{$error}")], $status);
    }
}
