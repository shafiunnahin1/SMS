<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentMembershipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'department_id' => $this->department_id, 'user_id' => $this->user_id, 'status' => $this->status,
            'starts_at' => $this->starts_at?->toDateString(), 'ends_at' => $this->ends_at?->toDateString()];
    }
}
