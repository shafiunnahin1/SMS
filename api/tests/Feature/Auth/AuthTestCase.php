<?php

namespace Tests\Feature\Auth;

use App\Models\Institution;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

abstract class AuthTestCase extends TestCase
{
    use RefreshDatabase;

    protected const CENTRAL = 'admin.schoolapp.com';
    protected const PASSWORD = 'Strong-pass-26';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);     // lockout tests repeat attempts; LoginThrottleTest checks the limiter itself
    }

    protected function user(?Institution $i, string $role, array $attrs = []): User
    {
        // forceFill: tests also set login-flow fields (locked_until, failed_login_attempts) that are not mass-assignable
        $u = (new User)->forceFill(array_merge([
            'institution_id' => $i?->id, 'name' => ucfirst($role) . ' User', 'password' => self::PASSWORD, 'role' => $role, 'is_active' => true,
        ], $attrs));
        $u->save();
        return $u;
    }

    protected function login(string $host, string $login, string $password = self::PASSWORD): TestResponse
    {
        return $this->api('POST', $host, 'auth/login', null, ['login' => $login, 'password' => $password]);
    }

    /** Call an endpoint with an existing plain-text token */
    protected function callWithToken(string $method, string $host, string $path, string $token, array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        return $this->json($method, "http://{$host}/api/v1/{$path}", $data, ['Authorization' => "Bearer {$token}"]);
    }

    /** Capture the codes the dev SMS driver writes to the log */
    protected function captureSms(): \ArrayObject
    {
        $codes = new \ArrayObject();
        Log::listen(function ($event) use ($codes) {
            if (str_starts_with($event->message, '[dev sms]') && preg_match('/(\d{6})/', $event->message, $m)) $codes[] = $m[1];
        });
        return $codes;
    }

    /** Text of every mail the `array` mailer (phpunit.xml) has "sent" */
    protected function sentMails(): array
    {
        return array_map(fn ($m) => $m->getOriginalMessage()->getTextBody(), iterator_to_array(app('mailer')->getSymfonyTransport()->messages()));
    }
}
