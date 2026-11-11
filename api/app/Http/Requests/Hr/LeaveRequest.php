<?php
namespace App\Http\Requests\Hr;
use Illuminate\Foundation\Http\FormRequest;

class LeaveRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        $transition = $this->isMethod('patch');
        return ['leave_type_id'=>[$transition?'prohibited':'required','integer','min:1'],
            'user_id'=>[$transition?'prohibited':'nullable','integer','min:1'],
            'staff_id'=>[$transition?'prohibited':'nullable','integer','min:1'],
            'from_date'=>[$transition?'prohibited':'required','date_format:Y-m-d'],
            'to_date'=>[$transition?'prohibited':'required','date_format:Y-m-d','after_or_equal:from_date'],
            'reason'=>'nullable|string|max:1000','override'=>'sometimes|boolean','override_reason'=>'nullable|string|max:255',
            // D200 SUBL.3: approval may carry the reviewed cover choice of every not-started period, and the scope digest it was read with
            'cover_choices'=>[$this->route('action')==='approve'?'nullable':'prohibited','array','max:400'],
            'cover_choices.*'=>'array:routine_id,occurrence_date,substitute_teacher_id',
            'cover_choices.*.routine_id'=>'required|integer|min:1','cover_choices.*.occurrence_date'=>'required|date_format:Y-m-d',
            'cover_choices.*.substitute_teacher_id'=>'present|nullable|integer|min:1',
            'expected_versions'=>[$transition?'nullable':'prohibited','array:occurrence_scope'],'expected_versions.occurrence_scope'=>'nullable|string|regex:/^[0-9a-f]{64}$/',
            'institution_id'=>'prohibited','total_days'=>'prohibited','status'=>'prohibited','approved_by'=>'prohibited'];
    }
}
