<?php

namespace Tests\Feature\Wallet;

use App\Models\{Institution, InstitutionModuleSubscription, ModulePrice, Payment, SmsCreditTransaction, SubscriptionInvoice};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D218 WAL.2: the admin pays the module bill from the central wallet - the whole total in one go with a `subscription` ledger row,
// never below zero (422 wallet_insufficient, nothing written), the bill recorded as before (invoice, the module's new period), the
// admins told about the invoice; nothing is taken automatically; a NEW bKash checkout is refused (410 use_wallet); entering
// grace tells the admins.
class WalletSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_pay_from_the_wallet_short_balance_and_the_retired_checkout(): void
    {
        $this->travelTo('2026-11-02 10:00:00');
        ModulePrice::create(['module_key' => 'expenses', 'monthly_price' => '300', 'yearly_price' => '3000', 'effective_from' => now()->subDay()]);
        $i = $this->makeInstitution('wsub');
        $h = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');
        $items = ['items' => [['module_key' => 'expenses', 'billing_cycle' => 'monthly']]];

        // the old bKash checkout is retired for new payments
        $this->api('POST', $h, 'subscription/checkout', $admin, $items)->assertStatus(410)->assertJsonPath('error', 'use_wallet');

        // a short balance: refused, nothing written
        $i->forceFill(['sms_balance' => '299.99'])->save();
        $this->api('POST', $h, 'subscription/pay-from-wallet', $admin, $items)->assertStatus(422)->assertJsonPath('error', 'wallet_insufficient');
        $this->api('POST', $h, 'subscription/pay-from-wallet', $admin, $items + ['total' => '1'])->assertStatus(422);
        $this->api('POST', $h, 'subscription/pay-from-wallet', $this->makeUser($i, 'accountant'), $items)->assertForbidden();
        Tenancy::as($i, fn () => $this->assertSame([0, 0, 0], [SmsCreditTransaction::count(), Payment::count(), SubscriptionInvoice::count()]));

        // enough: the whole total is taken once, the bill is recorded, the module's period moves
        $i->forceFill(['sms_balance' => '500.00'])->save();
        $r = $this->api('POST', $h, 'subscription/pay-from-wallet', $admin, $items)->assertOk()->json('data');
        $this->assertSame(['300.00', '200.00', true], [$r['total'], $r['balance'], $r['paid']]);
        Tenancy::as($i, function () use ($r) {
            $row = SmsCreditTransaction::sole();
            $this->assertSame(['subscription', '-300.00', '200.00', $r['invoice_number']], [$row->type, (string) $row->amount, (string) $row->balance_after, $row->reference]);
            $this->assertSame(['wallet', '300.00'], [Payment::sole()->method, (string) Payment::sole()->amount]);
            $this->assertSame('2027-01-02', InstitutionModuleSubscription::where('module_key', 'expenses')->sole()->current_period_end->toDateString());
        });
        $this->assertSame('200.00', (string) Institution::find($i->id)->sms_balance);
        $this->assertSame(1, $admin->notifications()->where('data->type', 'subscription_invoice')->count());

        // the period ends unpaid: grace, and the admins are told; nothing is taken from the wallet by itself
        $this->travelTo('2027-01-03 10:00:00');
        $this->artisan('subscriptions:refresh')->assertSuccessful();
        $this->assertSame(1, $admin->notifications()->where('data->type', 'subscription_grace')->where('data->data->module_key', 'expenses')->count());
        $this->artisan('subscriptions:refresh')->assertSuccessful();
        $this->assertSame(1, $admin->notifications()->where('data->type', 'subscription_grace')->where('data->data->module_key', 'expenses')->count(), 'told once');
        $this->assertSame('200.00', (string) Institution::find($i->id)->sms_balance);
        Tenancy::as($i, fn () => $this->assertSame(1, SmsCreditTransaction::count()));
    }
}
