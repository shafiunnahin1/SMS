<?php

namespace App\Http\Requests\Academic;

use App\Models\Enrollment;
use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// PUT /enrollments/{id} | POST /enrollments/{id}/end | POST /enrollments/{id}/transfer (academic-structure.md "API Endpoints")
class EnrollmentActionRequest extends FormRequest
{
    /** Another institution's (or a missing) enrollment is a 404 BEFORE any validation message - nothing about it leaks */
    public function authorize(): bool
    {
        Enrollment::findOrFail($this->route('id'));
        return true;
    }

    public function rules(): array
    {
        $inst = Tenancy::current()->id;
        return match ($this->route()->getActionMethod()) {
            'end'      => ['status' => 'required|in:dropped,completed', 'note' => 'nullable|string|max:255'],
            'transfer' => ['batch_id' => ['required', 'integer', Rule::exists('batches', 'id')->where('institution_id', $inst)], 'roll_no' => 'nullable|integer|min:1'],
            default    => [
                'roll_no'             => 'nullable|integer|min:1',
                'fee_override'        => 'nullable|numeric|min:0|max:9999999',
                'optional_subject_id' => ['nullable', 'integer', Rule::exists('subjects', 'id')->where('institution_id', $inst)],
            ],
        };
    }
}
