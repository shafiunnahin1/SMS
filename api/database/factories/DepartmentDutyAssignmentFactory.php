<?php

namespace Database\Factories;

use App\Models\DepartmentDutyAssignment;
use Illuminate\Database\Eloquent\Factories\Factory;

class DepartmentDutyAssignmentFactory extends Factory
{
    protected $model = DepartmentDutyAssignment::class;

    public function definition(): array
    {
        return ['membership_id' => fn () => \App\Models\DepartmentMembership::factory()->create()->id, 'duty_id' => fn (array $a) => \App\Models\DepartmentDuty::factory()->create(['department_id' => \App\Models\DepartmentMembership::findOrFail($a['membership_id'])->department_id])->id, 'status' => 'active', 'assigned_by' => fn () => $this->actor(), 'assigned_at' => now()];
    }

    private function actor(): int
    {
        return \App\Models\User::create([
            'institution_id' => \App\Support\Tenancy::current()->id,
            'name' => 'Foundation fixture', 'email' => fake()->unique()->safeEmail(),
            'password' => 'Fixture@1234', 'role' => 'admin', 'is_active' => false,
        ])->id;
    }
}
