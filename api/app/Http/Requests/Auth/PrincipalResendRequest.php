<?php
namespace App\Http\Requests\Auth;

class PrincipalResendRequest extends PrincipalActivationRequest
{
    public function rules(): array
    {
        return ['public_id' => 'required|uuid', 'contact' => 'required|array:channel,value',
            'contact.channel' => 'required|in:phone,email', 'contact.value' => 'required|string|max:100'];
    }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            if (array_diff(array_keys($this->all()), ['public_id', 'contact'])) $v->errors()->add('request', __('errors.activation_invalid'));
        });
    }
}
