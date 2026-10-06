<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\Auth\TokenService;
use Laravel\Sanctum\PersonalAccessToken;

// docs/AUTHORIZATION.md "Token Strategy & Session Lifetime (Revision 7)" (D26)
class TokenLifetimeTest extends AuthTestCase
{
    private function issue(User $u): string
    {
        return app(TokenService::class)->issue($u, request());
    }

    public function test_each_role_gets_its_absolute_lifetime(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $this->freezeSecond();
        foreach (['admin' => 720, 'accountant' => 720, 'teacher' => 1440, 'parent' => 43200] as $role => $minutes) {
            $this->issue($this->user($school, $role, ['email' => "{$role}@d.test"]));
            $this->assertEquals(now()->addMinutes($minutes), PersonalAccessToken::latest('id')->first()->expires_at, $role);
        }
        $this->issue($this->user(null, 'super_admin', ['email' => 'sa@x.test']));
        $this->assertEquals(now()->addMinutes(480), PersonalAccessToken::latest('id')->first()->expires_at);
    }

    public function test_an_expired_token_is_401_even_when_used_regularly(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $token = $this->issue($this->user($school, 'admin', ['email' => 'a@d.test']));
        $host = $this->hostOf($school);

        for ($elapsed = 55; $elapsed <= 715; $elapsed += 55) {         // used every 55 minutes: never idle (admin idle = 60)
            $this->travel(55)->minutes();
            $this->callWithToken('GET', $host, 'auth/me', $token)->assertOk();
        }
        $this->travel(10)->minutes();                                   // 725 minutes > the 720-minute absolute lifetime
        $this->callWithToken('GET', $host, 'auth/me', $token)->assertUnauthorized()->assertJson(['error' => 'unauthenticated']);
    }

    public function test_an_idle_token_is_401_after_the_role_idle_limit(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $host = $this->hostOf($school);
        $admin = $this->issue($this->user($school, 'admin', ['email' => 'a@d.test']));        // idle 60
        $teacher = $this->issue($this->user($school, 'teacher', ['email' => 't@d.test']));    // idle 120

        $this->callWithToken('GET', $host, 'auth/me', $admin)->assertOk();
        $this->callWithToken('GET', $host, 'auth/me', $teacher)->assertOk();
        $this->travel(59)->minutes();
        $this->callWithToken('GET', $host, 'auth/me', $admin)->assertOk();                    // used again: idle clock restarts
        $this->travel(61)->minutes();
        $this->callWithToken('GET', $host, 'auth/me', $admin)->assertUnauthorized();
        $this->callWithToken('GET', $host, 'auth/me', $teacher)->assertUnauthorized();        // 120 minutes since its last use
    }

    public function test_a_deactivated_user_is_cut_off_even_before_the_observer_revokes(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'teacher', ['email' => 't@d.test']);
        $token = $this->issue($u);
        User::whereKey($u->id)->update(['is_active' => false]);                                  // query update: no observer, token row stays

        $this->assertSame(1, $u->tokens()->count());
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $token)->assertUnauthorized();
    }

    public function test_the_sixth_login_removes_the_oldest_token(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $this->user($school, 'parent', ['phone' => '01712345678']);
        $tokens = [];
        for ($i = 0; $i < 6; $i++) $tokens[] = $this->login($this->hostOf($school), '01712345678')->assertOk()->json('data.token');

        $this->assertSame(5, PersonalAccessToken::count());
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $tokens[0])->assertUnauthorized();
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $tokens[1])->assertOk();
    }

    public function test_sensitive_changes_revoke_every_token(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        foreach (['password' => 'Changed-pass-99', 'role' => 'accountant', 'is_active' => false, 'two_factor_enabled' => true,
                  'email' => 'new@d.test', 'phone' => '01799999999'] as $field => $value) {
            $u = $this->user($school, 'teacher', ['email' => "{$field}@d.test"]);
            $this->issue($u); $this->issue($u);
            $u->forceFill([$field => $value])->save();
            $this->assertSame(0, $u->tokens()->count(), "changing {$field} must revoke tokens");
        }
        $u = $this->user($school, 'teacher', ['email' => 'name@d.test']);
        $this->issue($u);
        $u->forceFill(['name' => 'Renamed'])->save();
        $this->assertSame(1, $u->tokens()->count(), 'a harmless change keeps tokens');
    }

    public function test_changing_my_own_password_keeps_the_token_in_use_and_revokes_the_rest(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'admin', ['email' => 'a@d.test']);
        $other = $this->issue($u);
        $mine = $this->issue($u);

        $this->callWithToken('PATCH', $this->hostOf($school), 'auth/change-password', $mine,
            ['current_password' => self::PASSWORD, 'password' => 'Another-pass-2026', 'password_confirmation' => 'Another-pass-2026'])->assertOk();

        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $mine)->assertOk();
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $other)->assertUnauthorized();
    }

    public function test_session_api_lists_ends_one_and_ends_all(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $host = $this->hostOf($school);
        $u = $this->user($school, 'teacher', ['email' => 't@d.test']);
        $stranger = $this->user($school, 'teacher', ['email' => 's@d.test']);
        $strangerToken = $this->issue($stranger);
        $phone = $this->issue($u);
        $laptop = $this->issue($u);

        $list = $this->callWithToken('GET', $host, 'auth/sessions', $laptop)->assertOk()->json('data');
        $this->assertCount(2, $list);
        $this->assertSame([true, false], array_column($list, 'is_current'));
        $this->assertArrayNotHasKey('ip_hash', $list[0]);

        $phoneId = PersonalAccessToken::findToken($phone)->id;
        $strangerId = PersonalAccessToken::findToken($strangerToken)->id;
        $this->callWithToken('DELETE', $host, "auth/sessions/{$strangerId}", $laptop)->assertNotFound()->assertJson(['error' => 'not_found']);
        $this->callWithToken('DELETE', $host, "auth/sessions/{$phoneId}", $laptop)->assertOk();
        $this->callWithToken('GET', $host, 'auth/me', $phone)->assertUnauthorized();

        $this->callWithToken('POST', $host, 'auth/logout-all', $laptop)->assertOk();
        $this->callWithToken('GET', $host, 'auth/me', $laptop)->assertUnauthorized();
        $this->callWithToken('GET', $host, 'auth/me', $strangerToken)->assertOk();
    }

    public function test_logout_ends_only_the_current_token(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'teacher', ['email' => 't@d.test']);
        $a = $this->issue($u);
        $b = $this->issue($u);

        $this->callWithToken('POST', $this->hostOf($school), 'auth/logout', $a)->assertOk();
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $a)->assertUnauthorized();
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $b)->assertOk();
    }

    public function test_admin_force_logout_works_only_inside_the_admins_institution(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $other = $this->makeInstitution('other');
        $admin = $this->issue($this->user($school, 'admin', ['email' => 'a@d.test']));
        $teacher = $this->user($school, 'teacher', ['email' => 't@d.test']);
        $outsider = $this->user($other, 'teacher', ['email' => 't@o.test']);
        $teacherToken = $this->issue($teacher);
        $outsiderToken = $this->issue($outsider);

        $this->callWithToken('POST', $this->hostOf($school), "admin/users/{$outsider->id}/force-logout", $admin)->assertNotFound();
        $this->callWithToken('POST', $this->hostOf($school), "admin/users/{$teacher->id}/force-logout", $admin)->assertOk();

        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $teacherToken)->assertUnauthorized();
        $this->callWithToken('GET', $this->hostOf($other), 'auth/me', $outsiderToken)->assertOk();
        $this->callWithToken('POST', $this->hostOf($school), "admin/users/{$teacher->id}/force-logout", $teacherToken)->assertUnauthorized();
    }
}
