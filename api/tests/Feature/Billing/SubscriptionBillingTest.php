<?php

namespace Tests\Feature\Billing;

use App\Models\{Coupon, CouponRedemption, InstitutionModuleSubscription, ModulePrice, Payment, SubscriptionInvoice, SubscriptionInvoiceLine, User};
use App\Services\Billing\ModuleEntitlementService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Http};
use Tests\TestCase;

// D187 SUB.2: the server prices the bill (whole period, prorated add, coupon), bKash records it once, companions are required,
// removing takes effect from the next period without a refund, and coupons follow every Super Admin rule.
class SubscriptionBillingTest extends TestCase
{
    use RefreshDatabase;

    private string $central;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = config('tenancy.central_domains')[0];
        config(['services.bkash' => ['base_url' => 'https://bkash.sandbox.test/v1', 'app_key' => 'k', 'app_secret' => 's', 'username' => 'u', 'password' => 'p', 'sandbox' => true],
            'app.url' => 'https://' . $this->central]);
        $this->travelTo('2026-11-02 10:00:00');
        foreach (['expenses' => ['300', '3000'], 'cashbook' => ['100', '1000'], 'fees' => ['600', '6000']] as $k => [$m, $y]) {
            ModulePrice::create(['module_key' => $k, 'monthly_price' => $m, 'yearly_price' => $y, 'effective_from' => now()->subDay()]);
        }
        Http::fake([
            'bkash.sandbox.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.sandbox.test/v1/tokenized/checkout/create' => fn ($req) => Http::response(['paymentID' => 'PAY1', 'bkashURL' => 'https://sandbox.bkash.test/pay/PAY1']),
            'bkash.sandbox.test/v1/tokenized/checkout/execute' => fn () => Http::response(['paymentID' => 'PAY1', 'trxID' => 'TRX9', 'transactionStatus' => 'Completed',
                'amount' => Cache::get('t_total'), 'merchantInvoiceNumber' => Cache::get('t_ref')]),
        ]);
    }

    private function superAdmin(): User
    {
        return User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000029', 'password' => 'Super-pass-2026', 'is_active' => true]);
    }

    private function pay($i, User $admin, array $items, string $status = 'success')
    {
        $r = $this->api('POST', $this->hostOf($i), 'subscription/checkout', $admin, ['items' => $items])->assertOk();
        Cache::put('t_ref', $r->json('data.ref')); Cache::put('t_total', $r->json('data.total'));
        return [$r->json('data.ref'), $this->get("http://{$this->central}/api/v1/billing/subscription/bkash/callback?ref={$r->json('data.ref')}&paymentID=PAY1&status={$status}")];
    }

    public function test_whole_period_after_trial_prorated_add_and_once_only_recording(): void
    {
        $i = $this->makeInstitution('bill-school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'expenses', 'billing_cycle' => 'monthly']], 'total' => '1'])->assertStatus(422);

        // during the trial the paid month starts when the trial ends (2026-12-02), full price
        $q = $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'expenses', 'billing_cycle' => 'monthly']]])->assertOk()->json('data');
        $this->assertSame(['300.00', '0.00', '300.00'], [$q['subtotal'], $q['discount'], $q['total']]);
        $this->assertSame(['2026-12-02', '2027-01-02', 31], [substr($q['lines'][0]['period_start'], 0, 10), substr($q['lines'][0]['period_end'], 0, 10), $q['lines'][0]['days']]);

        [$ref, $back] = $this->pay($i, $admin, [['module_key' => 'expenses', 'billing_cycle' => 'monthly']]);
        $back->assertRedirect('http://' . $host . '/admin/subscription?payment=success');
        $this->get("http://{$this->central}/api/v1/billing/subscription/bkash/callback?ref={$ref}&paymentID=PAY1&status=success")->assertRedirect('http://' . $host . '/admin/subscription?payment=success');
        Tenancy::as($i, function () use ($ref) {
            $this->assertSame(1, Payment::where('invoice_no', $ref)->count());
            $inv = SubscriptionInvoice::sole();
            $this->assertSame(['INV-' . $ref, '300.00', '300.00', '0.00'], [$inv->invoice_number, $inv->amount, $inv->total, $inv->tax]);
            $this->assertSame(1, SubscriptionInvoiceLine::count());
            $s = InstitutionModuleSubscription::where('module_key', 'expenses')->sole();
            $this->assertSame(['monthly', '2027-01-02'], [$s->billing_cycle, $s->current_period_end->toDateString()]);
        });

        // fees added on 2026-12-17 joins the expenses month: 16 of 31 days of 600 = 309.68 (half up)
        $this->travelTo('2026-12-17 10:00:00');
        Tenancy::as($i, fn () => InstitutionModuleSubscription::where('module_key', 'fees')->update(['trial_ends_at' => now()->subDay()]));
        $q = $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'fees', 'billing_cycle' => 'monthly']]])->assertOk()->json('data');
        $this->assertSame([16, '309.68', '2027-01-02'], [$q['lines'][0]['days'], $q['total'], substr($q['lines'][0]['period_end'], 0, 10)]);

        // a companion must be paid or bought together: cashbook needs expenses (paid) - fine; quiz needs question_bank - refused
        $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'cashbook', 'billing_cycle' => 'monthly']]])->assertOk();
        $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'quiz', 'billing_cycle' => 'monthly']]])->assertStatus(422)->assertJsonPath('error', 'module_requires');
        $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'quiz', 'billing_cycle' => 'monthly'], ['module_key' => 'question_bank', 'billing_cycle' => 'monthly']]])->assertOk();
        $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'students', 'billing_cycle' => 'monthly']]])->assertStatus(422)->assertJsonPath('error', 'module_not_billable');

        // a cancelled bKash payment records nothing
        [, $back] = $this->pay($i, $admin, [['module_key' => 'fees', 'billing_cycle' => 'monthly']], 'cancel');
        $back->assertRedirect('http://' . $host . '/admin/subscription?payment=cancelled');
        $this->assertSame(1, Tenancy::as($i, fn () => SubscriptionInvoice::count()));
        $this->api('GET', $host, 'subscription/invoices', $admin)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.lines.0.module_key', 'expenses');
    }

    public function test_remove_from_next_period_without_refund(): void
    {
        $i = $this->makeInstitution('bill-cancel');
        $admin = $this->makeUser($i, 'admin');
        $this->pay($i, $admin, [['module_key' => 'expenses', 'billing_cycle' => 'monthly']]);
        $this->api('POST', $this->hostOf($i), 'subscription/modules/cancel', $admin, ['module_key' => 'expenses'])->assertOk();
        $this->travelTo('2027-01-01 10:00:00');
        $this->assertSame('active', app(ModuleEntitlementService::class)->state($i, 'expenses'));     // the paid month runs out
        $this->travelTo('2027-01-03 10:00:00');
        $this->assertSame('read_only', app(ModuleEntitlementService::class)->state($i, 'expenses'));  // no grace after removal
        $this->assertSame(0, Tenancy::as($i, fn () => Payment::where('status', 'refunded')->count()));
        $this->api('GET', $this->hostOf($i), 'subscription/modules', $admin)->assertOk()->assertJsonFragment(['module_key' => 'expenses', 'state' => 'read_only']);
    }

    public function test_coupons_rules_discount_and_full_cover(): void
    {
        $sa = $this->superAdmin();
        $central = 'admin.' . config('tenancy.base_domain');
        $make = fn (array $f) => $this->api('POST', $central, 'super/coupons', $sa, $f + ['valid_until' => '2027-02-02', 'discount_months' => 3]);
        $make(['code' => 'bad', 'value' => '150'])->assertStatus(422);
        $make(['code' => 'X1', 'value' => '10', 'valid_until' => '2026-01-01'])->assertStatus(422);
        $c25 = $make(['code' => 'hello25', 'value' => '25', 'applies_to_modules' => ['expenses'], 'max_redemptions' => 2])->assertCreated()->assertJsonPath('data.code', 'HELLO25')->json('data.id');
        $make(['code' => 'HELLO25', 'value' => '5'])->assertStatus(422);
        $make(['code' => 'COACH50', 'value' => '50', 'applies_to_types' => ['coaching']])->assertCreated();
        $make(['code' => 'FREE100', 'value' => '100'])->assertCreated();

        $i = $this->makeInstitution('bill-coupon');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $this->api('POST', $host, 'subscription/coupon', $admin, ['code' => 'NOPE'])->assertStatus(422)->assertJsonPath('error', 'coupon_invalid');
        $this->api('POST', $host, 'subscription/coupon', $admin, ['code' => 'coach50'])->assertStatus(422);       // school, coupon for coaching
        $this->api('PATCH', $central, "super/coupons/{$c25}/status", $sa, ['status' => 'paused'])->assertOk();
        $this->api('POST', $host, 'subscription/coupon', $admin, ['code' => 'hello25'])->assertStatus(422);       // paused
        $this->api('PATCH', $central, "super/coupons/{$c25}/status", $sa, ['status' => 'active'])->assertOk();
        $this->api('POST', $host, 'subscription/coupon', $admin, ['code' => 'hello25'])->assertOk()->assertJsonPath('data.until', '2027-02-02T10:00:00+06:00');
        $this->api('POST', $host, 'subscription/coupon', $admin, ['code' => 'FREE100'])->assertStatus(422);      // one coupon at a time

        $q = $this->api('POST', $host, 'subscription/quote', $admin, ['items' => [['module_key' => 'expenses', 'billing_cycle' => 'monthly'], ['module_key' => 'fees', 'billing_cycle' => 'monthly']]])->json('data');
        $this->assertSame(['900.00', '75.00', '825.00'], [$q['subtotal'], $q['discount'], $q['total']]);          // 25% of expenses only
        [$ref] = $this->pay($i, $admin, [['module_key' => 'expenses', 'billing_cycle' => 'monthly'], ['module_key' => 'fees', 'billing_cycle' => 'monthly']]);
        Tenancy::as($i, function () use ($c25) {
            $this->assertSame(['75.00', $c25], [SubscriptionInvoice::sole()->discount, (int) SubscriptionInvoice::sole()->coupon_id]);
            $this->assertSame('75.00', CouponRedemption::whereNotNull('invoice_id')->sole()->discount_amount);
        });

        // after 3 months the discount ends; the per-institution limit stops a second redemption
        $this->travelTo('2027-02-03 10:00:00');
        $this->api('POST', $host, 'subscription/coupon', $admin, ['code' => 'hello25'])->assertStatus(422);

        // a 100% coupon on another institution: recorded at once without bKash; no coupon and no price -> nothing to pay
        $this->travelTo('2026-11-02 10:00:00');
        $j = $this->makeInstitution('bill-free');
        $ja = $this->makeUser($j, 'admin');
        $this->api('POST', $this->hostOf($j), 'subscription/checkout', $ja, ['items' => [['module_key' => 'inventory', 'billing_cycle' => 'monthly']]])->assertStatus(422)->assertJsonPath('error', 'nothing_to_pay');
        $this->api('POST', $this->hostOf($j), 'subscription/coupon', $ja, ['code' => 'FREE100'])->assertOk();
        $this->api('POST', $this->hostOf($j), 'subscription/checkout', $ja, ['items' => [['module_key' => 'expenses', 'billing_cycle' => 'yearly']]])->assertOk()->assertJsonPath('data.paid', true)->assertJsonPath('data.total', '0.00');
        Tenancy::as($j, fn () => $this->assertSame(['coupon', '0.00'], [Payment::sole()->method, Payment::sole()->amount]));

        $rows = collect($this->api('GET', $central, 'super/coupons', $sa)->assertOk()->json('data'))->keyBy('code');
        $this->assertSame([1, '75.00'], [$rows['HELLO25']['redeemed_count'], $rows['HELLO25']['discount_given']]);
        $this->assertSame(1, Coupon::where('code', 'FREE100')->value('redeemed_count'));
    }
}
