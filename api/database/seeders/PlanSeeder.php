<?php

namespace Database\Seeders;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

// docs/database/seeders.md "PlanSeeder". Prices are starting proposals, editable from Super Admin -> Plans.
// D47: plan limits (max_*) are stored as the spec lists them but must never gate anything (docs/PRICING-MODEL.md).
class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $none = [
            'hostel' => false, 'transport' => false, 'library' => false,
            'hr_payroll' => false, 'inventory' => false, 'attendance_devices' => false, 'accounting' => false, 'online_class' => false, 'online_quiz' => false,
            'white_label' => false, 'custom_domain' => false, 'custom_subdomain' => false,
            'scholarships' => false, 'alumni' => false, 'fee_installment' => false,
            'custom_branding' => false, 'whatsapp' => false, 'two_factor' => false,
            'ai_assistant' => false, 'analytics' => false, 'gps' => false, 'cpd' => false,
            'multi_branch' => false,
        ];

        $plans = [
            ['name' => 'Tutor', 'price' => 299, 'duration_days' => 30, 'max_students' => 100, 'max_teachers' => 1, 'max_sms' => 200, 'max_batches' => 10,
                'institution_type' => 'private_batch', 'features' => $none],
            ['name' => 'Coaching', 'price' => 799, 'duration_days' => 30, 'max_students' => 500, 'max_teachers' => 10, 'max_sms' => 500, 'max_batches' => 40,
                'institution_type' => 'coaching', 'features' => array_merge($none, ['online_quiz' => true, 'fee_installment' => true])],
            ['name' => 'Basic', 'price' => 999, 'duration_days' => 30, 'max_students' => 500, 'max_teachers' => 20, 'max_sms' => 1000, 'max_batches' => -1,
                'institution_type' => null, 'features' => $none],
            ['name' => 'Pro', 'price' => 1999, 'duration_days' => 30, 'max_students' => 2000, 'max_teachers' => 80, 'max_sms' => 5000, 'max_batches' => -1,
                'institution_type' => null, 'features' => array_merge($none, [
                    'transport' => true, 'library' => true, 'hr_payroll' => true, 'inventory' => true, 'attendance_devices' => true, 'accounting' => true,
                    'online_quiz' => true, 'custom_subdomain' => true, 'scholarships' => true, 'alumni' => true, 'fee_installment' => true,
                    'custom_branding' => true, 'whatsapp' => true, 'two_factor' => true, 'analytics' => true, 'cpd' => true,
                ])],
            ['name' => 'Enterprise', 'price' => 4999, 'duration_days' => 30, 'max_students' => -1, 'max_teachers' => -1, 'max_sms' => -1, 'max_batches' => -1,
                'institution_type' => null, 'features' => array_map(fn () => true, $none)],
        ];

        foreach ($plans as $plan) {
            SubscriptionPlan::updateOrCreate(['name' => $plan['name']], $plan);
        }
    }
}
