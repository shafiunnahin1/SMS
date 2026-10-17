<?php
namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class PrincipalActivationRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        return ['public_id' => 'required|uuid', 'code' => 'required|string|digits:'.config('auth_policy.otp.length'),
            'password' => 'sometimes|required|string|max:255|confirmed', 'password_confirmation' => 'required_with:password|string|max:255'];
    }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            if (array_diff(array_keys($this->all()), ['public_id', 'code', 'password', 'password_confirmation'])) $v->errors()->add('request', __('errors.activation_invalid'));
        });
    }
}
