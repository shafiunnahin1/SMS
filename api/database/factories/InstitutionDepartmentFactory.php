<?php

namespace Database\Factories;

use App\Models\InstitutionDepartment;
use Illuminate\Database\Eloquent\Factories\Factory;

class InstitutionDepartmentFactory extends Factory
{
    protected $model = InstitutionDepartment::class;

    public function definition(): array
    {
        return ['code' => fake()->unique()->bothify('DEPT-########'), 'name' => fake()->unique()->bothify('Department ########'), 'status' => 'active', 'created_by' => fn () => $this->actor()];
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
