<?php
namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class StaffProfileRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()?->role === 'institution_staff' && $this->user()->is_active; }
    public function rules(): array { return ['name' => 'sometimes|required|string|max:100', 'avatar' => 'sometimes|required|image|mimes:jpeg,png|max:2048']; }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $allowed = ['name', 'avatar'];
            if ($this->getRealMethod() === 'POST' && strtoupper((string) $this->input('_method')) === 'PATCH') $allowed[] = '_method';
            if (array_diff(array_keys($this->all()), $allowed)) $v->errors()->add('request', __('errors.activation_invalid'));
        });
    }
}
