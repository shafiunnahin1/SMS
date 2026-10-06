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
        ];
    }
}
