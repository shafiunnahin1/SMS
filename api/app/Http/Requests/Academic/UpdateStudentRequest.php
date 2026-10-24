<?php

namespace App\Http\Requests\Academic;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// PUT /students/{id}: the profile only. Program / batch / roll are enrollment data (POST /enrollments, PUT /enrollments/{id}) -
// students.program_id/batch_id/roll_no are a cache only EnrollmentService writes (academic-structure.md rule 2).
class UpdateStudentRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $inst = Tenancy::current()->id;
        return [
            'name'           => 'sometimes|string|max:100',
            'student_id'     => ['prohibited'],   // D160: an ID never changes after it is given
            'guardian_phone' => ['sometimes', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'father_name'    => 'nullable|string|max:100',
            'mother_name'    => 'nullable|string|max:100',
            'gender'         => 'nullable|in:male,female,other',
            'date_of_birth'  => 'nullable|date|before:today',
            'blood_group'    => 'nullable|string|max:5',
            'religion'       => 'nullable|string|max:30',
            'address'        => 'nullable|string|max:500',
            'studying_at'    => 'nullable|string|max:150',
            'admission_date' => 'nullable|date',
            'status'         => 'sometimes|in:active,inactive',
            'photo'          => 'nullable|image|mimes:jpeg,png,webp|max:2048',
        ];
    }
}
