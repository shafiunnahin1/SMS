<?php
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;
class StaffResource extends JsonResource
{
    public function toArray($request): array
    {
        return $this->resource->only(['id','user_id','employee_id','name','designation','department','phone','joining_date','leaving_date','status']);
    }
}
