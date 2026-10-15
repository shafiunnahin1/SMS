<?php
namespace App\Http\Resources;
use App\Models\{SalaryAdvance,SalaryComponent,SalaryRevision,SalaryStructure,BonusScheme};
use Illuminate\Http\Resources\Json\JsonResource;
class SalaryResource extends JsonResource
{
    public function toArray($request): array
    {
        if($this->resource instanceof SalaryAdvance){
            $data=$this->resource->only(['id','payee_type','payee_id','amount','reason','installments','installment_amount','recover_from_month','recovered','status','payment_method','disbursed_at']);
            $data['skipped_months']=array_map(static fn($skip)=>array_intersect_key($skip,array_flip(['month','reason','at'])),$this->resource->skipped_months??[]);
            return $data;
        }
        $fields=match(true){
            $this->resource instanceof SalaryComponent=>'id code name type calc taxable is_pf is_system is_active sort_order',
            $this->resource instanceof SalaryRevision=>'id payee_type payee_id kind batch_id batch_label change_mode change_value target old_basic new_basic old_gross new_gross effective_from reason arrears_policy status proposed_by approved_by approved_at letter_no',
            $this->resource instanceof SalaryStructure=>'id payee_type payee_id basic gross effective_from effective_to designation grade revision_id',
            $this->resource instanceof BonusScheme=>'id name kind pay_month basis value min_service_months prorate_below_months applies_to max_amount taxable status applied_at',
            default=>'id'
        };
        return $this->resource->only(explode(' ',$fields));
    }
}
