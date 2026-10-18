<?php

namespace App\Http\Requests\Academic;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /subjects, PUT /subjects/{id} - a subject belongs to one program (schema.sql `subjects`)
class SubjectRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $inst = Tenancy::current()->id;
        $req = $this->isMethod('post') ? 'required' : 'sometimes';
        return [
            'program_id'  => [$req, 'integer', Rule::exists('programs', 'id')->where('institution_id', $inst)],
            'name'        => "{$req}|string|max:100",
            'code'        => 'nullable|string|max:20',
            'teacher_id'  => ['nullable', 'integer', Rule::exists('teachers', 'id')->where('institution_id', $inst)->whereNull('deleted_at')],
            'full_marks'  => 'sometimes|integer|min:1|max:1000',
            'pass_marks'  => 'sometimes|integer|min:0|lte:full_marks',
            'is_optional' => 'sometimes|boolean',
        ];
    }
}
