<?php

namespace App\Http\Requests\Fees;

use Illuminate\Foundation\Http\FormRequest;

class FeeRefundQueryRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        return ['receipt_no' => [$this->route()?->getActionMethod() === 'refundable' ? 'required' : 'sometimes', 'string', 'max:50'],
            'student_id' => ['sometimes', 'integer', 'min:1'], 'status' => ['sometimes', 'in:requested,approved,rejected,processed'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']];
    }
}
