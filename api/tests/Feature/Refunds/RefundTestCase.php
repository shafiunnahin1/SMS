<?php

namespace Tests\Feature\Refunds;

use App\Models\{FeePayment, FeeRefund};
use App\Support\Tenancy;
use Illuminate\Support\Str;
use Tests\Feature\CashBook\CashBookTestCase;

abstract class RefundTestCase extends CashBookTestCase
{
    protected function payload(FeePayment $line, string $amount = '40.00', array $changes = []): array
    {
        return array_replace(['request_key' => (string) Str::uuid(), 'student_id' => $line->student_id,
            'original_receipt_no' => $line->receipt_no, 'refund_lines' => [['fee_payment_id' => $line->id, 'amount' => $amount]],
            'reason' => 'Correction', 'method' => 'cash'], $changes);
    }
    protected function requestRefund($i, $user, array $input): int
    {
        return $this->api('POST', $this->hostOf($i), 'fee-refunds', $user, $input)->assertCreated()->json('data.id');
    }
    protected function move($i, $user, int $id, string $action)
    {
        return $this->api('POST', $this->hostOf($i), "fee-refunds/{$id}/{$action}", $user);
    }
    protected function process($i, $user, int $id)
    {
        $this->move($i, $user, $id, 'approve')->assertOk();
        return $this->move($i, $user, $id, 'process')->assertOk();
    }
    protected function snapshots($i, int $id)
    {
        return Tenancy::as($i, function () use ($id) {
            $key = FeeRefund::findOrFail($id)->request_key;
            return FeeRefund::where('request_key', $key)->orderBy('revision')->get();
        });
    }
}
