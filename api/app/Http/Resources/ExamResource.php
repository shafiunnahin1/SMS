<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ExamResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'exam_type' => $this->exam_type, 'academic_year' => (int) $this->academic_year,
            'program' => $this->program ? ['id' => $this->program->id, 'name' => $this->program->name] : null,
            'batch' => $this->batch ? ['id' => $this->batch->id, 'name' => $this->batch->name] : null,
            'start_date' => $this->start_date?->toDateString(), 'end_date' => $this->end_date?->toDateString(), 'status' => $this->status,
            'subjects_count' => $this->whenCounted('subjects'), 'has_results' => (bool) ($this->results_exists ?? false),
        ];
    }
}
