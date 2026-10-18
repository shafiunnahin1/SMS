<?php

namespace App\Http\Requests\Admin;

use App\Services\InstitutionSettings;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// docs/I18N.md: bn can never be switched off; default and sms_locale must be enabled languages
class UpdateLanguageRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $enabled = (array) $this->input('enabled', []);
        return [
            'enabled'    => ['required', 'array', 'min:1'],
            'enabled.*'  => ['distinct', Rule::in(InstitutionSettings::LOCALES)],
            'default'    => ['required', Rule::in($enabled)],
            'sms_locale' => ['nullable', Rule::in($enabled)],
        ];
    }

    public function after(): array
    {
        return [fn ($v) => in_array('bn', (array) $this->input('enabled', []), true) ? null : $v->errors()->add('enabled', __('errors.bn_required'))];
    }
}
