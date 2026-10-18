<?php

namespace Tests\Feature\Auth;

use App\Models\{Institution, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

// Decision D51: the web (our own SPA on the tenant's host) logs in with an HttpOnly session that carries the Sanctum token on the
// server; mobile/API clients still get a Bearer token. Every token rule keeps working for the web because the session only stores
// the token. (CSRF is enforced by Sanctum's stateful middleware; Laravel skips the CSRF check while running unit tests.)
class WebSessionAuthTest extends TestCase
{
    use RefreshDatabase;

    private ?string $sessionId = null;

    /** a request as the SPA sends it: same-host Referer + the session cookie it got before */
    private function web(string $method, string $host, string $path, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $req = $this->withHeaders(['Referer' => "http://{$host}/", 'Accept' => 'application/json']);
        if ($this->sessionId) $req = $req->withCredentials()->withCookie(config('session.cookie'), $this->sessionId);   // JSON requests send cookies only with credentials
        $res = $req->json($method, "http://{$host}/api/v1/" . ltrim($path, '/'), $data);
        if ($c = $res->getCookie(config('session.cookie'))) $this->sessionId = $c->getValue();
        $this->flushHeaders();
        return $res;
    }

    private function setUpSchool(): array
    {
        $school = $this->makeInstitution('dhanmondi');
        $admin = $this->makeUser($school, 'admin');
        return [$school, $admin, $this->hostOf($school)];
    }

    public function test_the_web_gets_a_session_and_no_token_and_the_session_authenticates(): void
    {
        [, $admin, $host] = $this->setUpSchool();
        $res = $this->web('POST', $host, 'auth/login', ['login' => $admin->email, 'password' => 'Secret@1234'])->assertOk();
        $this->assertNull($res->json('data.token'), 'the token never reaches JavaScript');
        $this->assertSame('session', $res->json('data.token_type'));
        $cookie = $res->getCookie(config('session.cookie'));
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertNull($cookie->getDomain(), 'host-only cookie: never sent to another tenant\'s subdomain');

        $this->web('GET', $host, 'auth/me')->assertOk()->assertJsonPath('data.user.id', $admin->id);
        $this->assertSame(1, $admin->tokens()->count(), 'one Sanctum token behind the session - it shows in the sessions list');
    }

    public function test_a_mobile_or_api_client_still_gets_a_bearer_token(): void
    {
        [, $admin, $host] = $this->setUpSchool();
        $res = $this->json('POST', "http://{$host}/api/v1/auth/login", ['login' => $admin->email, 'password' => 'Secret@1234'])->assertOk();
        $this->assertNotEmpty($res->json('data.token'));
        $this->assertSame('Bearer', $res->json('data.token_type'));
    }

    public function test_logout_ends_the_web_session(): void
    {
        [, $admin, $host] = $this->setUpSchool();
        $this->web('POST', $host, 'auth/login', ['login' => $admin->email, 'password' => 'Secret@1234'])->assertOk();
        $before = $this->sessionId;
        $this->web('POST', $host, 'auth/logout')->assertOk();
        $this->assertNotSame($before, $this->sessionId, 'logout ends the session itself, not only its token');
        $this->web('GET', $host, 'auth/me')->assertUnauthorized();
        $this->assertSame(0, $admin->tokens()->count());
    }

    public function test_force_logout_and_the_role_idle_limit_also_end_a_web_session(): void
    {
        [$school, $admin, $host] = $this->setUpSchool();
        $teacher = $this->makeUser($school, 'teacher');
        $this->web('POST', $host, 'auth/login', ['login' => $teacher->email, 'password' => 'Secret@1234'])->assertOk();
        $this->web('GET', $host, 'auth/me')->assertOk();
        $this->api('POST', $host, "admin/users/{$teacher->id}/force-logout", $admin)->assertOk();
        $this->web('GET', $host, 'auth/me')->assertUnauthorized();

        $this->sessionId = null;
        $this->web('POST', $host, 'auth/login', ['login' => $admin->email, 'password' => 'Secret@1234'])->assertOk();
        $this->travel(61)->minutes();                                   // admin idle limit: 60
        $this->web('GET', $host, 'auth/me')->assertUnauthorized();
    }

    public function test_a_session_from_one_institution_does_not_open_another(): void
    {
        [, $admin, $host] = $this->setUpSchool();
        $other = $this->makeInstitution('other');
        $this->web('POST', $host, 'auth/login', ['login' => $admin->email, 'password' => 'Secret@1234'])->assertOk();
        // even if a browser sent the cookie to another host, the token behind it belongs to institution A
        $res = $this->web('GET', $this->hostOf($other), 'auth/me');
        $this->assertContains($res->status(), [401, 403]);
        $this->web('GET', $this->hostOf($other), 'settings')->assertStatus($res->status());
    }

    public function test_the_csrf_cookie_route_is_under_the_api_prefix(): void
    {
        [, , $host] = $this->setUpSchool();
        $res = $this->withHeaders(['Referer' => "http://{$host}/"])->get("http://{$host}/api/v1/sanctum/csrf-cookie");
        $res->assertNoContent();
        $this->assertNotNull($res->getCookie('XSRF-TOKEN', false));
    }
}
