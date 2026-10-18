<?php

namespace Tests\Feature\Security;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// owner 2026-10-11 (docs/DECISIONS.md): the API allows 300 calls a minute per user (per IP before login), then 429 with Retry-After
class ApiRateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_gets_300_calls_a_minute_then_429_and_another_user_is_not_affected(): void
    {
        $this->assertSame(300, config('auth_policy.api_per_minute'));
        $i = $this->makeInstitution('rate');
        [$a, $b] = [$this->makeUser($i, 'admin'), $this->makeUser($i, 'teacher')];
        $host = $this->hostOf($i);
        for ($n = 1; $n <= 300; $n++) $this->api('GET', $host, 'auth/me', $a)->assertOk();
        $this->api('GET', $host, 'auth/me', $a)->assertStatus(429)->assertHeader('Retry-After');
        $this->api('GET', $host, 'auth/me', $b)->assertOk();
    }

    public function test_before_login_the_limit_counts_per_ip(): void
    {
        $host = $this->hostOf($this->makeInstitution('rateip'));
        config(['auth_policy.api_per_minute' => 3]);
        for ($n = 1; $n <= 3; $n++) $this->getJson("http://{$host}/api/v1/bootstrap")->assertOk();
        $this->getJson("http://{$host}/api/v1/bootstrap")->assertStatus(429);
        $this->getJson("http://{$host}/api/v1/bootstrap", ['REMOTE_ADDR' => '10.0.0.9'])->assertOk();
    }
}
