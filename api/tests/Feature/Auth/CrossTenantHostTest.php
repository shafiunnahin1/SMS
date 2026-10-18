<?php

namespace Tests\Feature\Auth;

// docs/modules/custom-domain.md Part G "CrossTenantHostTest": a token works only on its own institution's host
class CrossTenantHostTest extends AuthTestCase
{
    public function test_institution_a_token_is_refused_on_institution_b_and_on_the_central_host(): void
    {
        $a = $this->makeInstitution('alpha');
        $b = $this->makeInstitution('beta', 'coaching');
        $this->user($a, 'admin', ['email' => 'admin@alpha.test']);
        $token = $this->login($this->hostOf($a), 'admin@alpha.test')->assertOk()->json('data.token');

        $this->callWithToken('GET', $this->hostOf($a), 'auth/me', $token)->assertOk()->assertJsonPath('data.institution.slug', 'alpha');
        foreach (['auth/me', 'auth/sessions', 'admin/settings/terminology'] as $path) {
            $this->callWithToken('GET', $this->hostOf($b), $path, $token)->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
        }
        $this->callWithToken('GET', self::CENTRAL, 'auth/me', $token)->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
        $this->callWithToken('POST', $this->hostOf($b), 'auth/logout', $token)->assertForbidden();
        $this->callWithToken('GET', $this->hostOf($a), 'auth/me', $token)->assertOk();     // the refused calls did not log it out
    }

    public function test_a_super_admin_token_is_refused_on_every_tenant_host(): void
    {
        $a = $this->makeInstitution('alpha');
        $super = $this->user(null, 'super_admin', ['email' => 'admin@schoolapp.com']);
        $token = app(\App\Services\Auth\TokenService::class)->issue($super, request());

        $this->callWithToken('GET', self::CENTRAL, 'auth/me', $token)->assertOk();
        $this->callWithToken('GET', $this->hostOf($a), 'auth/me', $token)->assertForbidden()->assertJson(['error' => 'forbidden_host']);
        $this->callWithToken('GET', $this->hostOf($a), 'auth/sessions', $token)->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
    }
}
