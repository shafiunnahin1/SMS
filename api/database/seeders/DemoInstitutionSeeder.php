<?php

namespace Database\Seeders;

use App\Models\{Batch, FeeCategory, Institution, Program, SubscriptionPlan, ThemePreset, User};
use App\Services\ThemeService;
use App\Support\{Tenancy, TenantBulk};
use Illuminate\Database\Seeder;

// docs/database/seeders.md "DemoInstitutionSeeder" - the demo school. Demo passwords from the spec: change them on any shared server.
class DemoInstitutionSeeder extends Seeder
{
    public function run(): void
    {
        $institution = (new Institution)->forceFill([
            'name' => 'ধানমন্ডি আদর্শ উচ্চ বিদ্যালয়', 'slug' => 'dhanmondi-school',
            'email' => 'info@dhanmondischool.edu.bd', 'phone' => '01711111111', 'address' => 'ধানমন্ডি, ঢাকা-১২০৫',
            'institution_type' => 'school', 'onboarding_completed' => true,
            'subscription_plan_id' => SubscriptionPlan::where('name', 'Pro')->value('id'),
            'subscription_expires_at' => now()->addYear(), 'status' => 'active',
        ]);
        $institution->save();

        // Tenancy::as instead of a bare app()->instance(): the binding is always released, so the next seeder starts clean
        Tenancy::as($institution, function (Institution $institution) {
            app(ThemeService::class)->applyPreset($institution, ThemePreset::where('key', 'classic-blue')->firstOrFail());

            User::create([
                'institution_id' => $institution->id, 'name' => 'মো: আবদুল করিম',
                'email' => 'principal@dhanmondischool.edu.bd', 'password' => 'School@1234', 'role' => 'admin',
            ]);

            for ($i = 1; $i <= 10; $i++) {
                $class = Program::create(['name' => "Class $i", 'numeric_name' => $i]);
                foreach (['A', 'B'] as $section) Batch::create(['program_id' => $class->id, 'name' => $section]);
            }

            TenantBulk::insert(FeeCategory::class, [
                ['institution_id' => $institution->id, 'name' => 'মাসিক বেতন', 'amount' => 500, 'frequency' => 'monthly'],
                ['institution_id' => $institution->id, 'name' => 'পরীক্ষা ফি', 'amount' => 200, 'frequency' => 'once'],
                ['institution_id' => $institution->id, 'name' => 'সেশন চার্জ', 'amount' => 1000, 'frequency' => 'yearly'],
            ]);
        });
    }
}
