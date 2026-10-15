<?php
namespace App\Http\Requests\Hr;
use Illuminate\Foundation\Http\FormRequest;
class SalaryWriteRequest extends FormRequest
{
    public function authorize(): bool
    {
        $controller=class_basename($this->route()->getControllerClass());$id=$this->route('id');
        app(\App\Services\Hr\SalaryAccess::class)->actor($this->user());
        if($id){
            $model=match($controller){'SalaryComponentController'=>\App\Models\SalaryComponent::class,'BonusSchemeController'=>\App\Models\BonusScheme::class,default=>null};
            if($model)$model::findOrFail((int)$id);
            if($controller==='PayAccountController') app(\App\Services\Hr\SalaryAccess::class)->payee($this->user(),$this->route('type'),(int)$id);
        }
        return true;
    }
    public function rules(): array
    {
        $controller=class_basename($this->route()->getControllerClass());
        $action=$this->route()->getActionMethod();
        $rules=match($controller){
            'SalaryComponentController'=>['code'=>'sometimes|string|max:30','name'=>'sometimes|array:bn,en,ar','name.*'=>'string|max:100',
                'type'=>'sometimes|in:earning,deduction','calc'=>'sometimes|in:fixed,percent_basic','taxable'=>'sometimes|boolean',
                'is_pf'=>'sometimes|boolean','is_active'=>'sometimes|boolean','sort_order'=>'sometimes|integer'],
            'SalaryRevisionController'=>['payee_type'=>'sometimes|in:teacher,staff','payee_id'=>'sometimes|integer|min:1','kind'=>'sometimes|in:initial,increment,decrement,promotion,correction',
                'basic'=>'sometimes','lines'=>'sometimes|array|list','change_mode'=>'sometimes|in:set,amount,percent','change_value'=>'sometimes',
                'target'=>'sometimes|string|max:40','effective_from'=>'sometimes|date_format:Y-m-d','reason'=>'nullable|string|max:255',
                'arrears_policy'=>'sometimes|in:auto,none','designation'=>'nullable|string|max:80','grade'=>'nullable|string|max:30',
                'acknowledgement'=>'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120'],
            'IncrementBatchController'=>$action==='store'?['preview_token'=>'required|string']:['percent'=>'sometimes','amount'=>'sometimes',
                'round_to'=>'sometimes|integer','effective_from'=>'sometimes|date_format:Y-m-d','min_months_since_last'=>'sometimes|integer|min:0',
                'payee_types'=>'sometimes|array|list','exclude'=>'sometimes|array|list','label'=>'nullable|string|max:100','arrears_policy'=>'sometimes|in:auto,none'],
            'BonusSchemeController'=>['name'=>'sometimes|string|max:100','kind'=>'sometimes|string|max:12','pay_month'=>'sometimes|date_format:Y-m',
                'basis'=>'sometimes|in:basic,gross,fixed','value'=>'sometimes','min_service_months'=>'sometimes|integer|min:0',
                'prorate_below_months'=>'sometimes|integer|min:0','applies_to'=>'nullable|array','max_amount'=>'nullable','taxable'=>'sometimes|boolean'],
            'PayAccountController'=>['accounts'=>'required|array|list','default_method'=>'nullable|string|max:12','payee_type'=>'prohibited','payee_id'=>'prohibited'],
            default=>[],
        };
        foreach(['institution_id','status','new_basic','new_gross','old_basic','old_gross','calculation_snapshot','proposed_by','approved_by',
            'created_by','approved_at','letter_no','acknowledged_path','is_system','is_default','batch_id','batch_label'] as $field) $rules[$field]='prohibited';
        return $rules;
    }
}
