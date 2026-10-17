<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentDutyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'department_id' => $this->department_id, 'code' => $this->code, 'name' => $this->name,
            'description' => $this->description, 'permission_keys' => $this->permission_keys, 'status' => $this->status];
    }
}
