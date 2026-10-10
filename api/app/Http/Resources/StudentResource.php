<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Student - program/batch/roll are the primary-enrollment cache; `enrollments` lists every batch */
class StudentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->id,
            'student_id'     => $this->student_id,
            'name'           => $this->user?->name,
            'guardian_phone' => $this->guardian_phone,
            'father_name'    => $this->father_name,
            'mother_name'    => $this->mother_name,
            'gender'         => $this->gender,
            'date_of_birth'  => $this->date_of_birth?->toDateString(),
            'studying_at'    => $this->studying_at,
            'address'        => $this->address,
            'blood_group'    => $this->blood_group,
            'religion'       => $this->religion,
            'admission_date' => $this->admission_date?->toDateString(),
            'photo_url'      => \App\Support\StudentFiles::photoUrl($this->resource),   // 10-minute signed link, never a public url
            'status'         => $this->status,
            'roll_no'        => $this->roll_no,
            'program'        => $this->whenLoaded('program', fn () => $this->program ? ['id' => $this->program->id, 'name' => $this->program->name] : null),
            'batch'          => $this->whenLoaded('batch', fn () => $this->batch ? ['id' => $this->batch->id, 'name' => $this->batch->name] : null),
            'enrollments'    => $this->whenLoaded('activeEnrollments', fn () => $this->activeEnrollments->map(fn ($e) => [
                'id' => $e->id, 'batch' => ['id' => $e->batch_id, 'name' => $e->batch?->name], 'program' => ['id' => $e->program_id, 'name' => $e->program?->name],
                'roll_no' => $e->roll_no, 'is_primary' => (bool) $e->is_primary, 'fee_override' => $e->fee_override,
            ])),
        ];
    }
}
