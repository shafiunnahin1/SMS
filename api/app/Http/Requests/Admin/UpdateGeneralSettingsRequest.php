<?php

namespace App\Http\Requests\Admin;

use App\Services\InstitutionSettings;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGeneralSettingsRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'fee_proration'  => ['sometimes', 'required', Rule::in(InstitutionSettings::FEE_PRORATION)],
            'use_programs'   => ['sometimes', 'required', 'boolean'],
            'student_portal' => ['sometimes', 'required', 'boolean'],
            'use_gpa'        => ['sometimes', 'required', 'boolean'],
            // D197 AAD.1: the dues block (academics-advanced.md section 2)
            'fees'                          => ['sometimes', 'array:block_admit_card,block_result,block_threshold,block_message'],
            'fees.block_admit_card'         => ['required_with:fees', 'boolean'],
            'fees.block_result'             => ['required_with:fees', 'boolean'],
            'fees.block_threshold'          => ['required_with:fees', 'array:mode,value'],
            'fees.block_threshold.mode'     => ['required_with:fees', Rule::in(['amount', 'months', 'any'])],
            'fees.block_threshold.value'    => ['nullable', 'required_if:fees.block_threshold.mode,amount,months', 'regex:/^\d{1,8}(\.\d{1,2})?$/'],
            'fees.block_message'            => ['nullable', 'string', 'max:255'],
        ];
    }
}
