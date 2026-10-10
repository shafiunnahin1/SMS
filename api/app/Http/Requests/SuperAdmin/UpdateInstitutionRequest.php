<?php

namespace App\Http\Requests\SuperAdmin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// Profile, type and the per-institution module overrides (true = on, false = off, null = back to the type's default).
// Only modules this build ships can be overridden (ModuleGate's release gate wins anyway).
class UpdateInstitutionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'              => ['sometimes', 'string', 'max:150'],
            'institution_type'  => ['sometimes', Rule::in(['school', 'college', 'coaching', 'private_batch'])],
            'phone'             => ['sometimes', 'nullable', 'string', 'max:20'],
            'email'             => ['sometimes', 'nullable', 'email', 'max:100'],
            'address'           => ['sometimes', 'nullable', 'string', 'max:500'],
            'modules'           => ['sometimes', 'array'],
            'modules.*'         => ['nullable', 'boolean'],
        ];
    }

    public function after(): array
    {
        return [function ($v) {
            foreach (array_keys((array) $this->input('modules', [])) as $m) {
                if (!in_array($m, config('release.modules'), true)) $v->errors()->add("modules.{$m}", __('errors.module_not_available'));
            }
        }];
    }
}
