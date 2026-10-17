<?php
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;
class LeaveTypeResource extends JsonResource
{
    public function toArray($request): array
    {
        return $this->resource->only(['id','name','max_days_per_year','is_paid']);
    }
}
