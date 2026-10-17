<?php

namespace App\Http\Requests\Academic;

use App\Models\{Teacher, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /teachers, PUT /teachers/{id}. Login identity (name, phone, email) lives on users; the teacher row holds the job details.
// Salary and allowances are payroll data (D33, Release 3) - not accepted or shown here.
class TeacherRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if ($this->filled('phone')) $this->merge(['phone' => User::normalisePhone($this->input('phone'))]);
    }

    public function rules(): array
    {
        $inst = Tenancy::current()->id;
        $post = $this->isMethod('post');
        $userId = $post ? null : Teacher::find($this->route('id'))?->user_id;
        $uniqueUser = fn (string $col) => Rule::unique('users', $col)->where('institution_id', $inst)->ignore($userId);
        return [
            'name'          => [$post ? 'required' : 'sometimes', 'string', 'max:100'],
            'phone'         => [$post ? 'required_without:email' : 'sometimes', 'nullable', 'regex:/^01[3-9]\d{8}$/', $uniqueUser('phone')],
            'email'         => [$post ? 'required_without:phone' : 'sometimes', 'nullable', 'email', 'max:150', $uniqueUser('email')],
            'employee_id'   => ['nullable', 'string', 'max:20', Rule::unique('teachers', 'employee_id')->where('institution_id', $inst)->ignore($this->route('id'))],
            'designation'   => 'nullable|string|max:50',
            'department'    => 'nullable|string|max:50',
            'joining_date'  => 'nullable|date',
            'qualification' => 'nullable|string|max:1000',
            'status'        => 'sometimes|in:active,inactive,on_leave',
        ];
    }
}
