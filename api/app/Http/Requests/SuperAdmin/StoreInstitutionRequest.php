<?php

namespace App\Http\Requests\SuperAdmin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// D55: the Super Admin opens an institution together with its first admin user (panels-and-features.md "New Institution")
class StoreInstitutionRequest extends FormRequest
{
    protected function principalKey(): string { return 'admin'; }
    protected function isPublic(): bool { return false; }
    public function authorize(): bool
    {
        return $this->isPublic() || ($this->user()?->role === 'super_admin' && $this->user()->institution_id === null && $this->user()->is_active);
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('slug'))) $this->merge(['slug' => strtolower(trim($this->input('slug')))]);
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            if (array_diff(array_keys($this->all()), ['name', 'slug', 'institution_type', 'phone', 'email', 'address', $this->principalKey()])) {
                $v->errors()->add('request', __('errors.activation_invalid'));
            }
        });
    }

    public function rules(): array
    {
        $key = $this->principalKey();
        $rules = [
            'name'             => ['required', 'string', 'max:150'],
            'slug'             => ['required', 'string', 'min:3', 'max:50', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', Rule::notIn(config('tenancy.reserved_slugs')), 'unique:institutions,slug'],
            'institution_type' => ['required', Rule::in(['school', 'college', 'coaching', 'private_batch'])],
            'phone'            => ['nullable', 'string', 'max:20'],
            'email'            => ['nullable', 'email', 'max:100'],
            'address'          => ['nullable', 'string', 'max:500'],
            $key => ['required', $this->isPublic() ? 'array:name,contact,password,password_confirmation' : 'array:name,contact'],
            "$key.name" => ['required', 'string', 'max:100'],
            "$key.contact" => ['required', 'array:channel,value'],
            "$key.contact.channel" => ['required', 'in:phone,email'],
            "$key.contact.value" => ['required', 'string', 'max:100'],
        ];
        if ($this->isPublic()) {
            $rules["$key.password"] = ['required', 'string', 'max:255', 'confirmed'];
            $rules["$key.password_confirmation"] = ['required', 'string', 'max:255'];
        }
        return $rules;
    }
}
