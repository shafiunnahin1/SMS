<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

class StaffIdentityFoundationTest extends AuthTestCase
{
    public function test_staff_can_log_in_in_all_four_types_without_business_grants(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $i = $this->makeInstitution('staff-'.$type, $type);
            $u = $this->user($i, 'institution_staff', ['email' => $type.'@fixture.test']);
            $response = $this->login($this->hostOf($i), $u->email)->assertOk();
            $token = $response->json('data.token');
            $this->assertIsString($token);
            $this->callWithToken('GET', $this->hostOf($i), 'auth/me', $token)->assertOk()->assertJsonPath('data.user.role', 'institution_staff');
            foreach (['students', 'hr/staff', 'hr/advances', 'teacher/salary/advances'] as $path) {
                $this->callWithToken('GET', $this->hostOf($i), $path, $token)->assertForbidden();
            }
        }
    }

    public function test_pending_staff_cannot_log_in_and_active_staff_cannot_cross_tenants(): void
    {
        $a = $this->makeInstitution('staff-active');
        $b = $this->makeInstitution('staff-other');
        $u = $this->user($a, 'institution_staff', ['email' => 'pending@fixture.test', 'is_active' => false]);
        $this->login($this->hostOf($a), $u->email)->assertUnauthorized();
        $this->assertSame(0, PersonalAccessToken::count());
        $u->update(['is_active' => true]);
        $token = $this->login($this->hostOf($a), $u->email)->assertOk()->json('data.token');
        $this->callWithToken('GET', $this->hostOf($b), 'auth/me', $token)->assertForbidden();
    }

    public function test_staff_absolute_idle_and_revocation_policies(): void
    {
        $this->freezeSecond();
        $i = $this->makeInstitution('staff-lifetime');
        $u = $this->user($i, 'institution_staff', ['email' => 'life@fixture.test']);
        $token = $this->login($this->hostOf($i), $u->email)->assertOk()->json('data.token');
        $this->assertEquals(now()->addMinutes(720), PersonalAccessToken::latest('id')->first()->expires_at);
        $this->assertSame([720, 60], config('auth_policy.tokens.institution_staff'));
        $this->travel(61)->minutes();
        $this->callWithToken('GET', $this->hostOf($i), 'auth/me', $token)->assertUnauthorized();
        $token = $this->login($this->hostOf($i), $u->email)->assertOk()->json('data.token');
        $u->update(['is_active' => false]);
        $this->callWithToken('GET', $this->hostOf($i), 'auth/me', $token)->assertUnauthorized();
        $this->assertSame(0, PersonalAccessToken::where('tokenable_id', $u->id)->count());
    }
}
