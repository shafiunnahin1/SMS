<?php
namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class RegistrationReviewRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()?->role === 'super_admin' && $this->user()->institution_id === null && $this->user()->is_active; }
    public function rules(): array { return ['decision' => 'required|in:approve,reject', 'reason' => 'required_if:decision,reject|nullable|string|max:255']; }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            if (array_diff(array_keys($this->all()), ['decision', 'reason'])) $v->errors()->add('request', __('errors.activation_invalid'));
        });
    }
}
