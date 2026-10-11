<?php

namespace Tests\Feature\Security;

use App\Models\{Institution, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Queue, Route};
use Tests\TestCase;

// docs/TESTING.md "RoleMatrixContractTest" (Step 8.2): every authenticated route x the six roles (+ the two D65 writer roles), against tests/Fixtures/role-matrix.php
// (docs/SECURITY.md as data). A role the matrix does not allow gets 403; an allowed role never gets 403 (nor a 500) - with
// placeholder ids it may well be 404 / 422, which is fine: the door opened. A route missing from the matrix fails the test.
class RoleMatrixContractTest extends TestCase
{
    use RefreshDatabase;

    private const ROLES = ['super_admin', 'admin', 'teacher', 'accountant', 'parent', 'student', 'content_writer', 'content_moderator'];   // + D65 platform writers
    private const PARAMS = ['{id}' => '999999', '{studentId}' => '999999', '{subjectId}' => '999999', '{institutionId}' => '999999',
        '{type}' => 'students', '{kind}' => 'students', '{action}' => 'dry-run'];

    private static function matrix(): array { return require base_path('tests/Fixtures/role-matrix.php'); }

    /** "METHOD uri" of every route behind auth:sanctum, except the any-host /auth/me and /auth/logout */
    private static function authRoutes(): array
    {
        $out = [];
        foreach (Route::getRoutes()->getRoutes() as $r) {
            $mw = $r->gatherMiddleware();
            if (!in_array('auth:sanctum', $mw, true) || in_array('host.user', $mw, true)) continue;
            foreach (array_diff($r->methods(), ['HEAD']) as $m) $out[] = "{$m} {$r->uri()}";
        }
        sort($out);
        return $out;
    }

    public function test_the_matrix_lists_exactly_the_authenticated_routes(): void
    {
        $keys = array_keys(self::matrix());
        sort($keys);
        $this->assertSame([], array_values(array_diff(self::authRoutes(), $keys)), 'add these routes to tests/Fixtures/role-matrix.php');
        $this->assertSame([], array_values(array_diff($keys, self::authRoutes())), 'stale rows in the matrix');
        foreach (self::matrix() as $key => $roles) {
            $this->assertSame([], array_values(array_diff($roles, self::ROLES)), "{$key}: unknown role");
            if (str_starts_with(explode(' ', $key, 2)[1], 'api/v1/super/')) $this->assertSame(['super_admin'], $roles, "{$key}: the platform panel is Super Admin only");
        }
    }

    public function test_every_route_lets_in_exactly_the_roles_of_the_matrix(): void
    {
        Queue::fake();
        $i = $this->makeInstitution('matrix');
        // every R1 module and the custom_branding feature on, so only the ROLE can close a door here
        $i->forceFill(['enabled_modules' => array_fill_keys(config('release.modules'), true) + ['custom_branding' => true]])->save();
        $users = [];
        foreach (self::ROLES as $role) {
            $users[$role] = in_array($role, User::PLATFORM_ROLES, true) ? $this->makeUser(null, $role) : $this->makeUser($i, $role);
            $users[$role]->forceFill(['must_change_password' => false])->save();
        }
        $central = 'admin.' . config('tenancy.base_domain');

        $wrong = [];
        foreach (self::matrix() as $key => $allowed) {
            [$method, $uri] = explode(' ', $key, 2);
            $path = strtr(substr($uri, strlen('api/v1/')), self::PARAMS);
            $host = str_starts_with($path, 'super/') || str_starts_with($path, 'writer/') ? $central : $this->hostOf($i);
            foreach (self::ROLES as $role) {
                $status = $this->api($method, $host, $path, $users[$role])->baseResponse->getStatusCode();     // a file download is a BinaryFileResponse
                $ok = in_array($role, $allowed, true);
                if ($ok && ($status === 403 || $status >= 500)) $wrong[] = "{$key} as {$role}: {$status} (allowed)";
                if (!$ok && $status !== 403) $wrong[] = "{$key} as {$role}: {$status} (should be 403)";
            }
        }
        $this->assertSame([], $wrong);
    }
}
