<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

// Release 1: brand colours and mode only (tokens/layout/pack/preset are the R2 theme editor)
class UpdateThemeRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'primary_color'   => ['sometimes', 'required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['sometimes', 'required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'accent_color'    => ['sometimes', 'required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'theme_mode'      => ['sometimes', 'required', 'in:light,dark,auto'],
        ];
    }
}
