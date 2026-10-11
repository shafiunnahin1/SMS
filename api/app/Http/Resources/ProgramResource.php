<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ProgramResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'numeric_name' => $this->numeric_name, 'code' => $this->code,
            'group_name' => $this->group_name, 'duration_months' => $this->duration_months, 'course_fee' => $this->course_fee,
            'is_default' => $this->is_default, 'is_active' => $this->is_active, 'sort_order' => $this->sort_order, 'qb_class_level_id' => $this->qb_class_level_id,
            'batches_count' => $this->whenCounted('batches'),
        ];
    }
}
