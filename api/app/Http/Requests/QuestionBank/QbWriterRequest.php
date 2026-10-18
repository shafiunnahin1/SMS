<?php

namespace App\Http\Requests\QuestionBank;

use App\Models\User;
use App\Rules\PolicyPassword;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /super/qb/writers, PATCH /super/qb/writers/{id} (QB.2, D65): a platform writer or moderator. The phone is required - they
// sign in with a one-time code like the Super Admin. Phone / email are unique among platform accounts.
class QbWriterRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if ($this->filled('phone')) $this->merge(['phone' => User::normalisePhone((string) $this->input('phone'))]);
    }

    public function rules(): array
    {
        $creating = $this->isMethod('post');
        $id = (int) $this->route('id');
        $unique = fn (string $col) => Rule::unique('users', $col)->whereNull('institution_id')->ignore($creating ? null : $id);
        return [
            'name'      => ($creating ? 'required' : 'sometimes') . '|string|max:100',
            'role'      => [$creating ? 'required' : 'sometimes', 'in:content_writer,content_moderator'],
            'phone'     => [$creating ? 'required' : 'sometimes', 'regex:/^01[3-9]\d{8}$/', $unique('phone')],
            'email'     => ['nullable', 'email', 'max:150', $unique('email')],
            'password'  => [$creating ? 'required' : 'prohibited', 'string', 'max:100', new PolicyPassword((string) $this->input('role', 'content_writer'))],
            'is_active' => [$creating ? 'prohibited' : 'sometimes', 'boolean'],
        ];
    }
}
