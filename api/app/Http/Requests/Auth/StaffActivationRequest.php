<?php
namespace App\Http\Requests\Auth;

class StaffActivationRequest extends PrincipalActivationRequest
{
    public function rules(): array
    {
        return array_replace(parent::rules(), ['password' => 'required|string|max:255|confirmed', 'password_confirmation' => 'required|string|max:255']);
    }
}
