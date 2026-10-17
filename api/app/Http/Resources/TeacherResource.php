<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

// Salary and allowances are payroll data (D33) - never in this resource
class TeacherResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'user_id' => $this->user_id, 'name' => $this->user?->name, 'phone' => $this->user?->phone, 'email' => $this->user?->email,
            'employee_id' => $this->employee_id, 'designation' => $this->designation, 'department' => $this->department,
            'joining_date' => $this->joining_date?->toDateString(), 'qualification' => $this->qualification, 'status' => $this->status,
        ];
    }
}
