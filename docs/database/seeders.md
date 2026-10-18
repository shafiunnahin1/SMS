# Seeder Data

## PlanSeeder.php
```php
SubscriptionPlan::insert([
    // R6: type-specific entry plans. Prices are starting proposals — editable from Super Admin → Plans.
    [
        'name'           => 'Tutor',
        'price'          => 299,
        'duration_days'  => 30,
        'max_students'   => 100,
        'max_teachers'   => 1,
        'max_sms'        => 200,
        'max_batches'    => 10,
        'institution_type' => 'private_batch',
        'features'       => json_encode([
            'hostel'=>false,'transport'=>false,'library'=>false,
            'hr_payroll'=>false,'inventory'=>false,'attendance_devices'=>false,'accounting'=>false,'online_class'=>false,'online_quiz'=>false,
            'white_label'=>false,'custom_domain'=>false,'custom_subdomain'=>false,
            'scholarships'=>false,'alumni'=>false,'fee_installment'=>false,
            'custom_branding'=>false,'whatsapp'=>false,'two_factor'=>false,
'ai_assistant'=>false,'analytics'=>false,'gps'=>false,'cpd'=>false,
            'multi_branch'=>false,
        ]),
    ],
    [
        'name'           => 'Coaching',
        'price'          => 799,
        'duration_days'  => 30,
        'max_students'   => 500,
        'max_teachers'   => 10,
        'max_sms'        => 500,
        'max_batches'    => 40,
        'institution_type' => 'coaching',
        'features'       => json_encode([
            'hostel'=>false,'transport'=>false,'library'=>false,
            'hr_payroll'=>false,'inventory'=>false,'attendance_devices'=>false,'accounting'=>false,'online_class'=>false,'online_quiz'=>true,
            'white_label'=>false,'custom_domain'=>false,'custom_subdomain'=>false,
            'scholarships'=>false,'alumni'=>false,'fee_installment'=>true,
            'custom_branding'=>false,'whatsapp'=>false,'two_factor'=>false,
'ai_assistant'=>false,'analytics'=>false,'gps'=>false,'cpd'=>false,
            'multi_branch'=>false,
        ]),
    ],
    [
        'name'           => 'Basic',
        'price'          => 999,
        'duration_days'  => 30,
        'max_students'   => 500,
        'max_teachers'   => 20,
        'max_sms'        => 1000,
        'max_batches'    => -1,
        'institution_type' => null,   // offered to every type
        'features'       => json_encode([
            'hostel'=>false,'transport'=>false,'library'=>false,
            'hr_payroll'=>false,'inventory'=>false,'attendance_devices'=>false,'accounting'=>false,'online_class'=>false,'online_quiz'=>false,
            'white_label'=>false,'custom_domain'=>false,'custom_subdomain'=>false,
            'scholarships'=>false,'alumni'=>false,'fee_installment'=>false,
            'custom_branding'=>false,'whatsapp'=>false,'two_factor'=>false,
'ai_assistant'=>false,'analytics'=>false,'gps'=>false,'cpd'=>false,
            'multi_branch'=>false,
        ]),
    ],
    [
        'name'           => 'Pro',
        'price'          => 1999,
        'duration_days'  => 30,
        'max_students'   => 2000,
        'max_teachers'   => 80,
        'max_sms'        => 5000,
        'max_batches'    => -1,
        'institution_type' => null,   // offered to every type
        'features'       => json_encode([
            'hostel'=>false,'transport'=>true,'library'=>true,
            'hr_payroll'=>true,'inventory'=>true,'attendance_devices'=>true,'accounting'=>true,'online_class'=>false,'online_quiz'=>true,
            'white_label'=>false,'custom_domain'=>false,'custom_subdomain'=>true,
            'scholarships'=>true,'alumni'=>true,'fee_installment'=>true,
            'custom_branding'=>true,'whatsapp'=>true,'two_factor'=>true,
'ai_assistant'=>false,'analytics'=>true,'gps'=>false,'cpd'=>true,
            'multi_branch'=>false,
        ]),
    ],
    [
        'name'           => 'Enterprise',
        'price'          => 4999,
        'duration_days'  => 30,
        'max_students'   => -1,  // unlimited
        'max_teachers'   => -1,
        'max_sms'        => -1,
        'max_batches'    => -1,
        'institution_type' => null,   // offered to every type
        'features'       => json_encode([
            'hostel'=>true,'transport'=>true,'library'=>true,
            'hr_payroll'=>true,'inventory'=>true,'attendance_devices'=>true,'accounting'=>true,'online_class'=>true,'online_quiz'=>true,
            'white_label'=>true,'custom_domain'=>true,'custom_subdomain'=>true,
            'scholarships'=>true,'alumni'=>true,'fee_installment'=>true,
            'custom_branding'=>true,'whatsapp'=>true,'two_factor'=>true,
'ai_assistant'=>true,'analytics'=>true,'gps'=>true,'cpd'=>true,
            'multi_branch'=>true,
        ]),
    ],
]);
```

## SuperAdminSeeder.php
```php
// Super Admin (institution_id = null)
User::create([
    'name'      => 'Super Admin',
    'email'     => 'admin@schoolapp.com',
    'phone'     => '01700000000',
    'password'  => bcrypt('Admin@1234'),
    'role'      => 'super_admin',
    'institution_id' => null,
    'is_active' => true,
]);
```

## DemoInstitutionSeeder.php
```php
// Demo Institution
$plan = SubscriptionPlan::where('name', 'Pro')->first();
$institution = Institution::create([
    'name'                     => 'ধানমন্ডি আদর্শ উচ্চ বিদ্যালয়',
    'slug'                     => 'dhanmondi-school',
    'email'                    => 'info@dhanmondischool.edu.bd',
    'phone'                    => '01711111111',
    'address'                  => 'ধানমন্ডি, ঢাকা-১২০৫',
    'institution_type'         => 'school',
    'onboarding_completed'     => true,
    'subscription_plan_id'     => $plan->id,
    'subscription_expires_at'  => now()->addYear(),
    'status'                   => 'active',
]);

// R6: bind the tenant so BelongsToInstitution, term() and EnrollmentService work inside seeders
app()->instance('currentInstitution', $institution);
app(\App\Services\ThemeService::class)->applyPreset($institution, ThemePreset::where('key', 'classic-blue')->first(), 1);

// Institution Admin
User::create([
    'institution_id' => $institution->id,
    'name'      => 'মো: আবদুল করিম',
    'email'     => 'principal@dhanmondischool.edu.bd',
    'password'  => bcrypt('School@1234'),
    'role'      => 'admin',
]);

// Classes: Class 1 to Class 10
for ($i = 1; $i <= 10; $i++) {
    $class = Program::create([
        'institution_id'    => $institution->id,
        'name'         => "Class $i",
        'numeric_name' => $i,
    ]);
    // Batches A, B per class
    foreach (['A', 'B'] as $sec) {
        Batch::create(['institution_id'=>$institution->id, 'program_id'=>$class->id, 'name'=>$sec]);
    }
}

// Fee Categories
\App\Support\TenantBulk::insert(FeeCategory::class, [
    ['institution_id'=>$institution->id, 'name'=>'মাসিক বেতন', 'amount'=>500, 'frequency'=>'monthly'],
    ['institution_id'=>$institution->id, 'name'=>'পরীক্ষা ফি', 'amount'=>200, 'frequency'=>'once'],
    ['institution_id'=>$institution->id, 'name'=>'সেশন চার্জ', 'amount'=>1000, 'frequency'=>'yearly'],
]);
```

---

## DemoDataSeeder.php (Demo Students, Teachers, Fees)
```php
class DemoDataSeeder extends Seeder {
    public function run(): void {
        $institution = Institution::where('slug', 'dhanmondi-school')->first();
        $class10 = Program::where('institution_id', $institution->id)
                             ->where('numeric_name', 10)->first();
        $batchA = Batch::where('program_id', $class10->id)
                            ->where('name', 'A')->first();
        app()->instance('currentInstitution', $institution);   // R6

        // Demo Teacher
        $teacherUser = User::create([
            'institution_id' => $institution->id,
            'name'      => 'মো: করিম উদ্দিন',
            'email'     => 'teacher@dhanmondischool.edu.bd',
            'phone'     => '01722222222',
            'password'  => bcrypt('Teacher@1234'),
            'role'      => 'teacher',
        ]);
        $teacher = Teacher::create([
            'institution_id'   => $institution->id,
            'user_id'     => $teacherUser->id,
            'employee_id' => 'EMP-2025-0001',
            'designation' => 'সহকারী শিক্ষক',
            'salary'      => 15000,
        ]);

        // Demo Students (10 of them)
        for ($i = 1; $i <= 10; $i++) {
            $code = sprintf('DHA-2025-%04d', $i);
            $studentUser = User::create([
                'institution_id' => $institution->id,
                'name'      => "ছাত্র $i",
                'email'     => "student{$i}@dhanmondischool.edu.bd",
                'username'  => $code,                 // R6: students log in with their student ID
                'phone'     => null,
                'password'  => bcrypt($code),
                'role'      => 'student',
                'must_change_password' => 1,
            ]);
            // R6: never write program_id / batch_id / roll_no on students directly
            $student = Student::create([
                'institution_id' => $institution->id,
                'user_id'       => $studentUser->id,
                'student_id'    => $code,
                'guardian_phone'=> sprintf('019000000%02d', $i),
                'father_name'   => "অভিভাবক $i",
                'admission_date'=> now()->subMonths(3),
                'status'        => 'active',
            ]);
            app(\App\Services\EnrollmentService::class)->enroll($student, $batchA, ['roll_no' => $i]);
        }

        // Demo Accountant
        User::create([
            'institution_id' => $institution->id,
            'name'      => 'হিসাবরক্ষক',
            'email'     => 'accountant@dhanmondischool.edu.bd',
            'phone'     => '01733333333',
            'password'  => bcrypt('Accountant@1234'),
            'role'      => 'accountant',
        ]);

        // Academic Year
        AcademicYear::create([
            'institution_id'  => $institution->id,
            'name'       => '2025',
            'start_date' => '2025-01-01',
            'end_date'   => '2025-12-31',
            'is_current' => true,
        ]);

        // Subjects for Class 10
        $subjects = ['বাংলা','ইংরেজি','গণিত','পদার্থবিজ্ঞান','রসায়ন','জীববিজ্ঞান','ইতিহাস'];
        foreach ($subjects as $name) {
            Subject::create([
                'institution_id'     => $institution->id,
                'program_id' => $class10->id,
                'teacher_id'    => $teacher->id,
                'name'          => $name,
                'full_marks'    => 100,
                'pass_marks'    => 33,
            ]);
        }
    }
}
```

## Demo Credentials Summary
```
Super Admin:  admin@schoolapp.com       / Admin@1234
Institution Admin: principal@dhanmondischool.edu.bd / School@1234
Teacher:      teacher@dhanmondischool.edu.bd   / Teacher@1234
Accountant:   accountant@dhanmondischool.edu.bd/ Accountant@1234
Student 1:    DHA-2025-0001 (student ID)        / DHA-2025-0001
              (প্রথম লগিনে পাসওয়ার্ড পরিবর্তন করতে হবে)

Access URL (dev): http://dhanmondi-school.lvh.me:5173   (Super Admin: http://admin.lvh.me:5173)
```

---

## Tenant binding in seeders (Revision 7)
Seeder-ই একমাত্র জায়গা যেখানে অ্যাপ-কোডের বাইরে `app()->instance('currentInstitution', …)` চলে (একবারের CLI প্রক্রিয়া, `tests/Architecture/tenancy-allowlist.php`-এ অনুমোদিত)। প্রতিটি seeder শুরুতে নিজের প্রতিষ্ঠান বাঁধে এবং শেষে `app()->forgetInstance('currentInstitution')` করে — যাতে পরের seeder আগের প্রতিষ্ঠানের ঘাড়ে চড়ে না যায়।

---

## Revision 6 — Additional Seeders

### Seeder Order (Final)
```bash
php artisan db:seed --class=PlanSeeder            # 5 plans (Tutor, Coaching, Basic, Pro, Enterprise)
php artisan db:seed --class=ThemePresetSeeder     # 6 presets — must run BEFORE any institution is created
php artisan db:seed --class=SuperAdminSeeder
php artisan db:seed --class=DemoInstitutionSeeder # school
php artisan db:seed --class=DemoDataSeeder
php artisan db:seed --class=DemoCoachingSeeder    # coaching
php artisan db:seed --class=DemoTutorSeeder       # private_batch
```

### ThemePresetSeeder.php
`docs/THEMING.md`-এর "Seeded Presets" টেবিলের ছয়টি row হুবহু insert করুন (`tokens` কলামে শুধু non-default key গুলো JSON হিসেবে; `allowed_types` "all" মানে `null`)। `updateOrCreate(['key' => …])` ব্যবহার করুন যাতে seeder বারবার চালানো যায়।

### DemoCoachingSeeder.php
```php
$plan = SubscriptionPlan::where('name', 'Coaching')->first();
$inst = Institution::create([
    'name' => 'আলোকিত কোচিং সেন্টার', 'slug' => 'alokito-coaching', 'institution_type' => 'coaching',
    'phone' => '01811111111', 'address' => 'কান্দিরপাড়, কুমিল্লা', 'subscription_plan_id' => $plan->id,
    'subscription_expires_at' => now()->addYear(), 'status' => 'active', 'onboarding_completed' => true,
    'sms_sender_id' => 'ALOKITO', 'sms_sender_status' => 'approved',     // R6.2 demo: own masking ID
    'settings' => ['platform_collect' => true, 'public_site' => ['enabled' => true, 'admission_open' => true,
        'headline' => 'ভর্তি চলছে — HSC ২০২৭ ব্যাচ', 'about' => 'কুমিল্লার অভিজ্ঞ শিক্ষকদের তত্ত্বাবধানে HSC প্রস্তুতি।',
        'contact' => ['phone' => '01811111111', 'address' => 'কান্দিরপাড়, কুমিল্লা']]],
]);
app()->instance('currentInstitution', $inst);
app(\App\Services\ThemeService::class)->applyPreset($inst, ThemePreset::where('key', 'modern-mint')->first(), 1);

User::create(['institution_id' => $inst->id, 'name' => 'পরিচালক', 'phone' => '01811111111',
    'email' => 'admin@alokito.test', 'password' => bcrypt('Coaching@1234'), 'role' => 'admin']);

$physics = Program::create(['institution_id' => $inst->id, 'name' => 'HSC Physics', 'duration_months' => 12]);
$math    = Program::create(['institution_id' => $inst->id, 'name' => 'HSC Higher Math', 'duration_months' => 12]);
$b1 = Batch::create(['institution_id' => $inst->id, 'program_id' => $physics->id, 'name' => 'শনি-সোম-বুধ বিকাল ৪টা',
    'monthly_fee' => 1000, 'max_capacity' => 30,
    'schedule' => [['day'=>'sat','start'=>'16:00','end'=>'17:30'],['day'=>'mon','start'=>'16:00','end'=>'17:30'],['day'=>'wed','start'=>'16:00','end'=>'17:30']]]);
$b2 = Batch::create(['institution_id' => $inst->id, 'program_id' => $math->id, 'name' => 'রবি-মঙ্গল-বৃহঃ বিকাল ৫টা',
    'monthly_fee' => 1200, 'max_capacity' => 30,
    'schedule' => [['day'=>'sun','start'=>'17:00','end'=>'18:30'],['day'=>'tue','start'=>'17:00','end'=>'18:30'],['day'=>'thu','start'=>'17:00','end'=>'18:30']]]);
\App\Support\TenantBulk::insert(FeeCategory::class, [
    ['institution_id' => $inst->id, 'name' => 'মাসিক ফি', 'amount' => 1000, 'frequency' => 'monthly'],
    ['institution_id' => $inst->id, 'name' => 'ভর্তি ফি', 'amount' => 500,  'frequency' => 'once'],
]);

// 8 students; the first 3 are in BOTH batches (multi-enrollment), #1 has a negotiated fee
$svc = app(\App\Services\EnrollmentService::class);
for ($i = 1; $i <= 8; $i++) {
    $st = Student::create(['institution_id' => $inst->id, 'student_id' => sprintf('ALO-2026-%04d', $i),
        'guardian_phone' => sprintf('018200000%02d', $i), 'studying_at' => 'কুমিল্লা ভিক্টোরিয়া সরকারি কলেজ',
        'admission_date' => now()->subMonth(), 'status' => 'active']);
    $svc->enroll($st, $b1, $i === 1 ? ['fee_override' => 800] : []);
    if ($i <= 3) $svc->enroll($st, $b2);
}
```

### DemoTutorSeeder.php
```php
$plan = SubscriptionPlan::where('name', 'Tutor')->first();
$inst = Institution::create([
    'name' => 'রহিম স্যারের গণিত ব্যাচ', 'slug' => 'rahim-sir', 'institution_type' => 'private_batch',
    'phone' => '01911111111', 'subscription_plan_id' => $plan->id,
    'subscription_expires_at' => now()->addYear(), 'status' => 'active', 'onboarding_completed' => true,
    'settings' => ['use_programs' => false, 'student_portal' => false, 'fee_proration' => 'none'],
]);
app()->instance('currentInstitution', $inst);
app(\App\Services\ThemeService::class)->applyPreset($inst, ThemePreset::where('key', 'tutor-lite')->first(), 1);

User::create(['institution_id' => $inst->id, 'name' => 'মো: রহিম', 'phone' => '01911111111',
    'password' => bcrypt('Tutor@1234'), 'role' => 'admin']);          // no email — phone login

$general = Program::create(['institution_id' => $inst->id, 'name' => 'General', 'is_default' => 1]);
$batch = Batch::create(['institution_id' => $inst->id, 'program_id' => $general->id, 'name' => 'Class 9 সকাল',
    'monthly_fee' => 800, 'schedule' => [['day'=>'sat','start'=>'07:00','end'=>'08:00'],['day'=>'tue','start'=>'07:00','end'=>'08:00']]]);
FeeCategory::create(['institution_id' => $inst->id, 'name' => 'মাসিক ফি', 'amount' => 800, 'frequency' => 'monthly']);
for ($i = 1; $i <= 5; $i++) {
    $st = Student::create(['institution_id' => $inst->id, 'student_id' => sprintf('RS-%04d', $i),
        'guardian_phone' => sprintf('019200000%02d', $i), 'admission_date' => now()->subMonth(), 'status' => 'active']);
    app(\App\Services\EnrollmentService::class)->enroll($st, $batch);
}
```

### Demo Credentials (Revision 6 additions)
```
Coaching Admin:  01811111111 (phone)  / Coaching@1234   → http://alokito-coaching.lvh.me:5173
Tutor Admin:     01911111111 (phone)  / Tutor@1234      → http://rahim-sir.lvh.me:5173
Super Admin:     admin@schoolapp.com  / Admin@1234      → http://admin.lvh.me:5173
```
