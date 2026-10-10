<?php

namespace Tests\Feature\Sms;

use App\Models\{SmsCreditTransaction, User};
use App\Services\Billing\BkashService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Http};
use Tests\TestCase;

// docs/TESTING.md "SmsRechargeTest" (D58): POST /subscription/sms-credits creates a bKash payment (sandbox fake); the
// central-domain callback executes it once; a success adds the amount to the wallet with a `purchase` row; a repeated or failed
// callback adds nothing; Super Admin `adjust` writes an `adjustment` row.
class SmsRechargeTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private ?array $executeAnswer = null;
    private ?array $createAnswer = null;           // what bKash answers to create (null = a started payment)          // what bKash answers to execute (null = the matching Completed payment)

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = config('tenancy.central_domains')[0];
        config(['services.bkash' => ['base_url' => 'https://bkash.sandbox.test/v1', 'app_key' => 'k', 'app_secret' => 's', 'username' => 'u', 'password' => 'p', 'sandbox' => true],
            'app.url' => 'https://' . $this->central]);
    }

    private function fakeBkash(): void
    {
        Http::fake([
            'bkash.sandbox.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.sandbox.test/v1/tokenized/checkout/create' => fn ($req) => Http::response($this->createAnswer ?? ['paymentID' => 'PAY1', 'bkashURL' => 'https://sandbox.bkash.test/pay/PAY1',
                'amount' => $req['amount'], 'merchantInvoiceNumber' => $req['merchantInvoiceNumber']]),
            'bkash.sandbox.test/v1/tokenized/checkout/execute' => fn ($req) => Http::response($this->executeAnswer ?? ['paymentID' => 'PAY1', 'trxID' => 'TRX9',
                'transactionStatus' => 'Completed', 'amount' => '500', 'merchantInvoiceNumber' => Cache::get('last_ref')]),
        ]);
    }

    private function start(array $setup = []): array
    {
        $i = $this->makeInstitution('rech');
        $i->forceFill(['sms_balance' => '1.00'] + $setup)->save();
        $admin = $this->makeUser($i, 'admin');
        $res = $this->api('POST', $this->hostOf($i), 'subscription/sms-credits', $admin, ['amount' => 500])->assertOk();
        Cache::put('last_ref', $res->json('data.ref'));
        return [$i, $admin, $res->json('data.ref')];
    }

    private function returnFromBkash(string $ref, string $status = 'success', string $paymentId = 'PAY1')
    {
        return $this->get("http://{$this->central}/api/v1/billing/bkash/callback?ref={$ref}&paymentID={$paymentId}&status={$status}");
    }

    public function test_a_recharge_adds_the_amount_once(): void
    {
        $this->fakeBkash();
        [$i, , $ref] = $this->start();
        $this->assertMatchesRegularExpression('/^[A-Z0-9]{1,20}$/', $ref);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/checkout/create') && $r['amount'] === '500.00' && $r['currency'] === 'BDT' && $r['mode'] === '0011' && $r['payerReference'] === $ref
            && $r['callbackURL'] === "https://{$this->central}/api/v1/billing/bkash/callback?ref={$ref}");

        $this->returnFromBkash($ref)->assertRedirect('http://' . $this->hostOf($i) . '/admin/sms?recharge=success');
        $this->assertSame('501.00', $i->fresh()->sms_balance);
        $row = Tenancy::as($i, fn () => SmsCreditTransaction::sole());
        $this->assertSame(['purchase', '500.00', '501.00', "bkash:{$ref}"], [$row->type, $row->amount, $row->balance_after, $row->reference]);

        $this->returnFromBkash($ref)->assertRedirect();                                  // the browser comes back twice
        $this->assertSame(['501.00', 1], [$i->fresh()->sms_balance, Tenancy::as($i, fn () => SmsCreditTransaction::count())]);
        Http::assertSentCount(3, 'one grant, one create, one execute - a repeat does not execute again');
    }

    public function test_a_failed_cancelled_or_mismatched_payment_adds_nothing(): void
    {
        $this->fakeBkash();
        [$i, , $ref] = $this->start();
        $this->returnFromBkash($ref, 'failure')->assertRedirect('http://' . $this->hostOf($i) . '/admin/sms?recharge=failed');
        $this->returnFromBkash($ref, 'cancel')->assertRedirect('http://' . $this->hostOf($i) . '/admin/sms?recharge=cancelled');
        $this->returnFromBkash($ref, 'success', 'OTHER')->assertRedirect('http://' . $this->hostOf($i) . '/admin/sms?recharge=failed');
        $this->returnFromBkash('NOPE123')->assertNotFound();
        $this->assertSame('1.00', $i->fresh()->sms_balance);

        foreach ([['transactionStatus' => 'Completed', 'amount' => '50', 'merchantInvoiceNumber' => $ref], ['transactionStatus' => 'Initiated', 'amount' => '500', 'merchantInvoiceNumber' => $ref],
                  ['statusCode' => '2056', 'statusMessage' => 'Invalid Payment State']] as $answer) {
            $this->executeAnswer = $answer;
            $this->returnFromBkash($ref)->assertRedirect('http://' . $this->hostOf($i) . '/admin/sms?recharge=failed');
        }
        $this->assertSame(['1.00', 0], [$i->fresh()->sms_balance, Tenancy::as($i, fn () => SmsCreditTransaction::count())]);
    }

    public function test_only_the_admin_and_only_with_bkash_configured(): void
    {
        $this->fakeBkash();
        $i = $this->makeInstitution('rech2');
        $host = $this->hostOf($i);
        $this->api('POST', $host, 'subscription/sms-credits', $this->makeUser($i, 'accountant'), ['amount' => 500])->assertForbidden();
        $admin = $this->makeUser($i, 'admin');
        $this->api('POST', $host, 'subscription/sms-credits', $admin, ['amount' => 5])->assertStatus(422);
        $this->api('POST', $host, 'subscription/sms-credits', $admin, ['amount' => '10.555'])->assertStatus(422);

        config(['services.bkash.app_key' => null]);
        $this->api('POST', $host, 'subscription/sms-credits', $admin, ['amount' => 500])->assertStatus(503)->assertJsonPath('error', 'recharge_unavailable');
        Http::assertNothingSent();

        config(['services.bkash.app_key' => 'k']);
        // the v2 spelling (paymentId) is understood; an answer without it names its fields in the reason
        $this->createAnswer = ['paymentId' => 'PAYV2', 'bkashURL' => 'https://sandbox.bkash.test/pay/PAYV2', 'statusCode' => '0000'];
        $this->api('POST', $host, 'subscription/sms-credits', $admin, ['amount' => 500])->assertOk()->assertJsonPath('data.bkash_url', 'https://sandbox.bkash.test/pay/PAYV2');
        config(['app.debug' => true]);
        $this->createAnswer = ['statusCode' => '0000', 'agreementStatus' => 'Initiated'];
        $this->assertStringContainsString('fields: statusCode, agreementStatus', $this->api('POST', $host, 'subscription/sms-credits', $admin, ['amount' => 500])->json('message'));
        config(['app.debug' => false]);

        // bKash refuses the create: 502, and on a debug server the reason is in the message (never a key)
        config(['app.debug' => true]);
        $this->createAnswer = ['statusCode' => '2023', 'statusMessage' => 'Insufficient Balance'];
        $res = $this->api('POST', $host, 'subscription/sms-credits', $admin, ['amount' => 500])->assertStatus(502)->assertJsonPath('error', 'recharge_failed');
        $this->assertStringContainsString('create: HTTP 200 2023 - Insufficient Balance', $res->json('message'));
        config(['app.debug' => false]);
        $this->assertStringNotContainsString('2023', $this->api('POST', $host, 'subscription/sms-credits', $admin, ['amount' => 500])->json('message'));
    }

    public function test_the_super_admin_adjustment_writes_an_adjustment_row(): void
    {
        $i = $this->makeInstitution('rech3');
        $super = User::create(['name' => 'S', 'email' => 's@x.test', 'password' => 'x', 'role' => 'super_admin']);
        $this->api('POST', 'admin.' . config('tenancy.base_domain'), "super/institutions/{$i->id}/sms-credits", $super, ['amount' => '100', 'note' => 'bank transfer'])->assertOk();
        $row = Tenancy::as($i, fn () => SmsCreditTransaction::sole());
        $this->assertSame(['adjustment', '100.00', 'admin: bank transfer'], [$row->type, $row->amount, $row->reference]);
    }

    public function test_the_super_admin_sets_the_bkash_merchant_in_the_panel(): void
    {
        config(['services.bkash' => ['base_url' => null, 'app_key' => null, 'app_secret' => null, 'username' => null, 'password' => null, 'sandbox' => true]]);
        $super = User::create(['name' => 'S', 'email' => 's@x.test', 'password' => 'x', 'role' => 'super_admin']);
        $central = 'admin.' . config('tenancy.base_domain');
        $this->assertFalse($this->api('GET', $central, 'super/sms-settings', $super)->json('data.bkash.configured'));

        // the owner's sample keeps "/tokenized" in its base URL - both forms work
        $res = $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['base_url' => 'https://bkash.panel.test/v1/tokenized', 'sandbox' => true,
            'app_key' => 'panel-app-key-1111', 'app_secret' => 'panel-secret-2222', 'username' => 'panel-user-3333', 'password' => 'panel-pass-4444']])->assertOk();
        $this->assertSame([true, '••••1111', 'panel', '••••4444'], [$res->json('data.bkash.configured'), $res->json('data.bkash.app_key.hint'),
            $res->json('data.bkash.app_key.source'), $res->json('data.bkash.password.hint')]);
        foreach (['panel-app-key-1111', 'panel-secret-2222', 'panel-user-3333', 'panel-pass-4444'] as $secret) {
            $this->assertStringNotContainsString($secret, $res->getContent());
            $this->assertStringNotContainsString($secret, (string) \App\Models\PlatformSetting::pluck('value')->toJson(), 'stored encrypted');
        }

        Http::fake([
            'bkash.panel.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.panel.test/v1/tokenized/checkout/create' => Http::response(['paymentID' => 'P', 'bkashURL' => 'https://pay.test/P']),
        ]);
        $this->assertTrue($this->api('PUT', $central, 'super/sms-settings', $super, ['bkash_test' => true])->json('data.bkash.test_ok'));
        $i = $this->makeInstitution('panelbk');
        $admin = $this->makeUser($i, 'admin');
        $this->api('POST', $this->hostOf($i), 'subscription/sms-credits', $admin, ['amount' => 100])->assertOk();
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/token/grant') && $r->header('username')[0] === 'panel-user-3333'
            && $r->header('password')[0] === 'panel-pass-4444' && $r['app_key'] === 'panel-app-key-1111' && $r['app_secret'] === 'panel-secret-2222');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/checkout/create') && $r->header('X-APP-Key')[0] === 'panel-app-key-1111');

        // an address that cannot be reached answers "refused", never a server error
        $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['base_url' => 'https://bkash.down.test/v1']])->assertOk();
        Http::fake(['bkash.down.test/*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('down')]);
        $res = $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash_test' => true])->assertOk();
        $this->assertSame([false, 'token: down'], [$res->json('data.bkash.test_ok'), $res->json('data.bkash.test_error')], 'the reason is shown');

        // bKash's own refusal (HTTP 200 with a statusCode) is shown with its code and message, never a key
        $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['base_url' => 'https://bkash.refuse.test/v1']])->assertOk();
        Http::fake(['bkash.refuse.test/*' => Http::response(['statusCode' => '2079', 'statusMessage' => 'Invalid app token'], 200)]);
        $res = $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash_test' => true])->assertOk();
        $this->assertSame([false, 'token: HTTP 200 2079 - Invalid app token'], [$res->json('data.bkash.test_ok'), $res->json('data.bkash.test_error')]);
        $this->assertStringNotContainsString('panel-secret-2222', $res->getContent());

        // an empty field keeps the stored secret; with no address the sandbox switch picks bKash's sandbox, never the live one
        $res = $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['app_key' => '', 'base_url' => null]])->assertOk();
        $this->assertSame([true, true, BkashService::SANDBOX_URL], [$res->json('data.bkash.app_key.set'), $res->json('data.bkash.configured'), $res->json('data.bkash.base_url')]);
        $this->assertSame(BkashService::LIVE_URL, $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['sandbox' => false]])->json('data.bkash.base_url'));
        $this->assertSame([false, null], [$this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['clear' => true]])->json('data.bkash.configured'),
            $this->api('GET', $central, 'super/sms-settings', $super)->json('data.bkash.app_key.hint')]);
        $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['base_url' => 'http://insecure.test']])->assertStatus(422);
        // sandbox and live never mix (owner: pay.bka.sh is production only)
        $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['sandbox' => true, 'base_url' => 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized']])
            ->assertStatus(422)->assertJsonValidationErrors('bkash.base_url');
        $this->api('PUT', $central, 'super/sms-settings', $super, ['bkash' => ['sandbox' => false, 'base_url' => BkashService::SANDBOX_URL]])
            ->assertStatus(422)->assertJsonValidationErrors('bkash.base_url');
        $this->assertSame([true, false], [BkashService::modeMatches(BkashService::SANDBOX_URL, true), BkashService::modeMatches(BkashService::LIVE_URL, true)]);
        $this->api('PUT', $central, 'super/sms-settings', $admin, ['bkash' => ['app_key' => 'x']])->assertForbidden();
    }
}
