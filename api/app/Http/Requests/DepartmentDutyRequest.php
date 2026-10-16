<?php
namespace App\Http\Requests;

use App\Support\DepartmentPermissionKeys;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class DepartmentDutyRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()?->role === 'admin' && $this->user()->is_active; }
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes|required';
        $rules = ['code' => $required.'|string|max:40', 'name' => $required.'|string|max:120',
            'description' => 'sometimes|nullable|string|max:500', 'permission_keys' => $required.'|array|min:1|max:150',
            'permission_keys.*' => ['required', 'string', 'distinct:strict', Rule::in(DepartmentPermissionKeys::ALL)]];
        if (!$this->isMethod('POST')) $rules['status'] = 'sometimes|required|in:active,archived';
        return $rules;
    }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $allowed = ['code', 'name', 'description', 'permission_keys'];
            if (!$this->isMethod('POST')) $allowed[] = 'status';
            if (array_diff(array_keys($this->all()), $allowed)) $v->errors()->add('request', __('errors.validation_failed'));
            if (is_array($this->input('permission_keys')) && !array_is_list($this->input('permission_keys'))) $v->errors()->add('permission_keys', __('errors.validation_failed'));
        });
    }
}
