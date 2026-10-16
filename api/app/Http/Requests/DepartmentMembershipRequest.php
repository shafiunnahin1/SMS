<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DepartmentMembershipRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()?->role === 'admin' && $this->user()->is_active; }
    public function rules(): array
    {
        if ($this->route()->getActionMethod() === 'assignDuties') return ['duty_ids' => 'present|array', 'duty_ids.*' => 'required|integer|min:1|distinct'];
        $rules = ['starts_at' => 'sometimes|nullable|date_format:Y-m-d', 'ends_at' => 'sometimes|nullable|date_format:Y-m-d'];
        if ($this->isMethod('POST')) $rules['user_id'] = 'required|integer|min:1';
        else $rules['status'] = 'sometimes|required|in:active,inactive,ended';
        return $rules;
    }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $allowed = array_filter(array_keys($this->rules()), fn ($key) => !str_contains($key, '.'));
            if (array_diff(array_keys($this->all()), $allowed)) $v->errors()->add('request', __('errors.validation_failed'));
            if (is_array($this->input('duty_ids')) && !array_is_list($this->input('duty_ids'))) $v->errors()->add('duty_ids', __('errors.validation_failed'));
        });
    }
}
