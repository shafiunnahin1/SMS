<?php

namespace App\Http\Requests\Routines;

use App\Models\Routine;
use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// D193 RTN.1: POST /routines, PUT /routines/{id} (admin). Program, batch (of that program), subject (of that program) and teacher
// must belong to this institution; end after start. The id of the slot being edited never comes from the body.
class RoutineRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $t = Tenancy::current()->id;
        $program = (int) $this->input('program_id');
        return [
            'program_id'  => ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'batch_id'    => ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $t)->where('program_id', $program)],
            'subject_id'  => ['required', 'integer', Rule::exists('subjects', 'id')->where('institution_id', $t)->where('program_id', $program)],
            'teacher_id'  => ['required', 'integer', Rule::exists('teachers', 'id')->where('institution_id', $t)->whereNull('deleted_at')],
            'day_of_week' => ['required', Rule::in(Routine::DAYS)],
            'start_time'  => 'required|date_format:H:i',
            'end_time'    => 'required|date_format:H:i|after:start_time',
            'room_no'     => 'nullable|string|max:20',
            'id'          => 'prohibited',
            'institution_id' => 'prohibited',
        ];
    }
}
