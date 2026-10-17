<?php

namespace App\Http\Requests\Inventory;

use App\Models\InventoryItem;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class InventoryItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        if ($this->route('id')) InventoryItem::findOrFail($this->route('id'));
        return true;
    }

    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';
        $amount = ['sometimes', 'regex:/^\d{1,8}(\.\d{1,2})?$/'];
        return [
            // code is unique per institution; soft-deleted items keep their code (the database key covers them too)
            'code' => [$required, 'string', 'max:30', Rule::unique('inventory_items', 'code')
                ->where('institution_id', \App\Support\Tenancy::current()->id)->ignore($this->route('id'))],
            'name' => [$required, 'string', 'max:120'], 'category' => ['nullable', 'string', 'max:60'], 'unit' => ['sometimes', 'string', 'max:20'],
            'sale_price' => $amount, 'reorder_level' => ['sometimes', 'regex:/^\d{1,10}(\.\d{1,2})?$/'],
            'is_sellable' => ['sometimes', 'boolean'], 'is_active' => ['sometimes', 'boolean'],
            'stock' => ['prohibited'], 'avg_cost' => ['prohibited'], 'institution_id' => ['prohibited'],
        ];
    }
}
