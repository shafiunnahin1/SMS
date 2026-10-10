<?php

namespace App\Http\Requests\Exams;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /exams, PUT /exams/{id} (admin). The program / batch are fixed after creation (the exam's subjects and marks hang on
// them); status 'published' only through POST /exams/{id}/publish.
class ExamRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $tenant = Tenancy::current()->id;
        $creating = $this->isMethod('post');
        return [
            'name'          => 'required|string|max:100',
            'program_id'    => $creating ? ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $tenant)] : 'prohibited',
            'batch_id'      => $creating ? ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $tenant)->where('program_id', (int) $this->input('program_id'))] : 'prohibited',
            'exam_type'     => 'required|in:term,class_test,weekly,model_test,admission',
            'academic_year' => 'required|integer|min:2000|max:2100',
            'start_date'    => 'nullable|date',
            'end_date'      => 'nullable|date|after_or_equal:start_date',
            'status'        => $creating ? 'prohibited' : 'sometimes|in:upcoming,ongoing,completed',
        ];
    }
}
