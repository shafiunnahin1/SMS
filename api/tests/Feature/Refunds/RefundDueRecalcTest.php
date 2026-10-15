<?php

namespace Tests\Feature\Refunds;

use App\Models\FeePayment;
use App\Services\FeeService;
use App\Support\Tenancy;

class RefundDueRecalcTest extends RefundTestCase
{
    public function test_negative_reversal_restores_exact_dues_without_changing_original_receipt(): void
    {
        [$i, $admin] = $this->tenant(); $student = $this->studentWithDues($i);
        $key = Tenancy::as($i, fn () => app(FeeService::class)->dueLines($student)->first()['key']);
        $this->api('POST', $this->hostOf($i), 'fees/collect', $admin, ['student_id' => $student->id,
            'lines' => [['key' => $key]], 'payment_method' => 'cash'])->assertCreated();
        $line = Tenancy::as($i, fn () => FeePayment::first()); $before = $line->getAttributes();
        $id = $this->requestRefund($i, $admin, $this->payload($line, '40.01')); $result = $this->process($i, $admin, $id);
        $this->api('GET', $this->hostOf($i), 'fees/dues?student_id=' . $student->id, $admin)
            ->assertOk()->assertJsonPath('data.total', '40.01');
        Tenancy::as($i, function () use ($line, $before) {
            $this->assertSame($before, $line->fresh()->getAttributes());
            $negative = FeePayment::where('reverses_id', $line->id)->firstOrFail();
            $this->assertSame('-40.01', $negative->paid_amount);
            $this->assertSame($line->enrollment_id, $negative->enrollment_id);
            $this->assertSame($line->month, $negative->month);
        });
        $this->api('GET', $this->hostOf($i), 'fees/receipt/' . $result->json('data.receipt_id') . '?format=json', $admin)
            ->assertOk()->assertJsonPath('data.is_refund', true)->assertJsonPath('data.original_receipt_no', $line->receipt_no);
        $this->api('GET', $this->hostOf($i), 'fees/receipt/' . $line->id . '?format=json', $admin)
            ->assertOk()->assertJsonPath('data.refunded_amount', '40.01');
        $pdf = $this->api('GET', $this->hostOf($i), 'fees/receipt/' . $result->json('data.receipt_id'), $admin)
            ->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $pdf->getContent());
    }
}
