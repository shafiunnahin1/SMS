<?php

namespace App\Http\Requests\Academic;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /enrollments { student_id, batch_id, roll_no?, fee_override? } (docs/modules/academic-structure.md)
class StoreEnrollmentRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $inst = Tenancy::current()->id;
        return [
            'student_id'   => ['required', 'integer', Rule::exists('students', 'id')->where('institution_id', $inst)->whereNull('deleted_at')],
            'batch_id'     => ['required', 'integer', Rule::exists('batches', 'id')->where('institution_id', $inst)],
            'roll_no'      => 'nullable|integer|min:1',
            'fee_override' => 'nullable|numeric|min:0|max:9999999',
        ];
    }
}
