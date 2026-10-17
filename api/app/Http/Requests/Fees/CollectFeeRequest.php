<?php

namespace App\Http\Requests\Fees;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /fees/collect { student_id, lines:[{key, paid_amount?}], payment_method } (docs/API.md "Fee collection").
// The amounts are checked against the server's own dues in FeeService::collect - the client never sets what is owed.
class CollectFeeRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'student_id'          => ['required', 'integer', Rule::exists('students', 'id')->where('institution_id', Tenancy::current()->id)->whereNull('deleted_at')],
            'lines'               => 'required|array|min:1|max:50',
            'lines.*.key'         => ['required', 'string', 'distinct', 'regex:/^\d+:\d+:(?:\d{4}-\d{2}|\d{4}|once)$/'],
            'lines.*.paid_amount' => 'nullable|numeric|min:0.01|max:9999999',
            'payment_method'      => 'required|in:cash,bkash,nagad,card,bank_transfer,cheque',   // fees-advanced.md list; online gateways use their own flow
        ];
    }
}
