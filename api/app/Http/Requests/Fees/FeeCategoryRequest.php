<?php

namespace App\Http\Requests\Fees;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /fees/categories, PUT /fees/categories/{id} (admin). Amounts are decimal (G9), never float.
class FeeCategoryRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $id = $this->route('id');
        $unique = Rule::unique('fee_categories', 'name')->where('institution_id', Tenancy::current()->id);
        return [
            'name'          => ['required', 'string', 'max:100', $id ? $unique->ignore($id) : $unique],
            'amount'        => ['required', 'decimal:0,2', 'min:0', 'max:9999999'],
            'frequency'     => 'required|in:monthly,yearly,once',
            'applicable_to' => 'nullable|in:all,program_specific',
        ];
    }
}
