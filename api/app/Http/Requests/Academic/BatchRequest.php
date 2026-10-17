<?php

namespace App\Http\Requests\Academic;

use App\Services\InstitutionSettings;
use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /batches, PUT /batches/{id}. teacher_id = the class teacher (batches.teacher_id); subject_teachers = who teaches which subject
// in this batch (batch_teachers; subject 0 = every subject). program_id may be left out where the institution hides programs
// (settings.use_programs = false): the batch then gets the default program (academic-structure.md "Notes").
class BatchRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $inst = Tenancy::current();
        $usePrograms = app(InstitutionSettings::class)->general($inst)['use_programs'];
        $post = $this->isMethod('post');
        $own = fn (string $table) => Rule::exists($table, 'id')->where('institution_id', $inst->id);
        return [
            'program_id'       => [$post && $usePrograms ? 'required' : 'sometimes', 'integer', $own('programs')],
            'name'             => [$post ? 'required' : 'sometimes', 'string', 'max:60'],
            'teacher_id'       => ['nullable', 'integer', Rule::exists('teachers', 'id')->where('institution_id', $inst->id)->whereNull('deleted_at')],
            'academic_year_id' => ['nullable', 'integer', $own('academic_years')],
            'start_date'       => 'nullable|date',
            'end_date'         => 'nullable|date|after_or_equal:start_date',
            'schedule'         => 'nullable|array|max:14',
            'schedule.*.day'   => 'required_with:schedule|in:sat,sun,mon,tue,wed,thu,fri',
            'schedule.*.start' => 'required_with:schedule|date_format:H:i',
            'schedule.*.end'   => 'required_with:schedule|date_format:H:i',
            'monthly_fee'      => 'nullable|numeric|min:0|max:9999999',
            'room'             => 'nullable|string|max:30',
            'max_capacity'     => 'sometimes|integer|min:1|max:1000',
            'status'           => 'sometimes|in:upcoming,running,completed,archived',
            'shift'            => 'nullable|in:morning,day,evening',
            'subject_teachers'              => 'sometimes|array|max:50',
            'subject_teachers.*.subject_id' => ['required', 'integer', 'min:0'],
            'subject_teachers.*.teacher_id' => ['required', 'integer', Rule::exists('teachers', 'id')->where('institution_id', $inst->id)->whereNull('deleted_at')],
        ];
    }
}
