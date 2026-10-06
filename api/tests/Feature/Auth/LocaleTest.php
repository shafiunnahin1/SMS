<?php

namespace Tests\Feature\Auth;

// docs/TESTING.md "LocaleTest": PUT /auth/locale stores bn|en (R1) in users.locale; anything else 422; remembered at the next login
class LocaleTest extends AuthTestCase
{
    public function test_a_user_saves_bn_or_en_and_gets_it_back_at_the_next_login(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $u = $this->user($school, 'teacher', ['email' => 't@d.test']);
        $token = $this->login($this->hostOf($school), 't@d.test')->json('data.token');

        $this->callWithToken('PUT', $this->hostOf($school), 'auth/locale', $token, ['locale' => 'en'])->assertOk()->assertJsonPath('data.locale', 'en');
        $this->assertSame('en', $u->fresh()->locale);
        $this->login($this->hostOf($school), 't@d.test')->assertJsonPath('data.user.locale', 'en');

        $this->callWithToken('PUT', $this->hostOf($school), 'auth/locale', $token, ['locale' => 'bn'])->assertOk();
        $this->assertSame('bn', $u->fresh()->locale);
    }

    public function test_other_values_are_422(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $this->user($school, 'teacher', ['email' => 't@d.test']);
        $token = $this->login($this->hostOf($school), 't@d.test')->json('data.token');

        foreach (['ar', 'fr', '', 'bn-BD'] as $bad) {
            $this->callWithToken('PUT', $this->hostOf($school), 'auth/locale', $token, ['locale' => $bad])
                ->assertStatus(422)->assertJson(['error' => 'validation_failed']);
        }
    }

    public function test_the_locale_route_needs_a_token(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $this->api('PUT', $this->hostOf($school), 'auth/locale', null, ['locale' => 'en'])->assertUnauthorized();
    }
}
