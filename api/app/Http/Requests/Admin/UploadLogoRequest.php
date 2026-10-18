<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

// PNG / JPG / WebP up to 1 MB (docs/THEMING.md "Logo & Favicon"). SVG is not accepted: it can carry script.
class UploadLogoRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return ['logo' => ['required', 'file', 'image', 'mimes:png,jpg,jpeg,webp', 'max:1024']];
    }
}
