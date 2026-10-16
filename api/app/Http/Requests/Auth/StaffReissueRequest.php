<?php
namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class StaffReissueRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()?->role === 'admin' && $this->user()->is_active; }
    public function rules(): array { return []; }
    public function withValidator($validator): void
    {
        $validator->after(function ($v) { if ($this->all()) $v->errors()->add('request', __('errors.activation_invalid')); });
    }
}
