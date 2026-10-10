<?php

namespace App\Http\Requests\SuperAdmin;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// D55: the Super Admin opens an institution together with its first admin user (panels-and-features.md "New Institution")
class StoreInstitutionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        $this->merge(['slug' => strtolower(trim((string) $this->input('slug'))),
            'admin' => array_merge((array) $this->input('admin', []), ['phone' => User::normalisePhone($this->input('admin.phone'))])]);
    }

    public function rules(): array
    {
        return [
            'name'             => ['required', 'string', 'max:150'],
            'slug'             => ['required', 'string', 'min:3', 'max:50', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', Rule::notIn(config('tenancy.reserved_slugs')), 'unique:institutions,slug'],
            'institution_type' => ['required', Rule::in(['school', 'college', 'coaching', 'private_batch'])],
            'phone'            => ['nullable', 'string', 'max:20'],
            'email'            => ['nullable', 'email', 'max:100'],
            'address'          => ['nullable', 'string', 'max:500'],
            'admin'            => ['required', 'array'],
            'admin.name'       => ['required', 'string', 'max:100'],
            'admin.phone'      => ['required', 'regex:/^01[3-9]\d{8}$/'],
            'admin.email'      => ['nullable', 'email', 'max:100'],
            'admin.password'   => ['required', 'string', 'min:8', 'max:100'],
        ];
    }
}
