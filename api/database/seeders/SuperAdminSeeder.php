<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

// docs/database/seeders.md "SuperAdminSeeder": the platform account (institution_id NULL), used on the central host only.
// Demo password from the spec (docs/database/seeders.md "Demo Credentials") - change it on any shared server.
class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        User::platform()->firstOrCreate(
            ['email' => 'admin@schoolapp.com'],
            [
                'name' => 'Super Admin',
                'phone' => '01700000000',
                'password' => 'Admin@1234',
                'role' => 'super_admin',
                'institution_id' => null,
                'is_active' => true,
            ],
        );
    }
}
