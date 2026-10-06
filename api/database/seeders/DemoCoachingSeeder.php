<?php

namespace Database\Seeders;

use App\Models\{Batch, FeeCategory, Institution, Program, Student, SubscriptionPlan, ThemePreset, User};
use App\Services\{EnrollmentService, ThemeService};
use App\Support\{Tenancy, TenantBulk};
use Illuminate\Database\Seeder;

// docs/database/seeders.md "DemoCoachingSeeder": two courses, eight students, the first three in BOTH batches
class DemoCoachingSeeder extends Seeder
{
    public function run(): void
    {
        $inst = (new Institution)->forceFill([
            'name' => 'আলোকিত কোচিং সেন্টার', 'slug' => 'alokito-coaching', 'institution_type' => 'coaching',
            'phone' => '01811111111', 'address' => 'কান্দিরপাড়, কুমিল্লা',
            'subscription_plan_id' => SubscriptionPlan::where('name', 'Coaching')->value('id'),
            'subscription_expires_at' => now()->addYear(), 'status' => 'active', 'onboarding_completed' => true,
            'sms_sender_id' => 'ALOKITO', 'sms_sender_status' => 'approved',
            'settings' => ['platform_collect' => true, 'public_site' => ['enabled' => true, 'admission_open' => true,
                'headline' => 'ভর্তি চলছে — HSC ২০২৭ ব্যাচ', 'about' => 'কুমিল্লার অভিজ্ঞ শিক্ষকদের তত্ত্বাবধানে HSC প্রস্তুতি।',
                'contact' => ['phone' => '01811111111', 'address' => 'কান্দিরপাড়, কুমিল্লা']]],
        ]);
        $inst->save();

        Tenancy::as($inst, function (Institution $inst) {
            app(ThemeService::class)->applyPreset($inst, ThemePreset::where('key', 'modern-mint')->firstOrFail());

            User::create(['institution_id' => $inst->id, 'name' => 'পরিচালক', 'phone' => '01811111111',
                'email' => 'admin@alokito.test', 'password' => 'Coaching@1234', 'role' => 'admin']);

            $physics = Program::create(['name' => 'HSC Physics', 'duration_months' => 12]);
            $math    = Program::create(['name' => 'HSC Higher Math', 'duration_months' => 12]);
            $b1 = Batch::create(['program_id' => $physics->id, 'name' => 'শনি-সোম-বুধ বিকাল ৪টা', 'monthly_fee' => 1000, 'max_capacity' => 30,
                'schedule' => [['day' => 'sat', 'start' => '16:00', 'end' => '17:30'], ['day' => 'mon', 'start' => '16:00', 'end' => '17:30'], ['day' => 'wed', 'start' => '16:00', 'end' => '17:30']]]);
            $b2 = Batch::create(['program_id' => $math->id, 'name' => 'রবি-মঙ্গল-বৃহঃ বিকাল ৫টা', 'monthly_fee' => 1200, 'max_capacity' => 30,
                'schedule' => [['day' => 'sun', 'start' => '17:00', 'end' => '18:30'], ['day' => 'tue', 'start' => '17:00', 'end' => '18:30'], ['day' => 'thu', 'start' => '17:00', 'end' => '18:30']]]);
            TenantBulk::insert(FeeCategory::class, [
                ['institution_id' => $inst->id, 'name' => 'মাসিক ফি', 'amount' => 1000, 'frequency' => 'monthly'],
                ['institution_id' => $inst->id, 'name' => 'ভর্তি ফি', 'amount' => 500, 'frequency' => 'once'],
            ]);

            $svc = app(EnrollmentService::class);
            for ($i = 1; $i <= 8; $i++) {
                // Spike S4 finding: the spec seeds no student user, but a student's name lives only on users - same as the school seeder
                $code = sprintf('ALO-2026-%04d', $i);
                $u = User::create(['institution_id' => $inst->id, 'name' => "শিক্ষার্থী $i", 'username' => $code, 'password' => $code, 'role' => 'student', 'must_change_password' => true]);
                $st = Student::create(['user_id' => $u->id, 'student_id' => $code, 'guardian_phone' => sprintf('018200000%02d', $i),
                    'studying_at' => 'কুমিল্লা ভিক্টোরিয়া সরকারি কলেজ', 'admission_date' => now()->subMonth(), 'status' => 'active']);
                $svc->enroll($st, $b1, $i === 1 ? ['fee_override' => 800] : []);
                if ($i <= 3) $svc->enroll($st, $b2);
            }
        });
    }
}
