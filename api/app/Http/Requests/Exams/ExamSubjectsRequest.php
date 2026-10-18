<?php

namespace App\Http\Requests\Exams;

use Illuminate\Foundation\Http\FormRequest;

// PUT /exams/{id}/subjects (admin): schedule, full/pass marks and optional parts (written / MCQ / practical) per subject
class ExamSubjectsRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'subjects'                => 'required|array|min:1|max:40',
            'subjects.*.subject_id'   => 'required|integer|distinct',
            'subjects.*.full_marks'   => 'required|numeric|min:1|max:1000',
            'subjects.*.pass_marks'   => 'required|numeric|min:0|lte:subjects.*.full_marks',
            'subjects.*.exam_date'    => 'nullable|date',
            'subjects.*.start_time'   => 'nullable|date_format:H:i',
            'subjects.*.end_time'     => 'nullable|date_format:H:i|after:subjects.*.start_time',
            'subjects.*.room'         => 'nullable|string|max:50',
            'subjects.*.sort_order'   => 'nullable|integer|min:0|max:255',
            'subjects.*.components'          => 'nullable|array|max:5',
            'subjects.*.components.*.key'    => 'required|alpha_dash|max:20',
            'subjects.*.components.*.label'  => 'required|string|max:50',
            'subjects.*.components.*.full'   => 'required|numeric|min:1|max:1000',
            'subjects.*.components.*.pass'   => 'required|numeric|min:0|lte:subjects.*.components.*.full',
        ];
    }
}
