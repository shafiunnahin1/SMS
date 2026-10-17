<?php

namespace App\Http\Requests\Expenses;

use Illuminate\Foundation\Http\FormRequest;

class ExpenseQueryRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        $to = ['sometimes', 'date_format:Y-m-d'];
        if ($this->filled('from')) $to[] = 'after_or_equal:from';
        return ['category' => ['sometimes', 'string', 'max:100'], 'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => $to, 'month' => ['sometimes', 'date_format:Y-m'],
            'format' => ['sometimes', 'in:json,pdf,xlsx'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:100']];
    }
}
