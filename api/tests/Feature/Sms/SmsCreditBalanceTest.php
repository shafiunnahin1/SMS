<?php

namespace Tests\Feature\Sms;

use App\Models\{SmsCreditTransaction, SubscriptionPlan};
use App\Services\SmsService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "SmsCreditBalanceTest": GET /subscription/sms-credits shows the balance and the ledger; credit added and used
// add up - in taka since D56 (the purchase row is written here directly; the online recharge has its own test, SmsRechargeTest).
class SmsCreditBalanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_balance_and_ledger_add_up(): void
    {
        $plan = SubscriptionPlan::create(['name' => 'None', 'price' => 1, 'duration_days' => 30, 'max_sms' => 0]);
        $i = $this->makeInstitution('bal');
        $i->forceFill(['subscription_plan_id' => $plan->id, 'sms_balance' => 0, 'settings' => ['sms_short_name' => 'Bal']])->save();
        Tenancy::as($i->fresh(), function () use ($i) {
            $i->forceFill(['sms_balance' => '10.00'])->save();
            SmsCreditTransaction::create(['type' => 'purchase', 'amount' => '10.00', 'balance_after' => '10.00', 'reference' => 'trx-1']);
            app(SmsService::class)->send('01711111111', 'one');
            app(SmsService::class)->send('01711111111', 'two');
        });
        $host = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');

        $res = $this->api('GET', $host, 'subscription/sms-credits', $admin)->assertOk();
        $this->assertSame(['9.20', '0.40', 2, '0.80'], [$res->json('data.balance'), $res->json('data.rate'), $res->json('data.sent_this_month'), $res->json('data.spent_this_month')]);
        $rows = $res->json('data.transactions');
        $this->assertSame([['usage', '-0.40', '9.20'], ['usage', '-0.40', '9.60'], ['purchase', '10.00', '10.00']], array_map(fn ($t) => [$t['type'], $t['amount'], $t['balance_after']], $rows));
        $this->assertSame(\App\Support\Money::toPaisa($res->json('data.balance')), array_sum(array_map(fn ($t) => \App\Support\Money::toPaisa($t['amount']), $rows)), 'the ledger adds up to the balance');

        $this->api('GET', $host, 'subscription/sms-credits', $this->makeUser($i, 'accountant'))->assertForbidden();
        $this->api('POST', $host, 'subscription/sms-credits', $admin, ['quantity' => 100])->assertStatus(405);   // buying is Step 5.2
    }
}
