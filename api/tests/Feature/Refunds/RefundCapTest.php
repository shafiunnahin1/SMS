<?php

namespace Tests\Feature\Refunds;

use App\Models\{FeePayment, FeeRefund};
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Support\Str;

class RefundCapTest extends RefundTestCase
{
    public function test_partial_refunds_cannot_exceed_remaining_payment_and_pending_requests_do_not_reserve_it(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        $a = $this->requestRefund($i, $admin, $this->payload($line, '80.00'));
        $b = $this->requestRefund($i, $admin, $this->payload($line, '80.00'));
        $this->move($i, $admin, $b, 'approve')->assertOk();
        $this->process($i, $admin, $a)->assertJsonPath('data.status', 'processed');
        $this->move($i, $admin, $b, 'process')->assertUnprocessable();
        $this->assertSame('approved', $this->snapshots($i, $b)->last()->status);
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($line, '20.01'))->assertUnprocessable();
        $c = $this->requestRefund($i, $admin, $this->payload($line, '20.00')); $this->process($i, $admin, $c);
        $this->api('GET', $this->hostOf($i), 'fee-refunds/refundable?receipt_no=' . $line->receipt_no, $admin)
            ->assertOk()->assertJsonPath('data.0.refundable_amount', '0.00');
        Tenancy::as($i, fn () => $this->assertSame(2, FeePayment::whereNotNull('reverses_id')->count()));
    }

    public function test_invalid_amounts_duplicate_waived_and_wrong_receipt_lines_are_rejected(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        foreach (['0', '-1', '1.001', '1e2', '100.01', '999999999.00'] as $amount) {
            $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($line, $amount))->assertUnprocessable();
        }
        $input = $this->payload($line); $input['refund_lines'][] = $input['refund_lines'][0];
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $input)->assertUnprocessable();
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($line, '1.00', ['original_receipt_no' => 'WRONG']))->assertUnprocessable();
        $waived = Tenancy::as($i, fn () => FeePayment::create(['student_id' => $line->student_id,
            'fee_category_id' => $line->fee_category_id, 'amount' => '100.00', 'paid_amount' => '0.00',
            'status' => 'waived', 'receipt_no' => 'WAIVED', 'paid_at' => now()]));
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($waived, '1.00'))->assertUnprocessable();
        $this->api('GET', $this->hostOf($i), 'fee-refunds/refundable', $admin)->assertUnprocessable();
        Tenancy::as($i, fn () => $this->assertSame(0, FeeRefund::count()));
    }

    public function test_other_tenant_lines_requests_and_students_are_not_accessible(): void
    {
        [$i, $admin] = $this->tenant('refund-a'); [$other, $otherAdmin] = $this->tenant('refund-b');
        $line = $this->fee($i, '100.00'); $foreign = $this->fee($other, '100.00');
        $id = $this->requestRefund($i, $admin, $this->payload($line));
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($foreign))->assertNotFound();
        $this->api('GET', $this->hostOf($other), "fee-refunds/{$id}", $otherAdmin)->assertNotFound();
        foreach (['approve', 'reject', 'process'] as $action) $this->move($other, $otherAdmin, $id, $action)->assertNotFound();
        $this->api('GET', $this->hostOf($other), 'fee-refunds', $otherAdmin)->assertOk()->assertJsonCount(0, 'data');
        Tenancy::as($i, function () use ($foreign) {
            try {
                FeeRefund::create(['student_id' => $foreign->student_id, 'request_key' => (string) Str::uuid(),
                    'revision' => 1, 'original_receipt_no' => 'foreign', 'amount' => '1.00', 'refund_lines' => [], 'reason' => 'fixture']);
                $this->fail('cross-tenant student FK was accepted');
            } catch (QueryException $error) { $this->assertSame('23000', (string) $error->getCode()); }
        });
    }

    public function test_authentication_and_release_module_gate_cannot_be_bypassed(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        $this->api('GET', $this->hostOf($i), 'fee-refunds')->assertUnauthorized();
        $super = $this->makeUser(null, 'super_admin');
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $super, $this->payload($line))->assertForbidden();
        config(['release.modules' => array_values(array_diff(config('release.modules'), ['fees']))]);
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($line))->assertForbidden();
        Tenancy::as($i, fn () => $this->assertSame(0, FeeRefund::count()));
    }
}
