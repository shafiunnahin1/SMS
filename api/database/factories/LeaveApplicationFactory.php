<?php

namespace Database\Factories;

use App\Models\LeaveApplication;
use Illuminate\Database\Eloquent\Factories\Factory;

class LeaveApplicationFactory extends Factory
{
    protected $model = LeaveApplication::class;
    public function definition(): array
    {
        return ['staff_id' => fn () => \App\Models\StaffMember::factory()->create()->id,
            'leave_type_id' => fn () => \App\Models\LeaveType::factory()->create()->id,
            'from_date' => '2026-10-18', 'to_date' => '2026-10-18', 'total_days' => 1, 'status' => 'pending'];
    }
}
