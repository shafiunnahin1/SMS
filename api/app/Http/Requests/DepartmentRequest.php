<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DepartmentRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()?->role === 'admin' && $this->user()->is_active; }

    public function rules(): array
    {
        if ($this->route()->getActionMethod() === 'archive') return [];
        return ['name' => ($this->isMethod('POST') ? 'required' : 'sometimes|required').'|string|max:120',
            'code' => 'sometimes|nullable|string|max:40', 'description' => 'sometimes|nullable|string|max:500'];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $allowed = $this->route()->getActionMethod() === 'archive' ? [] : ['name', 'code', 'description'];
            if (array_diff(array_keys($this->all()), $allowed)) $v->errors()->add('request', __('errors.validation_failed'));
        });
    }
}
