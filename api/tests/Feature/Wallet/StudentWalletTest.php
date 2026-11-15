<?php

namespace Tests\Feature\Wallet;

use App\Models\{User, UserWallet, UserWalletTransaction, WalletRechargeRequest};
use App\Services\Wallet\StudentWalletService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Cache, Hash, Http, Storage};
use Tests\TestCase;

// D218 WAL.3: a student's own wallet - the balance and ledger; a manual top-up with the receipt that the Super Admin approves (the
// student's wallet is credited, not the institution's); a bKash top-up credited only by the callback for exactly our amount and
// only once; the ledger never goes below zero and a reference is never credited twice; nobody else reaches it.
class StudentWalletTest extends TestCase
{
    use RefreshDatabase;

    private function student($i, string $slug = 's'): User
    {
        $u = $this->makeUser($i, 'student');
        $u->forceFill(['email' => "{$slug}@example.test", 'must_change_password' => false])->save();
        return $u;
    }

    public function test_manual_and_bkash_top_up_and_the_ledger(): void
    {
        Storage::fake('private');
        $central = config('tenancy.central_domains')[0];
        config(['services.bkash' => ['base_url' => 'https://bkash.sandbox.test/v1', 'app_key' => 'k', 'app_secret' => 's', 'username' => 'u', 'password' => 'p', 'sandbox' => true], 'app.url' => 'https://' . $central]);
        Http::fake([
            'bkash.sandbox.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.sandbox.test/v1/tokenized/checkout/create' => fn ($req) => tap(Http::response(['paymentID' => 'PAY7', 'bkashURL' => 'https://sandbox.bkash.test/pay/PAY7']), fn () => Cache::put('t_ref', $req['merchantInvoiceNumber'])),
            'bkash.sandbox.test/v1/tokenized/checkout/execute' => fn () => Http::response(['paymentID' => 'PAY7', 'trxID' => 'TRX7', 'transactionStatus' => 'Completed', 'amount' => Cache::get('t_amount', '1'), 'merchantInvoiceNumber' => Cache::get('t_ref')]),
        ]);
        $i = $this->makeInstitution('swal');
        $h = $this->hostOf($i);
        $s = $this->student($i);
        $other = $this->student($i, 's2');

        // the wallet starts at zero; only a student reaches it
        $this->api('GET', $h, 'student/wallet', $s)->assertOk()->assertJsonPath('data.balance', '0.00')->assertJsonPath('data.bkash', true);
        $this->api('GET', $h, 'student/wallet', $this->makeUser($i, 'admin'))->assertForbidden();

        // a manual top-up: filed for the student's own wallet; the Super Admin credits the student, not the institution
        $this->app['auth']->forgetGuards();
        $req = $this->post("http://{$h}/api/v1/student/wallet/recharge-requests", ['amount' => '1', 'method' => 'bkash', 'trx_reference' => 'SBK1', 'receipt' => UploadedFile::fake()->image('r.jpg')],
            ['Authorization' => 'Bearer ' . $s->createToken('t')->plainTextToken, 'Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->assertSame($s->id, Tenancy::as($i, fn () => WalletRechargeRequest::find($req)->user_id));
        $super = User::create(['name' => 'Root', 'email' => 'root@example.test', 'password' => Hash::make('x'), 'role' => 'super_admin', 'institution_id' => null]);
        $this->assertSame('student', collect($this->api('GET', $central, 'super/wallet/recharge-requests', $super)->json('data'))->firstWhere('id', $req)['wallet']);
        $this->assertSame($s->name, collect($this->api('GET', $central, 'super/wallet/recharge-requests', $super)->json('data'))->firstWhere('id', $req)['student']['name']);   // the Super Admin sees whose wallet
        $this->api('POST', $central, "super/wallet/recharge-requests/{$req}/approve", $super)->assertOk();
        $this->assertSame('1.00', $this->api('GET', $h, 'student/wallet', $s)->json('data.balance'));
        $this->assertSame('0.00', (string) $i->fresh()->sms_balance, 'the institution wallet is untouched');
        $this->assertSame('0.00', $this->api('GET', $h, 'student/wallet', $other)->json('data.balance'));

        // bKash: the amount range, then only the callback for exactly our amount credits, once
        $this->api('POST', $h, 'student/wallet/bkash', $s, ['amount' => '0.50'])->assertStatus(422)->assertJsonPath('error', 'wallet_amount_range');
        $r = $this->api('POST', $h, 'student/wallet/bkash', $s, ['amount' => '120'])->assertOk()->json('data');
        $this->assertSame('120.00', $r['amount']);
        $this->get("http://{$central}/api/v1/wallet/student/bkash/callback?ref={$r['ref']}&paymentID=PAY7&status=cancel")->assertRedirect();
        $this->assertSame('1.00', $this->api('GET', $h, 'student/wallet', $s)->json('data.balance'));
        Cache::put('t_amount', '100');   // bKash says a different amount: nothing
        $this->get("http://{$central}/api/v1/wallet/student/bkash/callback?ref={$r['ref']}&paymentID=PAY7&status=success")->assertRedirect();
        $this->assertSame('1.00', $this->api('GET', $h, 'student/wallet', $s)->json('data.balance'));
        Cache::put('t_amount', '120');
        $this->get("http://{$central}/api/v1/wallet/student/bkash/callback?ref={$r['ref']}&paymentID=PAY7&status=success")->assertRedirect();
        $this->get("http://{$central}/api/v1/wallet/student/bkash/callback?ref={$r['ref']}&paymentID=PAY7&status=success")->assertRedirect();
        $this->get("http://{$central}/api/v1/wallet/student/bkash/callback?ref=NOPE&paymentID=PAY7&status=success")->assertNotFound();
        $w = $this->api('GET', $h, 'student/wallet', $s)->assertOk()->json('data');
        $this->assertSame('121.00', $w['balance']);
        $this->assertSame([['recharge', '120.00', '121.00'], ['recharge', '1.00', '1.00']], array_map(fn ($t) => [$t['type'], $t['amount'], $t['balance_after']], $w['transactions']));

        // the service: never below zero, a reference once
        Tenancy::as($i, function () use ($s) {
            $svc = app(StudentWalletService::class);
            $this->assertNotNull($svc->move($s, 'purchase', -2100, 'order:1', $s->id));
            $this->assertNull($svc->move($s, 'purchase', -2100, 'order:1', $s->id), 'the same reference is not written twice');
            try { $svc->move($s, 'purchase', -10001, 'order:2', $s->id); $this->fail('below zero'); } catch (\App\Exceptions\BusinessException $e) { $this->assertSame('wallet_insufficient', $e->errorCode); }
            $this->assertSame('100.00', (string) UserWallet::where('user_id', $s->id)->value('balance'));
            $this->assertSame(3, UserWalletTransaction::where('user_id', $s->id)->count());
        });
    }
}
