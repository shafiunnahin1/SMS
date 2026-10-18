<?php

namespace Database\Factories;

use App\Models\InstitutionRegistration;
use Illuminate\Database\Eloquent\Factories\Factory;

class InstitutionRegistrationFactory extends Factory
{
    protected $model = InstitutionRegistration::class;

    public function definition(): array
    {
        return ['first_admin_id' => fn () => $this->actor(), 'source' => 'public', 'review_status' => 'pending'];
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
