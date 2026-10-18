<?php

namespace App\Http\Requests\Fees;

use App\Support\Money;
use Illuminate\Foundation\Http\FormRequest;

class FeeRefundRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        return ['request_key' => ['required', 'uuid'], 'student_id' => ['required', 'integer', 'min:1'],
            'original_receipt_no' => ['required', 'string', 'max:50'], 'reason' => ['required', 'string', 'max:255'],
            'method' => ['required', 'in:cash,bank,bkash,nagad'], 'refund_lines' => ['required', 'array', 'min:1', 'max:255'],
            'refund_lines.*.fee_payment_id' => ['required', 'integer', 'min:1', 'distinct'],
            'refund_lines.*.amount' => ['required', function ($attribute, $value, $fail) {
                if ((!is_string($value) && !is_int($value)) || !preg_match('/^\d{1,8}(\.\d{1,2})?$/', (string) $value) || Money::toPaisa($value) <= 0) {
                    $fail(__('refund.amount'));
                }
            }], 'online_payment_id' => ['prohibited'], 'gateway_refund_ref' => ['prohibited'],
            'institution_id' => ['prohibited'], 'amount' => ['prohibited'], 'revision' => ['prohibited'], 'status' => ['prohibited'],
            'requested_by' => ['prohibited'], 'approved_by' => ['prohibited'], 'processed_by' => ['prohibited'],
            'processed_at' => ['prohibited'], 'reversal_receipt_no' => ['prohibited']];
    }
}
