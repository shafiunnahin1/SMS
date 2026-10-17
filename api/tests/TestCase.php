<?php

namespace Tests;

use App\Models\Institution;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /** Bind a tenant for the rest of the test; released when the application is torn down (docs/TESTING.md Revision 7) */
    protected function bindTenant(Institution $institution): void
    {
        app()->instance('currentInstitution', $institution);
        $this->beforeApplicationDestroyed(fn () => app()->forgetInstance('currentInstitution'));
    }

    protected function makeInstitution(string $slug, string $type = 'school', string $status = 'active'): Institution
    {
        return Institution::create(['name' => ucfirst($slug), 'slug' => $slug, 'institution_type' => $type, 'status' => $status]);
    }

    protected function makeUser(?Institution $institution, string $role): User
    {
        return User::create([
            'institution_id' => $institution?->id,
            'name' => $role, 'email' => $role . '-' . ($institution?->slug ?? 'platform') . '@example.test',
            'password' => 'Secret@1234', 'role' => $role, 'is_active' => true,
        ]);
    }

    protected function hostOf(Institution $institution): string
    {
        return $institution->slug . '.' . config('tenancy.base_domain');
    }

    protected function asTenant(Institution $institution, \Closure $fn): mixed
    {
        return Tenancy::as($institution, $fn);
    }

    /** One API request on $host as $user (a fresh Sanctum token and a fresh guard, as in production) */
    protected function api(string $method, string $host, string $path, ?User $as = null, array $data = []): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();
        $headers = $as ? ['Authorization' => 'Bearer ' . $as->createToken('t')->plainTextToken] : [];
        return $this->json($method, "http://{$host}/api/v1/" . ltrim($path, '/'), $data, $headers);
    }
}
