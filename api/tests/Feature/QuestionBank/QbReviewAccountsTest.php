<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{AuditLog, User};
use App\Support\Tenancy;
use Tests\Feature\Auth\AuthTestCase;

// QB.2 (D65): the Super Admin adds writers and moderators (platform accounts, institution_id NULL); they sign in on the central
// host only, always with a one-time code, change the Super Admin's password on first login, and a switched-off account loses
// every token. Institution users can never sign in on the central host.
class QbReviewAccountsTest extends AuthTestCase
{
    private const NEW_PASS = 'Writer-pass-2027';

    private function central(): string { return 'admin.' . config('tenancy.base_domain'); }   // a configured central domain (tenant:central routes)

    public function test_the_super_admin_adds_a_writer_who_signs_in_on_the_central_host_with_a_code(): void
    {
        $super = $this->user(null, 'super_admin', ['phone' => '01700000000']);
        $school = $this->makeInstitution('qbacc');
        $this->api('POST', $this->central(), 'super/qb/writers', $this->user($school, 'admin', ['phone' => '01711111111']), [])->assertForbidden();

        $body = ['name' => 'Lekhok', 'role' => 'content_writer', 'phone' => '+8801812345678', 'password' => self::PASSWORD];
        $id = $this->api('POST', $this->central(), 'super/qb/writers', $super, $body)->assertCreated()
            ->assertJsonPath('data.phone', '01812345678')->assertJsonPath('data.must_change_password', true)->json('data.id');
        $this->api('POST', $this->central(), 'super/qb/writers', $super, $body)->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->api('POST', $this->central(), 'super/qb/writers', $super, ['role' => 'admin'] + $body)->assertStatus(422)->assertJsonValidationErrors('role');
        $this->api('POST', $this->central(), 'super/qb/writers', $super, ['password' => 'short', 'phone' => '01812345679'] + $body)->assertStatus(422)->assertJsonValidationErrors('password');
        $writer = User::find($id);
        $this->assertNull($writer->institution_id);
        $this->assertSame(1, Tenancy::withoutTenancy(fn () => AuditLog::where('action', 'qb.writer.created')->count()));

        // never on an institution's host; on the central host always with a code
        $codes = $this->captureSms();
        $this->login($this->hostOf($school), '01812345678')->assertUnauthorized();
        $challenge = $this->login($this->central(), '01812345678')->assertOk()->assertJsonPath('data.two_factor_required', true)->json('data.challenge');
        $token = $this->api('POST', $this->central(), 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $codes[0]])->assertOk()->json('data.token');

        // first: change the password the Super Admin set
        $this->callWithToken('GET', $this->central(), 'writer/questions', $token)->assertForbidden()->assertJsonPath('error', 'must_change_password');
        $this->callWithToken('PATCH', $this->central(), 'writer/change-password', $token,
            ['current_password' => self::PASSWORD, 'password' => self::NEW_PASS, 'password_confirmation' => self::NEW_PASS])->assertOk();
        $this->callWithToken('GET', $this->central(), 'writer/questions', $token)->assertOk();
        $this->callWithToken('GET', $this->central(), 'auth/me', $token)->assertOk()->assertJsonPath('data.user.role', 'content_writer');

        // switched off: every token goes, and the login is refused
        $this->api('PATCH', $this->central(), "super/qb/writers/{$id}", $super, ['is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);
        $this->callWithToken('GET', $this->central(), 'writer/questions', $token)->assertUnauthorized();
        $this->login($this->central(), '01812345678', self::NEW_PASS)->assertUnauthorized();
        $this->assertSame(['Lekhok'], array_column($this->api('GET', $this->central(), 'super/qb/writers', $super)->json('data'), 'name'));
    }

    public function test_an_institution_user_with_the_same_phone_never_signs_in_on_the_central_host(): void
    {
        $school = $this->makeInstitution('qbacc2');
        $this->user($school, 'teacher', ['phone' => '01912345678']);
        $this->login($this->central(), '01912345678')->assertUnauthorized()->assertJson(['error' => 'invalid_credentials']);
    }
}
