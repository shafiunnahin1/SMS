<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

// Order: docs/database/seeders.md "Seeder Order (Final)": presets before any institution; three demo tenants
// (school, coaching, private_batch) - demo logins in docs/database/seeders.md "Demo Credentials".
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            PlanSeeder::class,
            ThemePresetSeeder::class,
            SuperAdminSeeder::class,
            DemoInstitutionSeeder::class,
            DemoDataSeeder::class,
            DemoCoachingSeeder::class,
            DemoTutorSeeder::class,
        ]);
    }
}
