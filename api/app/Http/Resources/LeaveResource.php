<?php
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;
class LeaveResource extends JsonResource
{
    public function toArray($request): array
    {
        return $this->resource->only(['id','user_id','staff_id','leave_type_id','from_date','to_date','total_days','reason','status','approved_by']);
    }
}
