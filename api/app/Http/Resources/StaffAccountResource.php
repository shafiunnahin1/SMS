<?php
namespace App\Http\Resources;

use App\Support\UserAvatar;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StaffAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'email' => $this->email, 'phone' => $this->phone,
            'role' => $this->role, 'is_active' => (bool) $this->is_active, 'avatar' => UserAvatar::url($this->resource)];
    }
}
