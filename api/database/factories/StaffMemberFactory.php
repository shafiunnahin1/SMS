<?php

namespace Database\Factories;

use App\Models\StaffMember;
use Illuminate\Database\Eloquent\Factories\Factory;

class StaffMemberFactory extends Factory
{
    protected $model = StaffMember::class;
    public function definition(): array
    {
        return ['employee_id' => fake()->unique()->numerify('S########'), 'name' => 'Staff fixture', 'status' => 'active'];
    }
}
