<?php

namespace App\Http\Requests\Inventory;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class InventoryMovementRequest extends FormRequest
{
    public function authorize(): bool
    {
        abort_unless(array_key_exists($this->route('type'), \App\Services\InventoryService::DIRECTIONS), 404);
        return true;
    }

    public function rules(): array
    {
        $type = $this->route('type');
        // only an adjustment may carry a sign (count difference); every other quantity is positive
        $qty = $type === 'adjust' ? '/^-?\d{1,10}(\.\d{1,2})?$/' : '/^\d{1,10}(\.\d{1,2})?$/';
        return [
            'item_id' => ['required', 'integer'], 'qty' => ['required', 'regex:' . $qty],
            'unit_amount' => [$type === 'receive' ? 'required' : 'sometimes', 'regex:/^\d{1,8}(\.\d{1,2})?$/'],
            'payment_method' => ['sometimes', 'nullable', Rule::in(['cash', 'bank', 'bkash', 'nagad', 'rocket', 'other'])],
            'issued_to_type' => [$type === 'issue' ? 'required' : 'prohibited', Rule::in(['student', 'teacher', 'staff', 'department'])],
            'issued_to_id' => ['sometimes', 'nullable', 'integer'], 'student_id' => ['sometimes', 'nullable', 'integer'],
            'supplier' => ['sometimes', 'nullable', 'string', 'max:100'], 'reference' => ['sometimes', 'nullable', 'string', 'max:100'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
            'direction' => ['prohibited'], 'balance_after' => ['prohibited'], 'total_amount' => ['prohibited'], 'receipt_no' => ['prohibited'],
            'created_by' => ['prohibited'], 'institution_id' => ['prohibited'],
        ];
    }
}
