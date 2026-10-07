<?php

namespace App\Http\Requests\Auth;

use App\Services\InstitutionSettings;
use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// docs/I18N.md section 12: PUT /auth/locale - the language must be one the institution has switched on (else 422)
class LocaleRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $enabled = ($i = Tenancy::current()) ? app(InstitutionSettings::class)->language($i)['enabled'] : config('i18n.platform_locales');
        return ['locale' => ['required', 'string', Rule::in($enabled)]];
    }

    public function messages(): array
    {
        return ['locale.in' => __('errors.locale_not_enabled')];
    }
}
