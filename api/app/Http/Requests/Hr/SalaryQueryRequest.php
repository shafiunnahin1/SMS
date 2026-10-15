<?php
namespace App\Http\Requests\Hr;
use Illuminate\Foundation\Http\FormRequest;
class SalaryQueryRequest extends FormRequest
{
    public function authorize(): bool{return true;}
    public function rules(): array{return ['per_page'=>'nullable|integer|min:1|max:100','status'=>'nullable|in:proposed,approved,rejected,applied,cancelled,draft,requested,active,closed,written_off',
        'payee_type'=>'nullable|in:teacher,staff','payee_id'=>'nullable|integer|min:1','batch_id'=>'nullable|uuid'];}
}
