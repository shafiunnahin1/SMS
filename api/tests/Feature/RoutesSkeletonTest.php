<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Artisan, Route};
use Tests\TestCase;

// Step 2.7 Done When: route:list and route:cache succeed (no closures, no duplicate names) and GET /api/v1/health answers
// without a token on every kind of host; 503 when a dependency is down
class RoutesSkeletonTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.stores.redis' => ['driver' => 'array']]);   // Redis is not required to run the suite
    }

    public function test_health_answers_without_a_token_on_tenant_and_central_hosts(): void
    {
        $tenant = $this->makeInstitution('dhanmondi');
        foreach ([$this->hostOf($tenant), 'admin.' . config('tenancy.base_domain')] as $host) {
            $this->api('GET', $host, 'health')->assertOk()->assertJson(['status' => 'ok', 'db' => 'ok', 'redis' => 'ok']);
        }
        $this->api('GET', $this->hostOf($this->makeInstitution('closed', 'school', 'suspended')), 'health')->assertOk();
    }

    public function test_health_is_503_when_a_dependency_is_down(): void
    {
        config(['cache.stores.redis' => ['driver' => 'redis', 'connection' => 'nowhere']]);
        $this->api('GET', $this->hostOf($this->makeInstitution('dhanmondi')), 'health')
            ->assertStatus(503)->assertJson(['status' => 'degraded', 'db' => 'ok', 'redis' => 'error']);
    }

    public function test_every_api_route_is_versioned_cacheable_and_uniquely_named(): void
    {
        $api = array_filter(Route::getRoutes()->getRoutes(), fn ($r) => str_starts_with($r->uri(), 'api/'));
        $this->assertNotEmpty($api);
        foreach ($api as $r) {
            $this->assertStringStartsWith('api/v1/', $r->uri());
            $this->assertIsString($r->getAction('uses'), "{$r->uri()} uses a closure: route:cache would fail");
        }
        $names = array_filter(array_map(fn ($r) => $r->getName(), $api));
        $this->assertSame(array_unique($names), $names, 'duplicate route names');
    }

    public function test_route_list_runs(): void
    {
        $this->assertSame(0, Artisan::call('route:list', ['--path' => 'api/v1', '--json' => true]));
        $this->assertStringContainsString('api\/v1\/health', Artisan::output());
    }
}
