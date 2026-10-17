<?php

namespace Tests\Feature\Refunds;

use App\Models\{Payment, SubscriptionInvoice};
use App\Support\Tenancy;

class SubscriptionRefundTest extends RefundTestCase
{
    public function test_d55_d84_leave_subscription_refund_route_unavailable_and_money_unchanged(): void
    {
        [$i] = $this->tenant(); $super = $this->makeUser(null, 'super_admin');
        [$payment, $invoice] = Tenancy::as($i, function () {
            $payment = Payment::create(['amount' => '100.00', 'method' => 'cash', 'status' => 'completed']);
            $invoice = SubscriptionInvoice::create(['payment_id' => $payment->id, 'invoice_number' => 'INV-FIXTURE',
                'plan_name' => 'Historical', 'amount' => '100.00', 'total' => '100.00']);
            return [$payment, $invoice];
        });
        $before = Tenancy::as($i, fn () => [$payment->fresh()->getAttributes(), $invoice->fresh()->getAttributes()]);
        $host = 'admin.' . config('tenancy.base_domain');
        $this->api('GET', $host, 'super/institutions', $super)->assertOk();
        $this->api('POST', $host, 'super/payments/' . $payment->id . '/refund', $super,
            ['amount' => '40.00', 'reason' => 'fixture'])->assertNotFound();
        Tenancy::as($i, function () use ($before, $payment, $invoice) {
            $this->assertSame($before, [$payment->fresh()->getAttributes(), $invoice->fresh()->getAttributes()]);
            $this->assertSame(1, Payment::count()); $this->assertSame(1, SubscriptionInvoice::count());
        });
    }
}
