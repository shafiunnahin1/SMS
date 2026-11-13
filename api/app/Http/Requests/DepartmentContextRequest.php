<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DepartmentContextRequest extends FormRequest
{
    public function authorize(): bool { return in_array($this->user()?->role, ['institution_staff', 'teacher'], true) && $this->user()->is_active; }   // D206 TDM.1

    public function rules(): array
    {
        return $this->route()->getActionMethod() === 'index'
            ? ['page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100'] : [];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            if (array_diff(array_keys($this->all()), array_keys($this->rules()))) $v->errors()->add('request', __('errors.validation_failed'));
        });
    }
}
