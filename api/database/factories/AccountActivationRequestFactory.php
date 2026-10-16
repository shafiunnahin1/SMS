<?php

namespace Database\Factories;

use App\Models\AccountActivationRequest;
use Illuminate\Database\Eloquent\Factories\Factory;

class AccountActivationRequestFactory extends Factory
{
    protected $model = AccountActivationRequest::class;

    public function definition(): array
    {
        return ['user_id' => fn () => $this->actor(), 'public_id' => (string) \Illuminate\Support\Str::uuid(), 'purpose' => 'staff_activation', 'generation' => 1, 'channel' => 'email', 'contact_hash' => hash_hmac('sha256', 'fixture', 'test-only'), 'status' => 'pending', 'expires_at' => now()->addMinutes(5)];
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
