<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class BatchResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'program_id' => $this->program_id,
            'program' => $this->whenLoaded('program', fn () => $this->program ? ['id' => $this->program->id, 'name' => $this->program->name] : null),
            'teacher_id' => $this->teacher_id,
            'teacher' => $this->whenLoaded('teacher', fn () => $this->teacher ? ['id' => $this->teacher->id, 'name' => $this->teacher->user?->name] : null),
            'academic_year_id' => $this->academic_year_id, 'start_date' => $this->start_date?->toDateString(), 'end_date' => $this->end_date?->toDateString(),
            'schedule' => $this->schedule, 'monthly_fee' => $this->monthly_fee, 'room' => $this->room, 'max_capacity' => $this->max_capacity,
            'status' => $this->status, 'shift' => $this->shift,
            'students_count' => $this->whenCounted('activeEnrollments'),
            'subject_teachers' => $this->whenLoaded('subjectTeachers', fn () => $this->subjectTeachers->map(fn ($bt) => [
                'subject_id' => $bt->subject_id, 'subject' => $bt->subject_id ? $bt->subject?->name : null,
                'teacher_id' => $bt->teacher_id, 'teacher' => $bt->teacher?->user?->name,
            ])->values()),
        ];
    }
}
