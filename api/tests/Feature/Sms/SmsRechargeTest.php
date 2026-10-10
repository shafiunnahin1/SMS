<?php

namespace Tests\Feature\Sms;

use App\Models\{SmsCreditTransaction, User};
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
    private ?array $executeAnswer = null;          // what bKash answers to execute (null = the matching Completed payment)

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = config('tenancy.central_domains')[0];
        config(['services.bkash' => ['base_url' => 'https://bkash.sandbox.test/v1', 'app_key' => 'k', 'app_secret' => 's', 'username' => 'u', 'password' => 'p', 'sandbox' => true],
            'app.url' => 'https://' . $this->central]);
        Cache::forget('bkash_token');
    }

    private function fakeBkash(): void
    {
        Http::fake([
            'bkash.sandbox.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.sandbox.test/v1/tokenized/checkout/create' => fn ($req) => Http::response(['paymentID' => 'PAY1', 'bkashURL' => 'https://sandbox.bkash.test/pay/PAY1',
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
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/checkout/create') && $r['amount'] === '500.00' && $r['currency'] === 'BDT'
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
    }

    public function test_the_super_admin_adjustment_writes_an_adjustment_row(): void
    {
        $i = $this->makeInstitution('rech3');
        $super = User::create(['name' => 'S', 'email' => 's@x.test', 'password' => 'x', 'role' => 'super_admin']);
        $this->api('POST', 'admin.' . config('tenancy.base_domain'), "super/institutions/{$i->id}/sms-credits", $super, ['amount' => '100', 'note' => 'bank transfer'])->assertOk();
        $row = Tenancy::as($i, fn () => SmsCreditTransaction::sole());
        $this->assertSame(['adjustment', '100.00', 'admin: bank transfer'], [$row->type, $row->amount, $row->reference]);
    }
}
