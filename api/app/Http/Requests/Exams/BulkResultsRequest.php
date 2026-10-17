<?php

namespace App\Http\Requests\Exams;

use Illuminate\Foundation\Http\FormRequest;

// POST /results/bulk (admin, teacher): one subject of one exam; the server grades (grading.md Revision 6.3)
class BulkResultsRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'exam_id'                => 'required|integer',
            'subject_id'             => 'required|integer',
            'rows'                   => 'required|array|min:1|max:300',
            'rows.*.student_id'      => 'required|integer|distinct',
            'rows.*.marks_obtained'  => 'nullable|numeric|min:0|max:1000',
            'rows.*.components'      => 'nullable|array',
            'rows.*.components.*'    => 'nullable|numeric|min:0|max:1000',
            'rows.*.is_absent'       => 'nullable|boolean',
            'rows.*.teacher_remarks' => 'nullable|string|max:255',
        ];
    }
}
