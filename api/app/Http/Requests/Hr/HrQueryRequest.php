<?php
namespace App\Http\Requests\Hr;
use Illuminate\Foundation\Http\FormRequest;

class HrQueryRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        return ['q'=>'nullable|string|max:100','status'=>'nullable|in:active,inactive,on_leave,pending,approved,rejected,cancelled',
            'date'=>'nullable|date_format:Y-m-d','month'=>'nullable|date_format:Y-m','year'=>'nullable|integer|min:1900|max:2200',
            'type'=>'nullable|in:teacher,staff','id'=>'nullable|integer|min:1','leave_type_id'=>'nullable|integer|min:1',
            'per_page'=>'nullable|integer|min:1|max:100'];
    }
}
