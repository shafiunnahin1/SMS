<?php

namespace App\Http\Middleware;

use App\Services\InstitutionSettings;
use App\Support\Tenancy;
use Closure;
use Illuminate\Http\Request;

// docs/I18N.md section 6 with decision D53: users.locale -> the remembered choice -> the institution's default_locale -> bn.
// The remembered choice travels as the app's own `Accept-Language: <code>` (axios sends exactly one code); a browser's language
// list ("en-US,en;q=0.9") is NOT used (D53). Values outside the enabled list are always dropped. Runs right after `tenant`;
// it reads the user through the sanctum guard, which `auth:sanctum` then reuses.
class SetLocale
{
    public function __construct(private InstitutionSettings $settings) {}

    public function handle(Request $request, Closure $next)
    {
        $inst = Tenancy::current();
        if ($inst) {
            $lang = $this->settings->language($inst);
            [$enabled, $default] = [$lang['enabled'], $lang['default']];
        } else {
            [$enabled, $default] = [config('i18n.platform_locales'), 'bn'];
        }

        $locale = collect([$this->userLocale($request), self::fromHeader($request)])
            ->first(fn ($l) => $l && in_array($l, $enabled, true)) ?? $default;
        app()->setLocale($locale);

        $response = $next($request);
        $response->headers->set('Content-Language', $locale);
        return $response;
    }

    private function userLocale(Request $request): ?string
    {
        return $request->bearerToken() || $request->hasSession() ? $request->user('sanctum')?->locale : null;
    }

    /** Only a bare code our SPA sets (bn, en ...) - never a browser's weighted list. Also used for an unknown API path (no route, no middleware). */
    public static function fromHeader(Request $request): ?string
    {
        $h = strtolower(trim((string) $request->header('Accept-Language')));
        return preg_match('/^[a-z]{2}$/', $h) ? $h : null;
    }
}
