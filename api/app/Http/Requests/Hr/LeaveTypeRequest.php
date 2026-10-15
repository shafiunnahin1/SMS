<?php
namespace App\Http\Requests\Hr;
use Illuminate\Foundation\Http\FormRequest;

class LeaveTypeRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        $required=$this->isMethod('post')?'required':'sometimes';
        return ['name'=>[$required,'string','max:50'],'max_days_per_year'=>[$required,'integer','min:0','max:366'],
            'is_paid'=>[$required,'boolean'],'institution_id'=>'prohibited'];
    }
}
