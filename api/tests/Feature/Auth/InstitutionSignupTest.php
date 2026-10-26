<?php
namespace Tests\Feature\Auth;

use App\Models\{AccountActivationRequest, Institution, OtpToken, User};
use App\Services\Auth\{ActivationDelivery, OtpService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class InstitutionSignupTest extends TestCase
{
    use RefreshDatabase;
    private const CENTRAL = 'admin.schoolapp.com';
    private ActivationDelivery $delivery;

    public function test_all_twenty_foundation_routes_match_the_canonical_task_actions(): void
    {
        $plan = json_decode(file_get_contents(base_path('../docs/release/r3-plan.json')), true, flags: JSON_THROW_ON_ERROR);
        $task = collect($plan['tasks'])->firstWhere('id', 'R3.6a');
        $this->assertCount(20, $task['routes']);
        foreach ($task['routes'] as $spec) {
            [$endpoint, $target] = explode(' -> ', $spec);
            [$method, $path] = explode(' ', $endpoint, 2);
            $expected = explode(' [', $target)[0];
            $routes = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())
                ->filter(fn ($r) => $r->uri() === 'api/v1'.$path && in_array($method, $r->methods(), true));
            $this->assertCount(1, $routes, $spec);
            $this->assertSame($expected, class_basename($routes->first()->getActionName()), $spec);
        }
    }

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth_policy.activation.public_signup_enabled' => true]);
        $this->delivery = new class extends ActivationDelivery {
            public array $messages = [];
            public function available(): bool { return true; }
            public function deliver(string $channel, string $contact, string $code, array $tracking): bool
            {
                $this->messages[] = compact('channel', 'contact', 'code', 'tracking');
                return true;
            }
        };
        app()->instance(ActivationDelivery::class, $this->delivery);
    }
    private function payload(string $slug = 'signup-school'): array
    {
        return ['name' => 'Signup fixture', 'slug' => $slug, 'institution_type' => 'school',
            'principal' => ['name' => 'Principal fixture', 'contact' => ['channel' => 'phone', 'value' => '+8801712345678'],
                'password' => 'Private-secret-42', 'password_confirmation' => 'Private-secret-42']];
    }
    private function signup(string $slug = 'signup-school'): array
    {
        return $this->api('POST', self::CENTRAL, 'public/institutions', null, $this->payload($slug))->assertCreated()->json('data');
    }
    private function message(): array { return $this->delivery->messages[array_key_last($this->delivery->messages)]; }

    public function test_new_public_route_inventory_requires_central_host_locale_and_exact_limiters(): void
    {
        $expected = ['api/v1/public/institutions' => 'signup', 'api/v1/public/institutions/{id}/verify' => 'activation-verify',
            'api/v1/public/institutions/{id}/verification' => 'activation-resend'];
        foreach ($expected as $uri => $limiter) {
            $routes = collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())->filter(fn ($r) => $r->uri() === $uri && in_array('POST', $r->methods(), true));
            $this->assertCount(1, $routes);
            $middleware = $routes->first()->gatherMiddleware();
            foreach (['tenant:central', 'locale', 'throttle:'.$limiter] as $required) $this->assertContains($required, $middleware);
            foreach (['auth:sanctum', 'tenant:optional', 'tenancy.bypass'] as $forbidden) $this->assertNotContains($forbidden, $middleware);
        }
    }

    public function test_public_signup_verification_and_review_never_issue_a_token_and_gate_tenant_access(): void
    {
        $state = $this->signup(); $id = $state['institution_id']; $i = Institution::findOrFail($id);
        $u = User::where('institution_id', $id)->sole(); $super = $this->makeUser(null, 'super_admin');
        $this->assertSame(['institution_id', 'public_id', 'generation', 'status', 'delivery_pending'], array_keys($state));
        $this->assertSame('inactive', $i->status); $this->assertFalse($u->is_active);
        $this->api('POST', $this->hostOf($i), 'auth/login', null, ['login' => $u->phone, 'password' => 'Private-secret-42'])->assertUnauthorized();
        $this->api('POST', self::CENTRAL, "super/institutions/$id/approve-registration", $super, ['decision' => 'approve'])->assertStatus(409);
        $this->api('PATCH', self::CENTRAL, "super/institutions/$id/toggle", $super)->assertStatus(409);
        $this->api('POST', self::CENTRAL, "public/institutions/$id/verify", null,
            ['public_id' => $state['public_id'], 'code' => $this->message()['code']])->assertOk()->assertJsonPath('data.status', 'verified')->assertJsonMissingPath('data.token');
        $this->assertFalse($u->fresh()->is_active);
        $this->travel(2)->days();
        $this->api('POST', self::CENTRAL, "super/institutions/$id/approve-registration", $super, ['decision' => 'approve'])->assertOk()->assertJsonPath('data.status', 'consumed');
        $this->api('POST', self::CENTRAL, "super/institutions/$id/approve-registration", $super, ['decision' => 'approve'])->assertOk();
        $this->assertTrue($u->fresh()->is_active);
        $this->assertSame(0, $u->tokens()->count());
        $this->api('POST', $this->hostOf($i), 'auth/login', null, ['login' => $u->phone, 'password' => 'Private-secret-42'])->assertOk();
    }

    public function test_wrong_host_tenant_tracking_and_token_owner_are_rejected_over_http(): void
    {
        $state = $this->signup(); $originalCode = $this->message()['code']; $id = $state['institution_id'];
        $other = $this->signup('other-school'); $i = Institution::findOrFail($id);
        $body = ['public_id' => $state['public_id'], 'code' => $originalCode];
        $this->api('POST', $this->hostOf($i), "public/institutions/$id/verify", null, $body)->assertNotFound();
        $this->api('POST', self::CENTRAL, 'public/institutions/'.$other['institution_id'].'/verify', null, $body)->assertStatus(422);
        $otherRequest = Tenancy::as(Institution::findOrFail($other['institution_id']), fn () => AccountActivationRequest::sole());
        Tenancy::as($i, fn () => AccountActivationRequest::sole()->update(['otp_token_id' => $otherRequest->otp_token_id]));
        $this->api('POST', self::CENTRAL, "public/institutions/$id/verify", null, $body)->assertStatus(422)->assertJsonPath('error', 'activation_invalid');
        $this->assertFalse(User::where('institution_id', $id)->sole()->is_active);
    }

    public function test_resend_is_generic_and_delivers_replacement_tracking_only_to_the_recipient(): void
    {
        $state = $this->signup(); $old = $this->message(); $id = $state['institution_id'];
        $body = ['public_id' => $state['public_id'], 'contact' => ['channel' => 'phone', 'value' => '01712345678']];
        $known = $this->api('POST', self::CENTRAL, "public/institutions/$id/verification", null, $body)->assertStatus(202)->json();
        $message = $this->message();
        $this->assertSame(2, $message['tracking']['generation']);
        $this->assertNotSame($state['public_id'], $message['tracking']['public_id']);
        $body['public_id'] = (string) Str::uuid();
        $unknown = $this->api('POST', self::CENTRAL, 'public/institutions/999999/verification', null, $body)->assertStatus(202)->json();
        $this->assertSame($known, $unknown);
        $this->assertArrayNotHasKey('data', $known);
        $this->api('POST', self::CENTRAL, "public/institutions/$id/verify", null, ['public_id' => $state['public_id'], 'code' => $old['code']])->assertStatus(422);
        $this->api('POST', self::CENTRAL, "public/institutions/$id/verify", null, ['public_id' => $message['tracking']['public_id'], 'code' => $message['code']])->assertOk();
    }

    public function test_pending_password_reset_toggle_and_rejection_do_not_bypass_activation(): void
    {
        $state = $this->signup(); $id = $state['institution_id']; $i = Institution::findOrFail($id); $user = User::where('institution_id', $id)->sole();
        [$reset, $secret] = app(OtpService::class)->issue($user, OtpService::RESET);
        $count = OtpToken::where('user_id', $user->id)->count();
        $this->api('POST', $this->hostOf($i), 'auth/forgot-password', null, ['login' => $user->phone])->assertOk();
        $this->assertSame($count, OtpToken::where('user_id', $user->id)->count());
        $this->api('POST', $this->hostOf($i), 'auth/reset-password', null, ['login' => $user->phone, 'token' => $secret,
            'password' => 'Changed-secret-42', 'password_confirmation' => 'Changed-secret-42'])->assertStatus(422);
        $this->assertNull($reset->fresh()->used_at);
        $super = $this->makeUser(null, 'super_admin');
        $this->api('POST', self::CENTRAL, "super/institutions/$id/approve-registration", $super, ['decision' => 'reject', 'reason' => 'Private decision'])->assertOk();
        $this->api('PATCH', self::CENTRAL, "super/institutions/$id/toggle", $super)->assertStatus(409);
        $this->api('POST', self::CENTRAL, "super/institutions/$id/approve-registration", $super, ['decision' => 'approve'])->assertStatus(409);
        $this->assertSame('inactive', $i->fresh()->status); $this->assertFalse($user->fresh()->is_active);
    }

    public function test_public_creation_stays_closed_without_both_release_gate_and_safe_delivery(): void
    {
        config(['auth_policy.activation.public_signup_enabled' => false]);
        $this->api('POST', self::CENTRAL, 'public/institutions', null, $this->payload())->assertStatus(503);
        config(['auth_policy.activation.public_signup_enabled' => true]); app()->instance(ActivationDelivery::class, new ActivationDelivery);
        $this->api('POST', self::CENTRAL, 'public/institutions', null, $this->payload())->assertStatus(503);
        $this->assertSame(0, Institution::count());
    }

    public function test_stale_active_flags_tokens_and_login_challenges_cannot_open_a_pending_tenant(): void
    {
        $state = $this->signup(); $id = $state['institution_id']; $i = Institution::findOrFail($id);
        $user = User::where('institution_id', $id)->sole();
        $user->update(['is_active' => true]); // Simulate a stale legacy flag; institution approval remains pending.
        $token = $user->createToken('stale-fixture')->plainTextToken;
        foreach (['auth/me', 'admin/dashboard'] as $path) {
            $this->app['auth']->forgetGuards();
            $this->withHeader('Authorization', 'Bearer '.$token)->getJson('http://'.$this->hostOf($i).'/api/v1/'.$path)
                ->assertForbidden()->assertJsonPath('error', 'institution_inactive');
        }
        $this->flushHeaders();
        $this->api('POST', $this->hostOf($i), 'auth/login', null, ['login' => $user->phone, 'password' => 'Private-secret-42'])->assertUnauthorized();
        [$otp, $code] = app(OtpService::class)->issue($user, OtpService::LOGIN);
        $challenge = \Illuminate\Support\Facades\Crypt::encryptString(json_encode(['u' => $user->id, 'o' => $otp->id, 't' => $id]));
        $this->api('POST', $this->hostOf($i), 'auth/verify-otp', null, ['challenge' => $challenge, 'otp' => $code])->assertUnauthorized();
        $this->assertNull($otp->fresh()->used_at);
        $count = OtpToken::where('user_id', $user->id)->count();
        $this->api('POST', $this->hostOf($i), 'auth/forgot-password', null, ['login' => $user->phone])->assertOk();
        $this->assertSame($count, OtpToken::where('user_id', $user->id)->count());
        $this->assertSame(1, $user->tokens()->count(), 'No login/OTP token was issued');
    }

    public function test_private_client_fields_creator_password_and_non_super_review_are_rejected(): void
    {
        $body = $this->payload(); $body['status'] = 'active';
        $this->api('POST', self::CENTRAL, 'public/institutions', null, $body)->assertStatus(422);
        $super = $this->makeUser(null, 'super_admin');
        $body = $this->payload(); $body['admin'] = $body['principal']; unset($body['principal']);
        $this->api('POST', self::CENTRAL, 'super/institutions', $super, $body)->assertStatus(422);
        unset($body['admin']['password'], $body['admin']['password_confirmation']);
        $id = $this->api('POST', self::CENTRAL, 'super/institutions', $super, $body)->assertCreated()->json('data.id');   // D170: no OTP tracking in this response
        $i = Institution::findOrFail($id); $actor = $this->makeUser($i, 'accountant');
        $this->api('POST', self::CENTRAL, "super/institutions/$id/approve-registration", $actor, ['decision' => 'approve'])->assertForbidden();
        $this->api('POST', $this->hostOf($i), "super/institutions/$id/approve-registration", $super, ['decision' => 'approve'])->assertNotFound();
        $this->api('POST', self::CENTRAL, "super/institutions/$id/approve-registration", null, ['decision' => 'approve'])->assertUnauthorized();
    }

    public function test_signup_and_verification_named_limits_are_enforced(): void
    {
        for ($n = 0; $n < 5; $n++) $this->signup('rate-school-'.$n);
        $this->api('POST', self::CENTRAL, 'public/institutions', null, $this->payload('rate-six'))->assertStatus(429);
        $state = $this->message()['tracking']; $body = ['public_id' => $state['public_id'], 'code' => '000000'];
        // Invalid UUID-bound challenge cannot accidentally succeed even if the random code is 000000.
        $body['public_id'] = (string) Str::uuid();
        for ($n = 0; $n < 5; $n++) $this->api('POST', self::CENTRAL, 'public/institutions/'.$state['institution_id'].'/verify', null, $body)->assertStatus(422);
        $this->api('POST', self::CENTRAL, 'public/institutions/'.$state['institution_id'].'/verify', null, $body)->assertStatus(429);
    }

    public function test_resend_limits_apply_to_tracking_and_normalized_contact_without_disclosure(): void
    {
        $state = $this->signup(); $id = $state['institution_id'];
        $body = ['public_id' => $state['public_id'], 'contact' => ['channel' => 'phone', 'value' => '+8801712345678']];
        $this->api('POST', self::CENTRAL, "public/institutions/$id/verification", null, $body)->assertStatus(202);
        $this->api('POST', self::CENTRAL, "public/institutions/$id/verification", null, $body)->assertStatus(429);
        for ($n = 0; $n < 4; $n++) {
            $body['public_id'] = (string) Str::uuid(); $body['contact']['value'] = '01712345678';
            $this->api('POST', self::CENTRAL, 'public/institutions/999999/verification', null, $body)->assertStatus(202);
        }
        $body['public_id'] = (string) Str::uuid();
        $this->api('POST', self::CENTRAL, 'public/institutions/999999/verification', null, $body)->assertStatus(429);
    }
}
