<?php

namespace App\Http\Requests\Academic;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /students - the R1 admission form with the photo and the guardian's paper consent. student_id is generated when left out.
class StoreStudentRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $inst = Tenancy::current()->id;
        return [
            'name'           => 'required|string|max:100',
            'student_id'     => ['nullable', 'string', 'max:20', Rule::unique('students', 'student_id')->where('institution_id', $inst)],
            'guardian_phone' => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'guardian_email' => 'nullable|email|max:150',
            'father_name'    => 'nullable|string|max:100',
            'mother_name'    => 'nullable|string|max:100',
            'gender'         => 'nullable|in:male,female,other',
            'date_of_birth'  => 'nullable|date|before:today',
            'address'        => 'nullable|string|max:500',
            'studying_at'    => 'nullable|string|max:150',
            'admission_date' => 'nullable|date',
            'batch_id'       => ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $inst)],
            'roll_no'        => 'nullable|integer|min:1',
            'fee_override'   => 'nullable|numeric|min:0|max:9999999',
            'photo'          => 'nullable|image|mimes:jpeg,png,webp|max:2048',
            // privacy-and-consent.md section 3: the admission form's guardian consent (method `paper`, recorded by this admin)
            'consent_data'   => 'sometimes|boolean',
            'consent_sms'    => 'sometimes|boolean',
            'consent_guardian_name' => 'nullable|string|max:100',
        ];
    }
}
