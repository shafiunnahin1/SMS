<?php

namespace App\Http\Requests\Fees;

use Illuminate\Foundation\Http\FormRequest;

class FeeRefundTransitionRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        return ['request_key' => ['prohibited'], 'student_id' => ['prohibited'], 'refund_lines' => ['prohibited'],
            'original_receipt_no' => ['prohibited'], 'amount' => ['prohibited'], 'reason' => ['prohibited'],
            'method' => ['prohibited'], 'institution_id' => ['prohibited'], 'status' => ['prohibited'],
            'revision' => ['prohibited'], 'requested_by' => ['prohibited'], 'approved_by' => ['prohibited'], 'processed_by' => ['prohibited'],
            'processed_at' => ['prohibited'], 'reversal_receipt_no' => ['prohibited'],
            'online_payment_id' => ['prohibited'], 'gateway_refund_ref' => ['prohibited']];
    }
}
