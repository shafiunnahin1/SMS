<?php

namespace App\Http\Requests\Expenses;

use App\Models\Expense;
use App\Support\Money;
use Illuminate\Foundation\Http\FormRequest;

class ExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        if ($this->route('id')) Expense::findOrFail($this->route('id'));
        return true;
    }

    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';
        return [
            'category' => [$required, 'string', 'max:100'], 'title' => [$required, 'string', 'max:150'],
            'amount' => [$required, function ($attribute, $value, $fail) {
                if ((!is_string($value) && !is_int($value)) || !preg_match('/^\d{1,8}(\.\d{1,2})?$/', (string) $value) || Money::toPaisa($value) <= 0) {
                    $fail(__('errors.expense_amount'));
                }
            }],
            'expense_date' => [$required, 'date_format:Y-m-d'], 'payment_method' => ['sometimes', 'string', 'max:30'],
            'note' => ['nullable', 'string', function ($attribute, $value, $fail) {
                if (is_string($value) && strlen($value) > 65535) $fail(__('validation.max.string', ['attribute' => $attribute, 'max' => 65535]));
            }], 'receipt' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:5120'],
            'institution_id' => ['prohibited'], 'source' => ['prohibited'], 'added_by' => ['prohibited'],
            'receipt_path' => ['prohibited'], 'reversal_of_id' => ['prohibited'], 'replaces_expense_id' => ['prohibited'],
            'payroll_run_id' => ['prohibited'], 'fund_id' => ['sometimes', 'nullable', 'integer', 'min:1'],   // R3.11: spending from a donation fund (donations.md §2.3)
        ];
    }
}
