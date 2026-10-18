<?php

namespace Tests\Feature\Auth;

use App\Services\Auth\GoogleSignInService;

// R2.1.1 / D111 (3): Google sign-in signs in only an existing, active account with the same verified email on its own host;
// a bad token, another audience, an unverified email or an unknown email is the generic 401; it never creates an account.
class GoogleSignInTest extends AuthTestCase
{
    private const CLIENT = 'test-client.apps.googleusercontent.com';

    private function google(?array $claims): void
    {
        config(['services.google.client_id' => self::CLIENT]);
        $this->app->instance(GoogleSignInService::class, new GoogleSignInService(fn () => $claims));
    }

    private function claims(string $email, array $extra = []): array
    {
        return array_replace(['aud' => self::CLIENT, 'iss' => 'https://accounts.google.com', 'exp' => time() + 600, 'email' => $email, 'email_verified' => true], $extra);
    }

    public function test_an_existing_school_account_signs_in_and_bad_tokens_are_refused(): void
    {
        $i = $this->makeInstitution('gschool'); $host = $this->hostOf($i);
        $admin = $this->user($i, 'admin', ['email' => 'principal@example.test']);
        $this->google($this->claims('Principal@Example.test'));
        $this->api('POST', $host, 'auth/google', null, ['credential' => 'x'])->assertOk()->assertJsonPath('data.user.id', $admin->id);

        foreach ([['aud' => 'someone-else'], ['email_verified' => false], ['iss' => 'evil.example'], ['exp' => time() - 5]] as $bad) {
            $this->google($this->claims('principal@example.test', $bad));
            $this->api('POST', $host, 'auth/google', null, ['credential' => 'x'])->assertStatus(401)->assertJsonPath('error', 'invalid_credentials');
        }
        $this->google(null);
        $this->api('POST', $host, 'auth/google', null, ['credential' => 'x'])->assertStatus(401);
    }

    public function test_it_never_creates_or_crosses_accounts(): void
    {
        $a = $this->makeInstitution('gschool-a'); $b = $this->makeInstitution('gschool-b');
        $this->user($a, 'teacher', ['email' => 'teacher@example.test']);
        $count = \App\Models\User::count();
        $this->google($this->claims('teacher@example.test'));
        $this->api('POST', $this->hostOf($b), 'auth/google', null, ['credential' => 'x'])->assertStatus(401);   // another school's host
        $this->api('POST', self::CENTRAL, 'auth/google', null, ['credential' => 'x'])->assertStatus(401);         // the central host
        $this->google($this->claims('nobody@example.test'));
        $this->api('POST', $this->hostOf($a), 'auth/google', null, ['credential' => 'x'])->assertStatus(401);
        $this->assertSame($count, \App\Models\User::count());
    }

    public function test_inactive_locked_and_platform_rules_still_apply(): void
    {
        $i = $this->makeInstitution('gschool-c'); $host = $this->hostOf($i);
        $this->user($i, 'teacher', ['email' => 'off@example.test', 'is_active' => false]);
        $this->user($i, 'teacher', ['email' => 'locked@example.test', 'locked_until' => now()->addHour()]);
        foreach (['off@example.test', 'locked@example.test'] as $email) {
            $this->google($this->claims($email));
            $this->api('POST', $host, 'auth/google', null, ['credential' => 'x'])->assertStatus(401);
        }
        $this->user(null, 'content_writer', ['email' => 'writer@example.test']);
        $this->google($this->claims('writer@example.test'));
        $this->api('POST', self::CENTRAL, 'auth/google', null, ['credential' => 'x'])->assertOk()->assertJsonPath('data.two_factor_required', true);   // platform accounts keep their second factor
        $super = $this->user(null, 'super_admin', ['email' => 'root@example.test']);
        $this->google($this->claims('root@example.test'));
        $this->api('POST', self::CENTRAL, 'auth/google', null, ['credential' => 'x'])->assertOk()->assertJsonPath('data.two_factor_required', true);   // super admin still needs the second factor
    }

    public function test_the_route_is_off_without_a_client_id(): void
    {
        config(['services.google.client_id' => null]);
        $i = $this->makeInstitution('gschool-d');
        $this->api('POST', $this->hostOf($i), 'auth/google', null, ['credential' => 'x'])->assertNotFound();
    }
}
