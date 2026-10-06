<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

// Order: docs/database/seeders.md "Seeder Order (Final)". The demo tenant seeders need EnrollmentService and
// ThemeService::applyPreset(), so they are added in Steps 2.5/2.6.
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            PlanSeeder::class,
            ThemePresetSeeder::class,
            SuperAdminSeeder::class,
        ]);
    }
}
