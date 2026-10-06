<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// Release 1 ships bn and en; ar and the institution's enabled-language list arrive with Step 3.7 (docs/I18N.md)
class LocaleRequest extends FormRequest
{
    public const R1_LOCALES = ['bn', 'en'];

    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return ['locale' => ['required', 'string', Rule::in(self::R1_LOCALES)]];
    }
}
