<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class VerifyOtpRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return ['challenge' => ['required', 'string', 'max:1000'], 'otp' => ['required', 'string', 'regex:/^\d{4,8}$/']];
    }
}
