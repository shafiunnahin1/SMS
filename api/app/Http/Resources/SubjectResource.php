<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class SubjectResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'program_id' => $this->program_id, 'program' => $this->whenLoaded('program', fn () => ['id' => $this->program->id, 'name' => $this->program->name]),
            'name' => $this->name, 'code' => $this->code, 'full_marks' => $this->full_marks, 'pass_marks' => $this->pass_marks,
            'is_optional' => $this->is_optional, 'teacher_id' => $this->teacher_id,
            'teacher' => $this->whenLoaded('teacher', fn () => $this->teacher ? ['id' => $this->teacher->id, 'name' => $this->teacher->user?->name] : null),
        ];
    }
}
