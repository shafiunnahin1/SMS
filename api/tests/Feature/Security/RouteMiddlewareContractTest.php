<?php

namespace Tests\Feature\Security;

use Illuminate\Routing\Route as RouteDef;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

// docs/TESTING.md "RouteMiddlewareContractTest" (Step 8.2): every route, read from the router itself - every tenant route has
// auth:sanctum + tenant.user (+ module: when it belongs to a module); no closures; tenancy.bypass only on /super/*, and every
// /super/* route is central-host + super_admin + tenancy.bypass; nothing on tenant:optional serves tenant data. A new route that
// fits none of the known groups fails here until it is placed in one.
class RouteMiddlewareContractTest extends TestCase
{
    /** Framework routes outside the API (each with its reason) */
    private const FRAMEWORK = [
        'GET /' => 'the SPA shell / welcome page',
        'GET up' => 'Laravel health ping (no data)',
        'GET storage/{path}' => 'local private-disk serving of signed temporaryUrl() links (signature checked by Laravel)',
        'GET api/v1/sanctum/csrf-cookie' => 'Sanctum CSRF cookie for the SPA login',
    ];

    /** API routes without a login - each must answer without tenant data */
    private const PUBLIC = [
        'GET api/v1/bootstrap' => 'theme, terms, enabled modules - allow-listed settings only',
        'GET api/v1/health' => 'status only',
        'POST api/v1/auth/login' => 'throttle:login', 'POST api/v1/auth/verify-otp' => 'throttle:login',
        'POST api/v1/auth/forgot-password' => 'throttle:login', 'POST api/v1/auth/reset-password' => 'throttle:login',
        'GET api/v1/billing/bkash/callback' => 'central host; finds its own record by ref (D58), throttle 60/min',
    ];

    /** Routes for a signed-in user on EITHER host (Super Admin on central, everyone else on their own host) */
    private const ANY_HOST_AUTH = ['GET api/v1/auth/me', 'POST api/v1/auth/logout'];

    /** URI prefix (after api/v1/) => the module that must gate it (ModuleGate, config/release.php) */
    private const MODULES = [
        'students' => 'students', 'enrollments' => 'enrollments', 'attendance' => 'attendance', 'fees/' => 'fees', 'parent/fees' => 'fees',
        'exams' => 'exams', 'results' => 'exams', 'parent/children/{id}/results' => 'exams', 'parent/children/{id}/attendance' => 'attendance',
        'sms-logs' => 'sms', 'subscription/sms-credits' => 'sms', 'admin/settings/sms-sender' => 'sms', 'admin/reports' => 'reports',
        'accountant/reports' => 'reports', 'imports' => 'data_migration', 'parent/consents' => 'students', 'students/{id}/enrollments' => 'enrollments',
    ];

    /** @return array<string, RouteDef> "METHOD uri" => route */
    private function routes(): array
    {
        $out = [];
        foreach (Route::getRoutes()->getRoutes() as $r) {
            foreach (array_diff($r->methods(), ['HEAD']) as $m) $out["{$m} {$r->uri()}"] = $r;
        }
        return $out;
    }

    private static function has(RouteDef $r, string $mw): bool { return in_array($mw, $r->gatherMiddleware(), true); }
    private static function hasPrefix(RouteDef $r, string $p): bool { return (bool) array_filter($r->gatherMiddleware(), fn ($m) => is_string($m) && str_starts_with($m, $p)); }

    public function test_every_route_is_in_a_known_group_with_its_middleware(): void
    {
        $problems = [];
        foreach ($this->routes() as $key => $r) {
            if (isset(self::FRAMEWORK[$key])) continue;
            $uri = $r->uri();
            if (!str_starts_with($uri, 'api/v1/')) { $problems[] = "{$key}: outside api/v1 and not a known framework route"; continue; }
            if ($r->getActionName() === 'Closure') $problems[] = "{$key}: closure route";
            $path = substr($uri, strlen('api/v1/'));

            if (isset(self::PUBLIC[$key])) {
                if (self::hasPrefix($r, 'auth:') || self::has($r, 'tenant')) $problems[] = "{$key}: listed public but has auth/tenant";
                if (str_starts_with($path, 'auth/') && !self::has($r, 'throttle:login')) $problems[] = "{$key}: login-type route without throttle:login";
                continue;
            }
            if (in_array($key, self::ANY_HOST_AUTH, true)) {
                if (!self::has($r, 'auth:sanctum') || !self::has($r, 'host.user') || !self::has($r, 'tenant:optional')) $problems[] = "{$key}: needs tenant:optional + auth:sanctum + host.user";
                continue;
            }
            if (str_starts_with($path, 'super/')) {
                foreach (['tenant:central', 'auth:sanctum', 'role:super_admin', 'tenancy.bypass'] as $mw) if (!self::has($r, $mw)) $problems[] = "{$key}: missing {$mw}";
                continue;
            }
            // everything else: a tenant route
            foreach (['tenant', 'auth:sanctum', 'tenant.user', 'password.fresh', 'subscription'] as $mw) if (!self::has($r, $mw)) $problems[] = "{$key}: missing {$mw}";
            if (self::has($r, 'tenancy.bypass')) $problems[] = "{$key}: tenancy.bypass outside /super";
            // the most specific prefix decides (students/{id}/enrollments belongs to enrollments, not students)
            $best = null;
            foreach (self::MODULES as $prefix => $module) {
                $match = str_contains($prefix, '{') ? $path === $prefix : str_starts_with($path, $prefix);
                if ($match && ($best === null || strlen($prefix) > strlen($best))) $best = $prefix;
            }
            $module = $best === null ? null : self::MODULES[$best];
            if ($module && !self::has($r, "module:{$module}")) $problems[] = "{$key}: missing module:{$module}";
        }
        $this->assertSame([], $problems);
    }

    public function test_tenancy_bypass_and_optional_tenant_are_used_only_where_listed(): void
    {
        foreach ($this->routes() as $key => $r) {
            $path = substr($r->uri(), strlen('api/v1/'));
            if (self::has($r, 'tenancy.bypass')) $this->assertStringStartsWith('super/', $path, "{$key}: tenancy.bypass");
            if (self::has($r, 'tenant:optional')) $this->assertTrue(isset(self::PUBLIC[$key]) || in_array($key, self::ANY_HOST_AUTH, true), "{$key}: tenant:optional serves no tenant data");
        }
    }

    public function test_the_listed_exceptions_still_exist(): void
    {
        $all = $this->routes();
        foreach ([...array_keys(self::FRAMEWORK), ...array_keys(self::PUBLIC), ...self::ANY_HOST_AUTH] as $key) {
            $this->assertArrayHasKey($key, $all, "stale exception {$key}");
        }
    }
}
