<?php
namespace App\Http\Resources;
use App\Models\PayrollRun;
use Illuminate\Http\Resources\Json\JsonResource;
// R3.7: payroll numbers reach only admin/accountant (and a teacher's own items); no account numbers, no settings internals
class PayrollResource extends JsonResource
{
    public function toArray($request): array
    {
        if ($this->resource instanceof PayrollRun) {
            $data = $this->resource->only(['id','month','kind','label','status','payees_count','total_gross','total_deductions','total_net','prepared_by','reviewed_by','approved_by','approved_at','self_approved','paid_at','cancelled_reason','created_at']);
            if ($this->resource->relationLoaded('items')) $data['items'] = PayrollResource::collection($this->resource->items)->toArray($request);
            return $data;
        }
        return $this->resource->only(['id','run_id','payee_type','payee_id','days_in_month','paid_days','absent_days','lwp_days','late_count','basic','gross','total_earnings','total_deductions','tax','net','breakdown','status','hold_reason','payment_method','paid_reference','paid_at','slip_no']);
    }
}
