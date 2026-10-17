<?php

namespace Database\Factories;

use App\Models\DepartmentMembership;
use Illuminate\Database\Eloquent\Factories\Factory;

class DepartmentMembershipFactory extends Factory
{
    protected $model = DepartmentMembership::class;

    public function definition(): array
    {
        return ['department_id' => fn () => \App\Models\InstitutionDepartment::factory()->create()->id, 'user_id' => fn () => $this->actor(), 'status' => 'active', 'created_by' => fn () => $this->actor()];
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
