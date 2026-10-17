<?php

namespace Tests\Feature;

use App\Services\DepartmentRoutePermissionResolver;
use App\Support\{DepartmentPermissionKeys, DepartmentRouteCatalog};
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Tests\TestCase;

class DepartmentRouteInventoryTest extends TestCase
{
    public function test_code_owned_catalog_preserves_the_entire_approved_matrix_and_foundation_contract(): void
    {
        $approved = json_decode(file_get_contents(base_path('../docs/department-permission-contract.json')), true, flags: JSON_THROW_ON_ERROR);
        $this->assertCount(297, DepartmentRouteCatalog::CAPTURED);
        $this->assertCount(22, DepartmentRouteCatalog::FOUNDATION);
        $this->assertSame($approved['routes'], DepartmentRouteCatalog::CAPTURED);
        $this->assertSame($approved['planned_foundation_routes'], DepartmentRouteCatalog::FOUNDATION);
        $counts = [];
        foreach (DepartmentRouteCatalog::CAPTURED as $entry) $counts[$entry['staff_mode']] = ($counts[$entry['staff_mode']] ?? 0) + 1;
        $this->assertEqualsCanonicalizing($approved['mode_counts'], $counts);
        foreach (DepartmentRouteCatalog::CAPTURED as $entry) {
            $this->assertSame('D90', $entry['approval']);
            $this->assertNotEmpty($entry['resource_scope']);
            foreach ($entry['permission_options'] as $key) $this->assertContains($key, DepartmentPermissionKeys::ALL);
        }
    }

    public function test_every_live_route_is_classified_and_captured_action_and_module_boundaries_still_match(): void
    {
        $resolver = app(DepartmentRoutePermissionResolver::class); $seen = [];
        foreach (\Illuminate\Support\Facades\Route::getRoutes()->getRoutes() as $route) {
            if (!str_starts_with($route->uri(), 'api/v1/')) continue;
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $key = $method.' '.$route->uri(); $seen[] = $key;
                $captured = collect(DepartmentRouteCatalog::CAPTURED)->first(fn ($e) => $e['uri'] === $route->uri() && in_array($method, explode('|', $e['method']), true));
                if ($captured && $captured['selector_variants']) {
                    $variant = $captured['selector_variants'][0];
                    $request = $this->request($route, $method, [$variant['selector'] => $variant['value']]);
                } else $request = $this->request($route, $method);
                $result = $resolver->resolve($request); $this->assertNotNull($result, $key);
                $this->assertArrayNotHasKey('allowed', $result);
                if (!$captured) continue;
                $this->assertSame($captured['action'], ltrim($route->getActionName(), '\\'), $key);
                $gates = array_values(array_filter(app('router')->gatherRouteMiddleware($route), fn ($m) => str_starts_with($m, 'App\\Http\\Middleware\\ModuleMiddleware:') || str_starts_with($m, 'App\\Http\\Middleware\\FeatureMiddleware:')));
                $expectedGates = $captured['current_module_feature_gates'];
                $this->assertSame($expectedGates, $gates, $key);
            }
        }
        $this->assertCount(count(array_unique($seen)), $seen, 'No duplicated method/URI silently shadows a rule');
        foreach (DepartmentRouteCatalog::CAPTURED as $entry) {
            foreach (array_diff(explode('|', $entry['method']), ['HEAD']) as $method) $this->assertContains($method.' '.$entry['uri'], $seen);
        }
    }

    public function test_each_selector_uses_only_exact_bound_path_values_and_preserves_principal_only_actions(): void
    {
        $resolver = app(DepartmentRoutePermissionResolver::class);
        foreach (DepartmentRouteCatalog::CAPTURED as $entry) {
            if (!$entry['selector_variants']) continue;
            $method = explode('|', $entry['method'])[0];
            foreach ($entry['selector_variants'] as $variant) {
                $route = new Route([$method], $entry['uri'], ['uses' => $entry['action'], 'controller' => $entry['action']]);
                $request = $this->request($route, $method, [$variant['selector'] => $variant['value']], [$variant['selector'] => 'override']);
                $resolved = $resolver->resolve($request); $this->assertNotNull($resolved, $entry['uri'].' '.$variant['value']);
                $this->assertSame($variant['principal_only'] ? null : $variant['permission'], $resolved['permission']);
                $this->assertSame($variant['principal_only'] ? 'principal_only' : 'exact_duty_permission', $resolved['resolved_mode']);
                $this->assertSame($variant['resource_scope'], $resolved['contract']['resource_scope']);
            }
            foreach ([null, 'unknown', '*', strtoupper($entry['selector_variants'][0]['value']), ['approve']] as $bad) {
                $variant = $entry['selector_variants'][0];
                $route = new Route([$method], $entry['uri'], ['uses' => $entry['action'], 'controller' => $entry['action']]);
                $request = $this->request($route, $method, [$variant['selector'] => $bad], [$variant['selector'] => $variant['value']]);
                $this->assertNull($resolver->resolve($request), $entry['uri']);
            }
        }
    }

    public function test_head_matches_get_but_unknown_routes_and_action_drift_fail_closed(): void
    {
        $resolver = app(DepartmentRoutePermissionResolver::class);
        foreach (DepartmentRouteCatalog::CAPTURED as $entry) {
            if ($entry['method'] !== 'GET|HEAD' || $entry['selector_variants']) continue;
            $route = new Route(['GET', 'HEAD'], $entry['uri'], ['uses' => $entry['action'], 'controller' => $entry['action']]);
            $get = $resolver->resolve($this->request($route, 'GET'));
            $this->assertNotNull($get, $entry['uri']);
            $this->assertSame($get, $resolver->resolve($this->request($route, 'HEAD')));
        }
        $unknown = new Route(['GET'], 'api/v1/not-approved', ['uses' => 'App\\Http\\Controllers\\DepartmentController@index']);
        $this->assertNull($resolver->resolve($this->request($unknown, 'GET')));
        $known = DepartmentRouteCatalog::CAPTURED[0];
        $drift = new Route(['GET'], $known['uri'], ['uses' => 'App\\Http\\Controllers\\DepartmentController@index']);
        $this->assertNull($resolver->resolve($this->request($drift, 'GET')));
        $this->assertNull($resolver->resolve(Request::create('/api/v1/programs')));
    }

    public function test_d100_inventory_routes_match_live_routes_and_stay_principal_only(): void
    {
        $resolver = app(DepartmentRoutePermissionResolver::class);
        $this->assertCount(9, DepartmentRouteCatalog::D100);
        foreach (DepartmentRouteCatalog::D100 as $entry) {
            $this->assertSame(['D100', 'principal_only', [], ['accountant', 'admin']], [$entry['approval'], $entry['staff_mode'], $entry['permission_options'], $entry['current_roles']]);
            $this->assertStringStartsWith('api/v1/inventory/', $entry['uri']);
            foreach (array_diff(explode('|', $entry['method']), ['HEAD']) as $method) {
                $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())->first(fn ($r) => $r->uri() === $entry['uri'] && in_array($method, $r->methods(), true));
                $this->assertNotNull($route, $method.' '.$entry['uri']);
                $this->assertSame($entry['action'], ltrim($route->getActionName(), '\\'));
                $result = $resolver->resolve($this->request($route, $method));
                $this->assertSame(['principal_only', null], [$result['resolved_mode'] ?? null, array_key_exists('permission', $result ?? []) ? $result['permission'] : 'missing'], $method.' '.$entry['uri']);
            }
        }
    }

    public function test_d94_teacher_index_overlay_is_exact_and_keeps_the_sealed_capture_unchanged(): void
    {
        $this->assertCount(297, DepartmentRouteCatalog::CAPTURED);
        $this->assertCount(1, DepartmentRouteCatalog::D94);
        $entry = DepartmentRouteCatalog::D94[0];
        $this->assertSame(['GET|HEAD', 'api/v1/teachers', 'D94', ['admin', 'institution_staff'], 'exact_duty_permission', ['staff.teacher.index']], [
            $entry['method'], $entry['uri'], $entry['approval'], $entry['current_roles'], $entry['staff_mode'], $entry['permission_options'],
        ]);

        $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array('GET', $candidate->methods(), true));
        $this->assertNotNull($route);
        $resolver = app(DepartmentRoutePermissionResolver::class);
        $get = $resolver->resolve($this->request($route, 'GET'));
        $head = $resolver->resolve($this->request($route, 'HEAD'));
        $this->assertSame(['D94', 'exact_duty_permission', 'staff.teacher.index'], [
            $get['contract']['approval'], $get['resolved_mode'], $get['permission'],
        ]);
        $this->assertSame($get, $head);
    }

    public function test_d101_teacher_advance_overlay_keeps_teacher_role_and_requires_own_payee_scope(): void
    {
        $this->assertCount(16, DepartmentRouteCatalog::D101);
        $entry = DepartmentRouteCatalog::D101[0];
        $this->assertSame(['GET|HEAD', 'api/v1/teacher/salary/advances', 'D101', ['teacher', 'institution_staff'], ['staff.salary_advance.mine']], [
            $entry['method'], $entry['uri'], $entry['approval'], $entry['current_roles'], $entry['permission_options'],
        ]);
        $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array('GET', $candidate->methods(), true));
        $this->assertNotNull($route);
        $this->assertContains('App\\Http\\Middleware\\ModuleMiddleware:hr_payroll', app('router')->gatherRouteMiddleware($route));
        $resolver = app(DepartmentRoutePermissionResolver::class);
        foreach (['GET', 'HEAD'] as $method) {
            $resolved = $resolver->resolve($this->request($route, $method));
            $this->assertSame(['D101', 'exact_duty_permission', 'staff.salary_advance.mine'], [
                $resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission'],
            ]);
        }
    }

    public function test_d101_teacher_dashboard_overlay_keeps_teacher_role_and_requires_own_teacher_scope(): void
    {
        $entry = DepartmentRouteCatalog::D101[1];
        $this->assertSame(['GET|HEAD', 'api/v1/teacher/dashboard', 'D101', ['teacher', 'institution_staff'], ['staff.dashboard.teacher'], []], [
            $entry['method'], $entry['uri'], $entry['approval'], $entry['current_roles'], $entry['permission_options'], $entry['current_module_feature_gates'],
        ]);
        $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array('GET', $candidate->methods(), true));
        $this->assertNotNull($route);
        $this->assertContains('App\\Http\\Middleware\\RoleMiddleware:teacher,institution_staff', app('router')->gatherRouteMiddleware($route));
        foreach (['GET', 'HEAD'] as $method) {
            $resolved = app(DepartmentRoutePermissionResolver::class)->resolve($this->request($route, $method));
            $this->assertSame(['D101', 'exact_duty_permission', 'staff.dashboard.teacher'], [$resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission']]);
        }
    }

    public function test_d101_accountant_dashboard_overlay_requires_exact_duty(): void
    {
        $entry = DepartmentRouteCatalog::D101[2];
        $this->assertSame(['GET|HEAD', 'api/v1/accountant/dashboard', 'D101', ['accountant', 'institution_staff'], ['staff.dashboard.accountant']], [
            $entry['method'], $entry['uri'], $entry['approval'], $entry['current_roles'], $entry['permission_options'],
        ]);
        $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array('GET', $candidate->methods(), true));
        $this->assertContains('App\\Http\\Middleware\\RoleMiddleware:accountant,institution_staff', app('router')->gatherRouteMiddleware($route));
        $resolved = app(DepartmentRoutePermissionResolver::class)->resolve($this->request($route, 'GET'));
        $this->assertSame(['D101', 'exact_duty_permission', 'staff.dashboard.accountant'], [$resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission']]);
    }

    public function test_d101_sms_log_overlay_keeps_module_gate_and_requires_exact_duty(): void
    {
        $entry = DepartmentRouteCatalog::D101[3];
        $this->assertSame(['GET|HEAD', 'api/v1/sms-logs', 'D101', ['staff.sms_log.index']], [$entry['method'], $entry['uri'], $entry['approval'], $entry['permission_options']]);
        $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array('GET', $candidate->methods(), true));
        $middleware = app('router')->gatherRouteMiddleware($route);
        $this->assertContains('App\\Http\\Middleware\\ModuleMiddleware:sms', $middleware);
        $this->assertContains('App\\Http\\Middleware\\RoleMiddleware:admin,accountant,institution_staff', $middleware);
        $resolved = app(DepartmentRoutePermissionResolver::class)->resolve($this->request($route, 'GET'));
        $this->assertSame(['D101', 'exact_duty_permission', 'staff.sms_log.index'], [$resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission']]);
    }

    public function test_d101_financial_report_overlay_resolves_only_reviewed_report_types(): void
    {
        $entry = DepartmentRouteCatalog::D101[4];
        $this->assertSame(['api/v1/accountant/reports/{type}', 'D101', 'conditional_report_type', ['accountant', 'institution_staff']], [$entry['uri'], $entry['approval'], $entry['staff_mode'], $entry['current_roles']]);
        $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array('GET', $candidate->methods(), true));
        $this->assertContains('App\\Http\\Middleware\\ModuleMiddleware:reports', app('router')->gatherRouteMiddleware($route));
        $resolver = app(DepartmentRoutePermissionResolver::class);
        foreach (['dues' => 'staff.report.dues', 'fees' => 'staff.report.fees'] as $type => $key) {
            $resolved = $resolver->resolve($this->request($route, 'GET', ['type' => $type]));
            $this->assertSame(['D101', 'exact_duty_permission', $key], [$resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission']]);
        }
        $this->assertNull($resolver->resolve($this->request($route, 'GET', ['type' => 'students'])), 'an unreviewed report type resolves to nothing');
    }

    public function test_d101_salary_history_overlay_is_own_payee_and_keeps_module_gate(): void
    {
        $entry = DepartmentRouteCatalog::D101[5];
        $this->assertSame(['api/v1/hr/people/{type}/{id}/salary', 'D101', ['staff.salary_structure.history']], [$entry['uri'], $entry['approval'], $entry['permission_options']]);
        $this->assertStringContainsString('own payee only', $entry['resource_scope']);
        $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array('GET', $candidate->methods(), true));
        $this->assertContains('App\\Http\\Middleware\\ModuleMiddleware:hr_payroll', app('router')->gatherRouteMiddleware($route));
        $resolved = app(DepartmentRoutePermissionResolver::class)->resolve($this->request($route, 'GET'));
        $this->assertSame(['D101', 'exact_duty_permission', 'staff.salary_structure.history'], [$resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission']]);
    }

    public function test_d101_attendance_overlay_is_own_batch_and_keeps_module_gate(): void
    {
        $keys = ['staff.attendance.index', 'staff.attendance.store', 'staff.attendance.report', 'staff.attendance.summary', 'staff.attendance.update'];
        $resolver = app(DepartmentRoutePermissionResolver::class);
        foreach ($keys as $offset => $key) {
            $entry = DepartmentRouteCatalog::D101[6 + $offset];
            $this->assertSame(['D101', ['admin', 'institution_staff', 'teacher'], [$key]], [$entry['approval'], $entry['current_roles'], $entry['permission_options']]);
            $this->assertStringStartsWith('D101 own active linked Teacher', $entry['resource_scope']);
            $method = explode('|', $entry['method'])[0];
            $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
                ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array($method, $candidate->methods(), true));
            $middleware = app('router')->gatherRouteMiddleware($route);
            $this->assertContains('App\\Http\\Middleware\\ModuleMiddleware:attendance', $middleware);
            $this->assertContains('App\\Http\\Middleware\\RoleMiddleware:admin,teacher,institution_staff', $middleware);
            $resolved = $resolver->resolve($this->request($route, $method));
            $this->assertSame(['D101', 'exact_duty_permission', $key], [$resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission']]);
        }
    }

    public function test_d101_results_overlay_is_own_subject_and_keeps_module_gate(): void
    {
        $keys = ['staff.result.entry_sheet', 'staff.result.index', 'staff.result.bulk_store', 'staff.result.marksheet', 'staff.result.update'];
        $resolver = app(DepartmentRoutePermissionResolver::class);
        foreach ($keys as $offset => $key) {
            $entry = DepartmentRouteCatalog::D101[11 + $offset];
            $this->assertSame(['D101', [$key]], [$entry['approval'], $entry['permission_options']]);
            $this->assertContains('institution_staff', $entry['current_roles']);
            $this->assertStringStartsWith('D101 own active linked Teacher', $entry['resource_scope']);
            $method = explode('|', $entry['method'])[0];
            $route = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
                ->first(fn ($candidate) => $candidate->uri() === $entry['uri'] && in_array($method, $candidate->methods(), true));
            $this->assertContains('App\\Http\\Middleware\\ModuleMiddleware:exams', app('router')->gatherRouteMiddleware($route));
            $resolved = $resolver->resolve($this->request($route, $method));
            $this->assertSame(['D101', 'exact_duty_permission', $key], [$resolved['contract']['approval'], $resolved['resolved_mode'], $resolved['permission']]);
        }
    }

    private function request(Route $original, string $method, array $parameters = [], array $body = []): Request
    {
        $request = Request::create('/'.preg_replace('/\{[^}]+\}/', 'fixture', $original->uri()), $method, $body);
        $route = clone $original; $route->bind($request);
        foreach ($parameters as $key => $value) $route->setParameter($key, $value);
        $request->setRouteResolver(fn () => $route);
        return $request;
    }
}
