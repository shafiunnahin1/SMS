<?php
namespace App\Http\Requests\Hr;
use Illuminate\Foundation\Http\FormRequest;

use App\Support\Tenancy;
use Illuminate\Validation\Rule;
class StaffRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';
        return ['employee_id'=>[$required,'string','max:20',Rule::unique('staff_members','employee_id')->where('institution_id',Tenancy::current()->id)->ignore($this->route('id'))],
            'name'=>[$required,'string','max:100'], 'user_id'=>'nullable|integer|min:1',
            'designation'=>'nullable|string|max:80', 'department'=>'nullable|string|max:80',
            'phone'=>'nullable|regex:/^01[3-9][0-9]{8}$/', 'photo'=>'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'joining_date'=>'nullable|date_format:Y-m-d', 'leaving_date'=>'nullable|date_format:Y-m-d',
            'status'=>'sometimes|in:active,inactive,on_leave', 'institution_id'=>'prohibited', 'deleted_at'=>'prohibited'];
    }
}
