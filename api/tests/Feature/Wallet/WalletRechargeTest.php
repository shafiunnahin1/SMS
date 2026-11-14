<?php

namespace Tests\Feature\Wallet;

use App\Models\{AuditLog, Institution, PlatformSetting, SmsCreditTransaction, User, WalletRechargeRequest};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Hash, Storage};
use Tests\TestCase;

// D218 WAL.1: the Super Admin writes where to send money; an institution admin files a manual top-up (1 taka minimum, the receipt
// as JPG / PNG / PDF up to 5 MB on the private disk); one claim per method + reference on the whole platform; the Super Admin sees
// every institution's queue and the receipt, approves (the wallet is credited once, in the ledger) or rejects with a reason.
class WalletRechargeTest extends TestCase
{
    use RefreshDatabase;

    private function file(string $host, User $admin, array $body, ?UploadedFile $receipt = null)
    {
        $this->app['auth']->forgetGuards();
        $data = $body + ($receipt === null ? ['receipt' => UploadedFile::fake()->create('slip.pdf', 200, 'application/pdf')] : ['receipt' => $receipt]);
        return $this->post("http://{$host}/api/v1/wallet/recharge-requests", $data, ['Authorization' => 'Bearer ' . $admin->createToken('t')->plainTextToken, 'Accept' => 'application/json']);
    }

    public function test_file_approve_reject_and_the_one_claim_rule(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('walla');
        $j = $this->makeInstitution('wallb');
        $h = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');
        $adminB = $this->makeUser($j, 'admin');
        $accountant = $this->makeUser($i, 'accountant');
        $super = User::create(['name' => 'Root', 'email' => 'root@example.test', 'password' => Hash::make('x'), 'role' => 'super_admin', 'institution_id' => null]);
        $central = config('tenancy.central_domains')[0] ?? ('www.' . config('tenancy.base_domain'));

        // the instructions
        $this->api('PUT', $central, 'super/wallet/instructions', $admin, ['instructions' => 'x'])->assertForbidden();
        $this->api('PUT', $central, 'super/wallet/instructions', $super, ['instructions' => "bKash: 01700000000 (Send Money)\nব্যাংক: ১২৩৪"])->assertOk();
        $page = $this->api('GET', $h, 'wallet/recharge-requests', $admin)->assertOk()->json('data');
        $this->assertSame(["bKash: 01700000000 (Send Money)\nব্যাংক: ১২৩৪", '1.00', '0.00', []], [$page['instructions'], $page['min'], $page['balance'], $page['requests']]);
        $this->api('GET', $h, 'wallet/recharge-requests', $accountant)->assertForbidden();

        // filing: the amount range, the receipt type and size, the method
        $this->file($h, $admin, ['amount' => '0.50', 'method' => 'bkash', 'trx_reference' => 'BK1234'])->assertStatus(422)->assertJsonPath('error', 'wallet_amount_range');
        $this->file($h, $admin, ['amount' => '1', 'method' => 'bkash', 'trx_reference' => 'BK1234'], UploadedFile::fake()->create('slip.docx', 10))->assertStatus(422);
        $this->file($h, $admin, ['amount' => '1', 'method' => 'bkash', 'trx_reference' => 'BK1234'], UploadedFile::fake()->create('big.pdf', 6000, 'application/pdf'))->assertStatus(422);
        $this->file($h, $admin, ['amount' => '1', 'method' => 'paypal', 'trx_reference' => 'BK1234'])->assertStatus(422);
        $one = $this->file($h, $admin, ['amount' => '1', 'method' => 'bkash', 'trx_reference' => 'bk 9xa1', 'note' => 'প্রথম'], UploadedFile::fake()->image('slip.png'))->assertCreated()->json('data');
        $this->assertSame(['1.00', 'BK9XA1', 'pending'], [$one['amount'], $one['trx_reference'], $one['status']]);
        $big = $this->file($h, $admin, ['amount' => '2500.50', 'method' => 'bank', 'trx_reference' => 'DBBL-77'])->assertCreated()->json('data.id');
        Tenancy::as($i, fn () => Storage::disk('private')->assertExists(WalletRechargeRequest::find($one['id'])->receipt_path));
        $this->api('GET', $h, "wallet/recharge-requests/{$one['id']}/receipt", $admin)->assertOk();

        // the same method + reference cannot be claimed again - here or by another institution; a different method is another claim
        $this->file($h, $admin, ['amount' => '1', 'method' => 'bkash', 'trx_reference' => 'BK9XA1'])->assertStatus(422)->assertJsonPath('error', 'wallet_reference_used');
        $this->file($this->hostOf($j), $adminB, ['amount' => '1', 'method' => 'bkash', 'trx_reference' => 'bk9xa1'])->assertStatus(422)->assertJsonPath('error', 'wallet_reference_used');
        $this->file($this->hostOf($j), $adminB, ['amount' => '5', 'method' => 'nagad', 'trx_reference' => 'BK9XA1'])->assertCreated();
        // another institution's request and receipt are not reachable from here
        $this->api('GET', $this->hostOf($j), "wallet/recharge-requests/{$one['id']}/receipt", $adminB)->assertNotFound();
        $this->assertCount(1, $this->api('GET', $this->hostOf($j), 'wallet/recharge-requests', $adminB)->json('data.requests'));

        // the Super Admin's queue: every institution, the receipt, approve / reject
        $q = $this->api('GET', $central, 'super/wallet/recharge-requests?status=pending', $super)->assertOk()->json('data');
        $this->assertCount(3, $q);
        $this->assertSame('institution', $q[0]['wallet']);
        $this->api('GET', $central, "super/wallet/recharge-requests/{$one['id']}/receipt", $super)->assertOk();
        $this->api('POST', $central, "super/wallet/recharge-requests/{$one['id']}/approve", $admin)->assertForbidden();
        $this->api('POST', $central, "super/wallet/recharge-requests/{$one['id']}/approve", $super)->assertOk()->assertJsonPath('data.status', 'approved');
        $this->api('POST', $central, "super/wallet/recharge-requests/{$one['id']}/approve", $super)->assertStatus(422)->assertJsonPath('error', 'wallet_request_decided');
        $this->api('POST', $central, "super/wallet/recharge-requests/{$big}/reject", $super, [])->assertStatus(422);
        $this->api('POST', $central, "super/wallet/recharge-requests/{$big}/reject", $super, ['reason' => 'রসিদ অস্পষ্ট'])->assertOk()->assertJsonPath('data.status', 'rejected');

        // the wallet: credited once, with a ledger row; a rejected reference may be filed again
        $this->assertSame('1.00', (string) Institution::find($i->id)->sms_balance);
        Tenancy::as($i, function () use ($one, $super) {
            $rows = SmsCreditTransaction::orderBy('id')->get();
            $this->assertSame([['purchase', '1.00', '1.00', 'manual:' . $one['id'], $super->id]], $rows->map(fn ($r) => [$r->type, (string) $r->amount, (string) $r->balance_after, $r->reference, $r->created_by])->all());
            $this->assertSame(['wallet.recharge_requested', 'wallet.recharge_requested', 'wallet.recharge_approved', 'wallet.recharge_rejected'], AuditLog::where('action', 'like', 'wallet.%')->orderBy('id')->pluck('action')->all());
        });
        $this->assertEqualsCanonicalizing([__('wallet.approved_title'), __('wallet.rejected_title')], $admin->notifications()->where('data->type', 'wallet_recharge')->get()->pluck('data.title')->all(), 'the admin is told both decisions');
        $this->assertSame(2, $admin->notifications()->where('data->type', 'wallet_recharge')->count());
        $this->file($h, $admin, ['amount' => '2500.50', 'method' => 'bank', 'trx_reference' => 'DBBL-77'])->assertCreated();
        $this->assertSame('1.00', $this->api('GET', $h, 'wallet/recharge-requests', $admin)->json('data.balance'));
        $this->assertSame((string) PlatformSetting::read('wallet_recharge_instructions'), $this->api('GET', $central, 'super/wallet/instructions', $super)->json('data.instructions'));
    }
}
