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
            'alt_name_locale' => ['sometimes', 'nullable', Rule::in(['ar', 'en'])],   // D214 MAD.3
            'name_alt'       => ['sometimes', 'nullable', 'string', 'max:150'],
            // D214 MAD.4: the grading preset; for `labelled` the ranges (may stay empty) and the labels of the preset's grade codes
            'grading'                => ['sometimes', 'array:preset,rows'],
            'grading.preset'         => ['required_with:grading', Rule::in(['bd_gpa', 'labelled'])],
            'grading.rows'           => ['nullable', 'array', 'max:10'],
            'grading.rows.*.grade'   => ['required', 'string', Rule::in(array_column(config('grading_presets.labelled'), 'grade'))],
            'grading.rows.*.min'     => ['nullable', 'numeric', 'min:0', 'max:100'],
            'grading.rows.*.label'   => ['nullable', 'array:bn,en,ar'],
            'grading.rows.*.label.*' => ['nullable', 'string', 'max:40'],
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
