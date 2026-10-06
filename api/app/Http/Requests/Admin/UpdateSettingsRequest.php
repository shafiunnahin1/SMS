<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

// PUT /settings - the institution's own profile. slug and institution_type are not editable here (slug: custom-domain spec; type: Super Admin only).
class UpdateSettingsRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'    => ['sometimes', 'required', 'string', 'max:150'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'phone'   => ['sometimes', 'nullable', 'string', 'max:20', 'regex:/^[0-9+\-\s]{6,20}$/'],
            'email'   => ['sometimes', 'nullable', 'email', 'max:100'],
        ];
    }
}
