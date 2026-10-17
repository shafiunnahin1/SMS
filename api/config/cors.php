<?php

// docs/SECURITY.md "CORS Configuration": only the platform's own domain and its subdomains (tenants, admin.) may call the API
// from another origin. The SPA itself is same-origin (also on a custom domain), so it never needs CORS. Plain http is allowed
// only outside production (local lvh.me with the Vite port).
$base = preg_quote((string) env('APP_BASE_DOMAIN', 'schoolapp.com'), '#');
$scheme = env('APP_ENV', 'production') === 'production' ? 'https' : 'https?';

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    'allowed_origins' => [],
    'allowed_origins_patterns' => ["#^{$scheme}://([a-z0-9-]+\\.)*{$base}(:\\d+)?$#"],
    'allowed_headers' => ['Content-Type', 'Authorization', 'Accept-Language', 'Accept'],
    'exposed_headers' => ['Content-Disposition', 'Content-Language'],
    'max_age' => 3600,
    'supports_credentials' => false,
];
