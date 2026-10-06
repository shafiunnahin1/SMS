<?php

namespace App\Http\Requests\Attendance;

use App\Support\Tenancy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

// POST /attendance { batch_id, date, records:[{student_id, status, note?}] } (docs/modules/academic-structure.md)
class StoreAttendanceRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'batch_id'             => ['required', 'integer', Rule::exists('batches', 'id')->where('institution_id', Tenancy::current()->id)],
            'date'                 => 'required|date_format:Y-m-d|before_or_equal:today',
            'records'              => 'required|array|min:1|max:500',
            'records.*.student_id' => 'required|integer|distinct',
            'records.*.status'     => 'required|in:present,absent,late,leave',
            'records.*.note'       => 'nullable|string|max:255',
        ];
    }
}
