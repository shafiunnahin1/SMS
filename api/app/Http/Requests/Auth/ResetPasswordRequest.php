<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

// The password policy needs the user, so PasswordResetController::reset applies PolicyPassword after finding them.
class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'login'    => ['required', 'string', 'max:100'],
            'token'    => ['required', 'string', 'max:100'],
            'password' => ['required', 'string', 'max:255', 'confirmed'],
        ];
    }
}
