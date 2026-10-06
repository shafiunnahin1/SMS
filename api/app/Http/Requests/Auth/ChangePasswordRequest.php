<?php

namespace App\Http\Requests\Auth;

use App\Rules\PolicyPassword;
use Illuminate\Foundation\Http\FormRequest;

class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'current_password:sanctum'],
            'password'         => ['required', 'string', 'max:255', 'confirmed', 'different:current_password', new PolicyPassword($this->user())],
        ];
    }
}
