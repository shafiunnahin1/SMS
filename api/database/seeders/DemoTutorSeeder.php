<?php

namespace Database\Seeders;

use App\Models\{Batch, FeeCategory, Institution, Program, Student, SubscriptionPlan, ThemePreset, User};
use App\Services\{EnrollmentService, ThemeService};
use App\Support\Tenancy;
use Illuminate\Database\Seeder;

// docs/database/seeders.md "DemoTutorSeeder": a one-teacher private batch; the admin logs in with a phone (no email)
class DemoTutorSeeder extends Seeder
{
    public function run(): void
    {
        $inst = (new Institution)->forceFill([
            'name' => 'রহিম স্যারের গণিত ব্যাচ', 'slug' => 'rahim-sir', 'institution_type' => 'private_batch', 'phone' => '01911111111',
            'subscription_plan_id' => SubscriptionPlan::where('name', 'Tutor')->value('id'),
            'subscription_expires_at' => now()->addYear(), 'status' => 'active', 'onboarding_completed' => true,
            'settings' => ['use_programs' => false, 'student_portal' => false, 'fee_proration' => 'none'],
        ]);
        $inst->save();

        Tenancy::as($inst, function (Institution $inst) {
            app(ThemeService::class)->applyPreset($inst, ThemePreset::where('key', 'tutor-lite')->firstOrFail());

            User::create(['institution_id' => $inst->id, 'name' => 'মো: রহিম', 'phone' => '01911111111', 'password' => 'Tutor@1234', 'role' => 'admin']);

            $general = Program::create(['name' => 'General', 'is_default' => true]);
            $batch = Batch::create(['program_id' => $general->id, 'name' => 'Class 9 সকাল', 'monthly_fee' => 800,
                'schedule' => [['day' => 'sat', 'start' => '07:00', 'end' => '08:00'], ['day' => 'tue', 'start' => '07:00', 'end' => '08:00']]]);
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 800, 'frequency' => 'monthly']);

            for ($i = 1; $i <= 5; $i++) {
                $code = sprintf('RS-%04d', $i);   // Spike S4 finding: a student's name lives only on users (as the school seeder)
                $u = User::create(['institution_id' => $inst->id, 'name' => "ছাত্র $i", 'username' => $code, 'password' => $code, 'role' => 'student', 'must_change_password' => true]);
                $st = Student::create(['user_id' => $u->id, 'student_id' => $code, 'guardian_phone' => sprintf('019200000%02d', $i),
                    'admission_date' => now()->subMonth(), 'status' => 'active']);
                app(EnrollmentService::class)->enroll($st, $batch);
            }
        });
    }
}
