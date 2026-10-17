<?php

namespace Database\Factories;

use App\Models\LeaveType;
use Illuminate\Database\Eloquent\Factories\Factory;

class LeaveTypeFactory extends Factory
{
    protected $model = LeaveType::class;
    public function definition(): array
    {
        return ['name' => 'Annual leave', 'max_days_per_year' => 10, 'is_paid' => true];
    }
}
