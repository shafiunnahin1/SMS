<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StaffBatchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'status' => $this->status,
            'program' => $this->program ? ['id' => $this->program->id, 'name' => $this->program->name] : null];
    }
}
