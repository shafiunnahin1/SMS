<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// throttle:login - 5 attempts per minute per IP + identifier, before the account lockout (docs/AUTHORIZATION.md)
class LoginThrottleTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_sixth_attempt_in_a_minute_is_429_and_another_identifier_is_not_affected(): void
    {
        $school = $this->makeInstitution('dhanmondi');
        $host = $this->hostOf($school);

        for ($i = 0; $i < 5; $i++) $this->api('POST', $host, 'auth/login', null, ['login' => 'x@d.test', 'password' => 'nope'])->assertUnauthorized();
        $this->api('POST', $host, 'auth/login', null, ['login' => 'x@d.test', 'password' => 'nope'])->assertStatus(429);
        $this->api('POST', $host, 'auth/login', null, ['login' => 'y@d.test', 'password' => 'nope'])->assertUnauthorized();
    }
}
