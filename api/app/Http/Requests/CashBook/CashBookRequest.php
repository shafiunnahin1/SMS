<?php

namespace App\Http\Requests\CashBook;

use App\Support\Money;
use Illuminate\Foundation\Http\FormRequest;

class CashBookRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    protected function prepareForValidation(): void
    {
        // Route parameters cannot be overridden by a request payload.
        $this->merge(['date' => $this->route('date') ?? $this->input('date', now()->toDateString())]);
    }
    public function rules(): array
    {
        $decimal = function ($attribute, $value, $fail) {
            if ((!is_string($value) && !is_int($value)) || !preg_match('/^\d{1,10}(\.\d{1,2})?$/', (string) $value) || Money::toPaisa($value) < 0) {
                $fail(__('errors.cashbook_amount'));
            }
        };
        $close = $this->isMethod('POST') && str_ends_with($this->path(), '/close');
        $reopen = $this->isMethod('POST') && str_ends_with($this->path(), '/reopen');
        $range = str_ends_with($this->path(), '/range');
        return ['date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'from' => [$range ? 'required' : 'sometimes', 'date_format:Y-m-d', 'before_or_equal:today'],
            'to' => [$range ? 'required' : 'sometimes', 'date_format:Y-m-d', 'after_or_equal:from', 'before_or_equal:today'],
            'opening_cash' => ['sometimes', $decimal], 'counted_cash' => [$close ? 'required' : 'sometimes', $decimal],
            'note' => ['nullable', 'string', 'max:255'], 'reason' => [$reopen ? 'required' : 'sometimes', 'string', 'max:255'],
            'institution_id' => ['prohibited'], 'revision' => ['prohibited'], 'status' => ['prohibited'],
            'cash_in' => ['prohibited'], 'cash_out' => ['prohibited'], 'expected_closing' => ['prohibited'],
            'difference' => ['prohibited'], 'closed_by' => ['prohibited'], 'reopened_by' => ['prohibited']];
    }
}
