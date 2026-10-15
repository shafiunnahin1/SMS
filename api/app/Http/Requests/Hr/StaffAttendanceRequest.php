<?php
namespace App\Http\Requests\Hr;
use Illuminate\Foundation\Http\FormRequest;

class StaffAttendanceRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        return ['date'=>'required|date_format:Y-m-d','records'=>'required|array|min:1|max:500',
            'records.*.staff_id'=>'nullable|integer|min:1|distinct','records.*.teacher_id'=>'nullable|integer|min:1|distinct',
            'records.*.status'=>'required|in:present,absent,late,leave','records.*.note'=>'nullable|string|max:255',
            'records.*.check_in'=>'nullable|date_format:H:i','records.*.check_out'=>'nullable|date_format:H:i',
            'records.*.institution_id'=>'prohibited','records.*.marked_by'=>'prohibited','institution_id'=>'prohibited'];
    }
}
