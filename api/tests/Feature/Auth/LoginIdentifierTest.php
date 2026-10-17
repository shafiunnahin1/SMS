<?php

namespace Tests\Feature\Auth;

use App\Models\User;

// docs/AUTHORIZATION.md "Login Identifier (Revision 6)"
class LoginIdentifierTest extends AuthTestCase
{
    public function test_staff_log_in_with_email_or_any_form_of_their_phone(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $admin = $this->user($school, 'admin', ['email' => 'principal@dhanmondi.edu.bd', 'phone' => '+8801712345678']);

        $this->assertSame('01712345678', $admin->phone, 'phones are stored as 01XXXXXXXXX');
        foreach (['principal@dhanmondi.edu.bd', '01712345678', '+8801712345678', '8801712345678', '01712-345678'] as $login) {
            $this->login($this->hostOf($school), $login)->assertOk()->assertJsonPath('data.user.id', $admin->id)->assertJsonStructure(['data' => ['token']]);
        }
    }

    public function test_a_student_logs_in_with_the_student_id_once_the_release_ships_student_login(): void
    {
        config(['release.roles' => [...config('release.roles'), 'student']]);     // R1.1; in R1 see ReleaseRolesTest
        $school = $this->makeInstitution('dhanmondi');
        $student = $this->user($school, 'student', ['username' => 'DHA-2025-0001']);

        $this->login($this->hostOf($school), 'DHA-2025-0001')->assertOk()->assertJsonPath('data.user.id', $student->id);
    }

    public function test_the_same_email_in_two_institutions_is_two_users(): void
    {
        $a = $this->makeInstitution('alpha');
        $b = $this->makeInstitution('beta');
        $ua = $this->user($a, 'teacher', ['email' => 'same@example.com']);
        $ub = $this->user($b, 'teacher', ['email' => 'same@example.com', 'password' => 'Other-pass-2026']);

        $this->login($this->hostOf($a), 'same@example.com')->assertOk()->assertJsonPath('data.user.id', $ua->id);
        $this->login($this->hostOf($b), 'same@example.com', 'Other-pass-2026')->assertOk()->assertJsonPath('data.user.id', $ub->id);
        $this->login($this->hostOf($b), 'same@example.com')->assertUnauthorized()->assertJson(['error' => 'invalid_credentials']);
    }

    public function test_super_admin_logs_in_only_on_the_central_host_and_always_with_a_second_factor(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $super = $this->user(null, 'super_admin', ['email' => 'admin@schoolapp.com', 'phone' => '01700000000']);
        $codes = $this->captureSms();

        $this->login($this->hostOf($school), 'admin@schoolapp.com')->assertUnauthorized()->assertJson(['error' => 'invalid_credentials']);

        $challenge = $this->login(self::CENTRAL, 'admin@schoolapp.com')->assertOk()
            ->assertJsonPath('data.two_factor_required', true)->assertJsonMissingPath('data.token')->json('data.challenge');
        $this->assertCount(1, $codes);

        $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => '000000' === $codes[0] ? '111111' : '000000'])
            ->assertUnauthorized()->assertJson(['error' => 'invalid_otp']);
        $token = $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $codes[0]])
            ->assertOk()->assertJsonPath('data.user.id', $super->id)->json('data.token');
        $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $codes[0]])
            ->assertUnauthorized();                                                       // a code works once

        $this->callWithToken('GET', self::CENTRAL, 'auth/me', $token)->assertOk()->assertJsonPath('data.user.role', 'super_admin');
    }

    public function test_a_two_factor_challenge_only_works_on_the_host_that_issued_it(): void
    {
        $a = $this->makeInstitution('alpha');
        $b = $this->makeInstitution('beta');
        $this->user($a, 'admin', ['phone' => '01811111111', 'two_factor_enabled' => true]);
        $codes = $this->captureSms();

        $challenge = $this->login($this->hostOf($a), '01811111111')->assertOk()->json('data.challenge');

        $this->api('POST', $this->hostOf($b), 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $codes[0]])->assertUnauthorized();
        $this->api('POST', $this->hostOf($a), 'auth/verify-otp', null, ['challenge' => 'garbage', 'otp' => $codes[0]])->assertUnauthorized();
        $this->api('POST', $this->hostOf($a), 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $codes[0]])->assertOk();
    }

    public function test_a_tenant_user_cannot_log_in_on_the_central_host(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $this->user($school, 'admin', ['email' => 'principal@dhanmondi.edu.bd']);

        $this->login(self::CENTRAL, 'principal@dhanmondi.edu.bd')->assertUnauthorized()->assertJson(['error' => 'invalid_credentials']);
    }

    public function test_login_input_is_validated(): void
    {
        $school = $this->makeInstitution('dhanmondi');

        $this->api('POST', $this->hostOf($school), 'auth/login', null, [])->assertStatus(422)
            ->assertJson(['error' => 'validation_failed'])->assertJsonValidationErrors(['login', 'password']);
    }

    public function test_a_forced_password_change_blocks_everything_else_until_done(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $teacher = $this->user($school, 'teacher', ['phone' => '01911111111', 'password' => 'T-0001', 'must_change_password' => true]);
        \Illuminate\Support\Facades\Route::middleware(['tenant', 'auth:sanctum', 'tenant.user', 'password.fresh'])
            ->get('api/v1/test/anything', fn () => response()->json(['ok' => true]));

        $token = $this->login($this->hostOf($school), '01911111111', 'T-0001')->assertOk()->assertJsonPath('data.must_change_password', true)->json('data.token');
        $this->callWithToken('GET', $this->hostOf($school), 'test/anything', $token)->assertForbidden()->assertJson(['error' => 'must_change_password']);
        $this->callWithToken('GET', $this->hostOf($school), 'auth/me', $token)->assertOk();

        $this->callWithToken('PATCH', $this->hostOf($school), 'auth/change-password', $token,
            ['current_password' => 'T-0001', 'password' => 'Fresh-pass-77', 'password_confirmation' => 'Fresh-pass-77'])->assertOk();
        $this->assertFalse((bool) $teacher->fresh()->must_change_password);
        $this->callWithToken('GET', $this->hostOf($school), 'test/anything', $token)->assertOk();
    }

    public function test_password_reset_by_email_link_and_by_sms_code(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $admin = $this->user($school, 'admin', ['email' => 'principal@dhanmondi.edu.bd']);
        $parent = $this->user($school, 'parent', ['phone' => '01512345678']);
        $codes = $this->captureSms();
        $host = $this->hostOf($school);

        $this->api('POST', $host, 'auth/forgot-password', null, ['login' => 'nobody@example.com'])->assertOk();
        $this->api('POST', $host, 'auth/forgot-password', null, ['login' => 'principal@dhanmondi.edu.bd'])->assertOk();
        $this->assertCount(1, $this->sentMails());
        preg_match('/token=([A-Za-z0-9]+)/', $this->sentMails()[0], $m);
        $this->assertStringContainsString("http://{$host}/reset-password?", $this->sentMails()[0]);

        $reset = fn (string $login, string $token, string $pw) => $this->api('POST', $host, 'auth/reset-password', null,
            ['login' => $login, 'token' => $token, 'password' => $pw, 'password_confirmation' => $pw]);
        $reset('principal@dhanmondi.edu.bd', $m[1], 'short1')->assertStatus(422)->assertJsonValidationErrors(['password']);
        $reset('principal@dhanmondi.edu.bd', $m[1], 'Brand-new-2026')->assertOk();
        $reset('principal@dhanmondi.edu.bd', $m[1], 'Brand-new-2027')->assertStatus(422)->assertJson(['error' => 'invalid_token']);
        $this->login($host, 'principal@dhanmondi.edu.bd', 'Brand-new-2026')->assertOk();

        $this->api('POST', $host, 'auth/forgot-password', null, ['login' => '01512345678'])->assertOk();
        $this->assertCount(1, $codes);
        $reset('01512345678', $codes[0], 'mango7')->assertOk();
        $this->login($host, '01512345678', 'mango7')->assertOk()->assertJsonPath('data.user.id', $parent->id);
        $this->assertNotNull($admin);
    }
}
