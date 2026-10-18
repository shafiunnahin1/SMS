<?php
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;
class StaffAttendanceResource extends JsonResource
{
    public function toArray($request): array
    {
        return $this->resource->only(['id','staff_id','teacher_id','date','status','check_in','check_out','note','marked_by']);
    }
}
