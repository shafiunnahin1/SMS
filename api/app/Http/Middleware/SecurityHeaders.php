<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// docs/ops/security-checklist.md "HTTPS only (HSTS header set)" + OWASP A05 (headers): on every response. HSTS only on an
// https request - sent over plain http it would be ignored, and local http (lvh.me) must keep working.
class SecurityHeaders
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);
        $h = $response->headers;
        $h->set('X-Content-Type-Options', 'nosniff');
        $h->set('X-Frame-Options', 'DENY');
        $h->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        if ($request->isSecure()) $h->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        return $response;
    }
}
