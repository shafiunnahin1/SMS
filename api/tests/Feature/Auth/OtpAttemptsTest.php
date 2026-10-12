<?php

namespace Tests\Feature\Auth;

// D68 (4): a login code is voided after 5 wrong tries (the right code then fails too, a new login sends a new one); the code
// check is limited per IP and per login attempt, so another person's attempt from the same IP is not blocked.
class OtpAttemptsTest extends AuthTestCase
{
    private function wrong(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }

    public function test_five_wrong_tries_void_the_code(): void
    {
        $this->user(null, 'super_admin', ['email' => 'admin@schoolapp.com', 'phone' => '01700000000']);
        $codes = $this->captureSms();
        $challenge = $this->login(self::CENTRAL, 'admin@schoolapp.com')->assertOk()->json('data.challenge');
        for ($i = 0; $i < 4; $i++) $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $this->wrong($codes[0])])->assertUnauthorized();
        $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $codes[0]])->assertOk();   // 4 wrong: still good

        $challenge = $this->login(self::CENTRAL, 'admin@schoolapp.com')->assertOk()->json('data.challenge');
        $this->travel(61)->seconds();                                                    // past the per-minute limit window
        for ($i = 0; $i < 5; $i++) $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $this->wrong($codes[1])])->assertUnauthorized();
        $this->travel(61)->seconds();
        $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $codes[1]])->assertUnauthorized();   // voided
    }

    public function test_the_limit_counts_per_login_attempt_not_per_ip(): void
    {
        $this->app->forgetInstance(\Illuminate\Routing\Middleware\ThrottleRequests::class);   // AuthTestCase turns the limiter off; this test checks it
        $this->user(null, 'super_admin', ['email' => 'a@schoolapp.com', 'phone' => '01700000001']);
        $this->user(null, 'super_admin', ['email' => 'b@schoolapp.com', 'phone' => '01700000002']);
        $codes = $this->captureSms();
        $a = $this->login(self::CENTRAL, 'a@schoolapp.com')->json('data.challenge');
        $b = $this->login(self::CENTRAL, 'b@schoolapp.com')->json('data.challenge');
        for ($i = 0; $i < 5; $i++) $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $a, 'otp' => $this->wrong($codes[0])])->assertUnauthorized();
        $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $a, 'otp' => $codes[0]])->assertStatus(429);   // this attempt is limited
        $this->api('POST', self::CENTRAL, 'auth/verify-otp', null, ['challenge' => $b, 'otp' => $codes[1]])->assertOk();          // the other one, same IP, is not
    }
}
