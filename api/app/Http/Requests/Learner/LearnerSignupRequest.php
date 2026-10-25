<?php

namespace App\Http\Requests\Learner;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// D165 (1) ST.1: name, the student's own Bangladeshi mobile, a password, an optional active class, and the privacy/terms checkbox
class LearnerSignupRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'phone' => ['required', 'string', 'regex:/^(\+?88)?01[3-9]\d{8}$/'],
            'password' => 'required|string|min:8|max:100|confirmed',
            'qb_class_level_id' => ['nullable', 'integer', Rule::exists('qb_class_levels', 'id')->where('is_active', true)],
            'accept_terms' => 'accepted',
        ];
    }
}
