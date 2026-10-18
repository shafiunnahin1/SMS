<?php
namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class StaffAccountRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()?->role === 'admin' && $this->user()->is_active; }
    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $rules = ['name' => ($creating ? 'required' : 'sometimes|required').'|string|max:100',
            'contact' => ($creating ? 'required' : 'sometimes|required').'|array:channel,value',
            'contact.channel' => 'required_with:contact|in:phone,email', 'contact.value' => 'required_with:contact|string|max:100'];
        if (!$creating) $rules['is_active'] = 'sometimes|required|boolean';
        return $rules;
    }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $allowed = $this->isMethod('POST') ? ['name', 'contact'] : ['name', 'contact', 'is_active'];
            if (array_diff(array_keys($this->all()), $allowed)) $v->errors()->add('request', __('errors.activation_invalid'));
        });
    }
}
