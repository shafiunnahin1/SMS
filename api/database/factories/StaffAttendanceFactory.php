<?php

namespace Database\Factories;

use App\Models\StaffAttendance;
use Illuminate\Database\Eloquent\Factories\Factory;

class StaffAttendanceFactory extends Factory
{
    protected $model = StaffAttendance::class;
    public function definition(): array
    {
        return ['staff_id' => fn () => \App\Models\StaffMember::factory()->create()->id, 'date' => '2026-10-18', 'status' => 'present'];
    }
}
