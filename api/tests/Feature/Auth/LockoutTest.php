<?php

namespace Tests\Feature\Auth;

use App\Models\AuditLog;
use App\Services\Auth\TokenService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\Hash;

// docs/AUTHORIZATION.md "Login Attempt Lockout (Revision 7)"
class LockoutTest extends AuthTestCase
{
    public function test_five_wrong_passwords_lock_for_thirty_minutes_and_revoke_tokens(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'teacher', ['email' => 't@d.test']);
        $existing = app(TokenService::class)->issue($u, request());

        for ($i = 0; $i < 5; $i++) $this->login($this->hostOf($school), 't@d.test', 'wrong-password')->assertUnauthorized();

        $u->refresh();
        $this->assertTrue($u->locked_until->between(now()->addMinutes(29), now()->addMinutes(31)));
        $this->assertSame(0, $u->tokens()->count());
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $existing)->assertUnauthorized();
        $this->assertTrue(Tenancy::as($school, fn () => AuditLog::where('action', 'auth.locked')->where('model_id', $u->id)->exists()));

        $this->login($this->hostOf($school), 't@d.test')->assertUnauthorized();          // right password, still locked
        $this->travel(31)->minutes();
        $this->login($this->hostOf($school), 't@d.test')->assertOk();
    }

    public function test_locked_wrong_password_and_unknown_user_answers_are_byte_identical(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $host = $this->hostOf($school);
        $this->user($school, 'teacher', ['email' => 't@d.test']);
        $this->user($school, 'teacher', ['email' => 'locked@d.test', 'locked_until' => now()->addMinutes(20)]);
        $this->user($school, 'teacher', ['email' => 'gone@d.test', 'is_active' => false]);

        $wrong = $this->login($host, 't@d.test', 'wrong-password');
        $locked = $this->login($host, 'locked@d.test');
        $unknown = $this->login($host, 'nobody@d.test');
        $inactive = $this->login($host, 'gone@d.test');

        foreach ([$locked, $unknown, $inactive] as $res) {
            $this->assertSame($wrong->status(), $res->status());
            $this->assertSame($wrong->getContent(), $res->getContent());
        }
        $this->assertSame('invalid_credentials', $wrong->json('error'));
    }

    public function test_every_failure_path_does_exactly_one_password_hash_check(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $this->user($school, 'teacher', ['email' => 't@d.test']);
        $this->user($school, 'teacher', ['email' => 'locked@d.test', 'locked_until' => now()->addMinutes(20)]);

        $counter = new class(app('hash')) {
            public int $checks = 0;
            public function __construct(private $real) {}
            public function __call($method, $args) { if ($method === 'check') $this->checks++; return $this->real->$method(...$args); }
        };
        Hash::swap($counter);

        foreach (['t@d.test' => 'wrong-password', 'nobody@d.test' => 'whatever-pass', 'locked@d.test' => self::PASSWORD] as $login => $pw) {
            $counter->checks = 0;
            $this->login($this->hostOf($school), $login, $pw)->assertUnauthorized();
            $this->assertSame(1, $counter->checks, "{$login}: expected exactly one Hash::check");
        }
    }

    public function test_a_successful_login_resets_the_counter(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'teacher', ['email' => 't@d.test']);

        for ($i = 0; $i < 4; $i++) $this->login($this->hostOf($school), 't@d.test', 'wrong-password');
        $this->assertSame(4, $u->fresh()->failed_login_attempts);
        $this->login($this->hostOf($school), 't@d.test')->assertOk();
        $this->assertSame(0, $u->fresh()->failed_login_attempts);
        for ($i = 0; $i < 4; $i++) $this->login($this->hostOf($school), 't@d.test', 'wrong-password');
        $this->assertNull($u->fresh()->locked_until, 'four new failures after a success do not lock');
    }

    public function test_an_admin_can_unlock_a_user_of_their_own_institution_only(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $other = $this->makeInstitution('other');
        $admin = app(TokenService::class)->issue($this->user($school, 'admin', ['email' => 'a@d.test']), request());
        $locked = $this->user($school, 'teacher', ['email' => 't@d.test', 'locked_until' => now()->addMinutes(25), 'failed_login_attempts' => 3]);
        $outsider = $this->user($other, 'teacher', ['email' => 't@o.test', 'locked_until' => now()->addMinutes(25)]);

        $this->callWithToken('POST', $this->hostOf($school), "admin/users/{$outsider->id}/unlock", $admin)->assertNotFound();
        $this->callWithToken('POST', $this->hostOf($school), "admin/users/{$locked->id}/unlock", $admin)->assertOk();

        $this->assertNull($locked->fresh()->locked_until);
        $this->assertSame(0, $locked->fresh()->failed_login_attempts);
        $this->assertNotNull($outsider->fresh()->locked_until);
        $this->login($this->hostOf($school), 't@d.test')->assertOk();
    }

    public function test_the_same_email_in_two_institutions_locks_separately(): void
    {
        $a = $this->makeInstitution('alpha');
        $b = $this->makeInstitution('beta');
        $ua = $this->user($a, 'teacher', ['email' => 'same@x.test']);
        $this->user($b, 'teacher', ['email' => 'same@x.test']);

        for ($i = 0; $i < 5; $i++) $this->login($this->hostOf($a), 'same@x.test', 'wrong-password');

        $this->assertNotNull($ua->fresh()->locked_until);
        $this->login($this->hostOf($b), 'same@x.test')->assertOk();
    }
}
