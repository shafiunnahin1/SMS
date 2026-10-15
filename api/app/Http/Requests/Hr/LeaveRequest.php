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
            'institution_id'=>'prohibited','total_days'=>'prohibited','status'=>'prohibited','approved_by'=>'prohibited'];
    }
}
