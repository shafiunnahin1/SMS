<?php

namespace Tests\Feature\Tenancy;

use App\Models\Institution;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TenantModeTest extends TestCase
{
    use RefreshDatabase;

    private Institution $alpha;
    private Institution $beta;

    protected function setUp(): void
    {
        parent::setUp();
        $echo = fn () => response()->json(['tenant' => app()->bound('currentInstitution') ? app('currentInstitution')->slug : null]);

        Route::prefix('api/v1')->group(function () use ($echo) {
            Route::middleware('tenant')->get('test/tenant-only', $echo);
            Route::middleware('tenant:central')->get('test/central-only', $echo);
            Route::middleware('tenant:optional')->get('health', $echo);
            Route::middleware('tenant:optional')->get('bootstrap', $echo);
            Route::middleware('tenant')->get('auth/probe', $echo);
            Route::middleware('tenant')->get('subscription', $echo);
            Route::middleware('tenant')->get('billing/probe', $echo);
            Route::middleware(['tenant', 'auth:sanctum', 'tenant.user'])->get('test/tenant-user', $echo);
            Route::middleware(['tenant:optional', 'auth:sanctum', 'role:admin'])->get('test/admin-anywhere', $echo);
            Route::middleware(['tenant:optional', 'auth:sanctum', 'role:super_admin'])->get('test/super-anywhere', $echo);
        });

        $this->alpha = $this->makeInstitution('alpha');
        $this->beta  = $this->makeInstitution('beta', 'coaching');
    }

    private function hit(string $host, string $path, ?User $as = null): TestResponse
    {
        $this->app['auth']->forgetGuards();   // a fresh guard per request, as in production
        $headers = $as ? ['Authorization' => 'Bearer ' . $as->createToken('t')->plainTextToken] : [];
        return $this->getJson("http://{$host}/api/v1/{$path}", $headers);
    }

    public function test_tenant_route_binds_the_institution_from_the_host(): void
    {
        $this->hit($this->hostOf($this->alpha), 'test/tenant-only')->assertOk()->assertJson(['tenant' => 'alpha']);
        $this->hit($this->hostOf($this->beta), 'test/tenant-only')->assertOk()->assertJson(['tenant' => 'beta']);
    }

    public function test_tenant_route_on_the_central_host_is_404_institution_not_found(): void
    {
        $this->hit('admin.schoolapp.com', 'test/tenant-only')->assertNotFound()->assertJson(['error' => 'institution_not_found']);
    }

    public function test_unknown_host_is_404_institution_not_found(): void
    {
        $this->hit('nobody.schoolapp.com', 'test/tenant-only')->assertNotFound()->assertJson(['error' => 'institution_not_found']);
        $this->hit('demo.schoolapp.com', 'test/tenant-only')->assertNotFound()->assertJson(['error' => 'institution_not_found']);
    }

    public function test_central_route_on_a_tenant_host_is_404_not_found(): void
    {
        $this->hit('admin.schoolapp.com', 'test/central-only')->assertOk()->assertJson(['tenant' => null]);
        $this->hit($this->hostOf($this->alpha), 'test/central-only')->assertNotFound()->assertJson(['error' => 'not_found']);
    }

    public function test_health_and_bootstrap_work_on_both_hosts_without_a_token(): void
    {
        foreach (['health', 'bootstrap'] as $path) {
            $this->hit('schoolapp.com', $path)->assertOk()->assertJson(['tenant' => null]);
            $this->hit($this->hostOf($this->alpha), $path)->assertOk()->assertJson(['tenant' => 'alpha']);
        }
    }

    public function test_a_tenant_is_never_left_bound_after_the_response(): void
    {
        $this->hit($this->hostOf($this->alpha), 'test/tenant-only')->assertOk();

        $this->assertFalse(app()->bound('currentInstitution'));
    }

    public function test_super_admin_token_on_a_tenant_host_is_403_forbidden_host(): void
    {
        $super = $this->makeUser(null, 'super_admin');

        $this->hit($this->hostOf($this->alpha), 'test/super-anywhere', $super)->assertForbidden()->assertJson(['error' => 'forbidden_host']);
        $this->hit('admin.schoolapp.com', 'test/super-anywhere', $super)->assertOk();
        $this->hit($this->hostOf($this->alpha), 'test/tenant-user', $super)->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
    }

    public function test_tenant_token_on_the_central_host_is_403_institution_mismatch(): void
    {
        $admin = $this->makeUser($this->alpha, 'admin');

        $this->hit('admin.schoolapp.com', 'test/admin-anywhere', $admin)->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
        $this->hit($this->hostOf($this->alpha), 'test/admin-anywhere', $admin)->assertOk()->assertJson(['tenant' => 'alpha']);
    }

    public function test_tenant_token_on_another_tenants_host_is_403_institution_mismatch(): void
    {
        $admin = $this->makeUser($this->alpha, 'admin');

        $this->hit($this->hostOf($this->beta), 'test/tenant-user', $admin)->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
        $this->hit($this->hostOf($this->beta), 'test/admin-anywhere', $admin)->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
        $this->hit($this->hostOf($this->alpha), 'test/tenant-user', $admin)->assertOk()->assertJson(['tenant' => 'alpha']);
    }

    public function test_a_role_the_institution_type_does_not_allow_is_refused(): void
    {
        $tutor = $this->makeInstitution('tutor', 'private_batch');
        $teacher = $this->makeUser($tutor, 'teacher');

        Route::middleware(['tenant', 'auth:sanctum', 'role:teacher'])->get('api/v1/test/teacher-only', fn () => response()->json(['ok' => true]));

        $this->hit($this->hostOf($tutor), 'test/teacher-only', $teacher)->assertForbidden()->assertJson(['error' => 'role_not_available']);
    }

    public function test_a_suspended_institution_reaches_only_auth_bootstrap_subscription_and_billing(): void
    {
        $this->alpha->update(['status' => 'suspended']);
        $host = $this->hostOf($this->alpha);

        foreach (['auth/probe', 'bootstrap', 'health', 'subscription', 'billing/probe'] as $path) {
            $this->hit($host, $path)->assertOk();
        }
        $this->hit($host, 'test/tenant-only')->assertForbidden()->assertJson(['error' => 'institution_suspended']);
    }
}
