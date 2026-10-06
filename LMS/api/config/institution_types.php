<?php

// Single source of truth for institution types (docs/modules/institution-types.md). Arabic strings are a DRAFT (docs/I18N.md section 10).
return [
    'school' => [
        'label'          => ['bn' => 'স্কুল', 'en' => 'School', 'ar' => 'مدرسة'],
        'default_layout' => 'sidebar-classic',
        'default_preset' => 'classic-blue',
        'roles'          => ['admin', 'teacher', 'student', 'parent', 'accountant'],
        'terms' => [
            'institution'   => ['bn' => 'স্কুল',      'en' => 'School', 'ar' => 'المدرسة'],
            'program'       => ['bn' => 'শ্রেণি',     'en' => 'Class', 'ar' => 'الصف'],
            'programs'      => ['bn' => 'শ্রেণিসমূহ', 'en' => 'Classes', 'ar' => 'الصفوف'],
            'batch'         => ['bn' => 'শাখা',       'en' => 'Section', 'ar' => 'الشعبة'],
            'batches'       => ['bn' => 'শাখাসমূহ',   'en' => 'Sections', 'ar' => 'الشعب'],
            'academic_year' => ['bn' => 'শিক্ষাবর্ষ', 'en' => 'Academic Year', 'ar' => 'السنة الدراسية'],
            'enrollment'    => ['bn' => 'ভর্তি',      'en' => 'Admission', 'ar' => 'القبول'],
            'tuition_fee'   => ['bn' => 'মাসিক বেতন', 'en' => 'Monthly Tuition', 'ar' => 'الرسوم الشهرية'],
        ],
        'modules' => ['students','enrollments','attendance','fees','exams','cashbook','support','syllabus','data_migration','accounting','inventory','attendance_devices','risk_alerts','admission_cycle','hifz','donations','result_sheets','period_attendance','substitution','student_leave','sms','notices','reports',
            'expenses','routine','homework','academic_calendar','promotion_tc','id_cards','admit_card',
            'behavior','health','certificates','visitors','events','parent_meeting','teacher_attendance',
            'hr_payroll','library','transport','hostel','online_class','online_quiz','scholarships',
            'alumni','fee_installment','analytics','ai_assistant','gps','cpd','multi_branch',
            'leads','online_payment','public_site'],
        'onboarding' => ['public_site' => true, 'programs' => 'class_1_10', 'batches' => ['A'], 'fee_categories' => ['মাসিক বেতন','পরীক্ষা ফি','সেশন চার্জ']],
    ],

    'college' => [
        'label'          => ['bn' => 'কলেজ', 'en' => 'College', 'ar' => 'كلية'],
        'default_layout' => 'sidebar-classic',
        'default_preset' => 'classic-blue',          // campus-top (topnav) stays available as a token-only preset; it has no themes/ folder yet
        'roles'          => ['admin', 'teacher', 'student', 'parent', 'accountant'],
        'terms' => [
            'institution'   => ['bn' => 'কলেজ',          'en' => 'College', 'ar' => 'الكلية'],
            'program'       => ['bn' => 'শ্রেণি ও বিভাগ', 'en' => 'Class & Group', 'ar' => 'الصف والقسم'],
            'programs'      => ['bn' => 'শ্রেণি ও বিভাগ', 'en' => 'Classes & Groups', 'ar' => 'الصفوف والأقسام'],
            'batch'         => ['bn' => 'শাখা',          'en' => 'Section', 'ar' => 'الشعبة'],
            'batches'       => ['bn' => 'শাখাসমূহ',      'en' => 'Sections', 'ar' => 'الشعب'],
            'academic_year' => ['bn' => 'সেশন',          'en' => 'Session', 'ar' => 'الجلسة'],
            'enrollment'    => ['bn' => 'ভর্তি',         'en' => 'Admission', 'ar' => 'القبول'],
            'tuition_fee'   => ['bn' => 'মাসিক বেতন',    'en' => 'Monthly Tuition', 'ar' => 'الرسوم الشهرية'],
        ],
        // same as school; a college normally has no behaviour log for small children
        'modules' => ['students','enrollments','attendance','fees','exams','cashbook','support','syllabus','data_migration','accounting','inventory','attendance_devices','risk_alerts','admission_cycle','hifz','donations','result_sheets','period_attendance','substitution','student_leave','sms','notices','reports',
            'expenses','routine','homework','academic_calendar','promotion_tc','id_cards','admit_card',
            'certificates','visitors','events','teacher_attendance','hr_payroll','library','transport',
            'hostel','online_class','online_quiz','scholarships','alumni','fee_installment','analytics',
            'ai_assistant','cpd','multi_branch','leads','online_payment','public_site'],
        'onboarding' => ['public_site' => true, 'programs' => 'hsc_groups', 'batches' => ['A'], 'fee_categories' => ['মাসিক বেতন','সেশন ফি','পরীক্ষা ফি']],
    ],

    'coaching' => [
        'label'          => ['bn' => 'কোচিং সেন্টার', 'en' => 'Coaching Center', 'ar' => 'مركز تعليمي'],
        'default_layout' => 'sidebar-mini',
        'default_preset' => 'modern-mint',
        'roles'          => ['admin', 'teacher', 'student', 'parent', 'accountant'],
        'terms' => [
            'institution'   => ['bn' => 'কোচিং',       'en' => 'Coaching', 'ar' => 'المركز التعليمي'],
            'program'       => ['bn' => 'কোর্স',       'en' => 'Course', 'ar' => 'الدورة'],
            'programs'      => ['bn' => 'কোর্সসমূহ',   'en' => 'Courses', 'ar' => 'الدورات'],
            'batch'         => ['bn' => 'ব্যাচ',       'en' => 'Batch', 'ar' => 'الدفعة'],
            'batches'       => ['bn' => 'ব্যাচসমূহ',   'en' => 'Batches', 'ar' => 'الدفعات'],
            'academic_year' => ['bn' => 'সেশন',        'en' => 'Session', 'ar' => 'الجلسة'],
            'enrollment'    => ['bn' => 'ভর্তি',       'en' => 'Enrollment', 'ar' => 'التسجيل'],
            'tuition_fee'   => ['bn' => 'মাসিক ফি',    'en' => 'Monthly Fee', 'ar' => 'الرسوم الشهرية'],
        ],
        'modules' => ['students','enrollments','attendance','fees','exams','cashbook','support','syllabus','data_migration','accounting','inventory','attendance_devices','risk_alerts','admission_cycle','result_sheets','student_leave','hr_payroll','sms','notices','reports',
            'expenses','routine','homework','id_cards','leads','teacher_payouts','merit_list',
            'online_class','online_quiz','fee_installment','analytics','ai_assistant','multi_branch',
            'online_payment','public_site'],
        'onboarding' => ['public_site' => true, 'programs' => 'none', 'batches' => [], 'fee_categories' => ['মাসিক ফি','ভর্তি ফি','কোর্স ফি']],
    ],

    'private_batch' => [
        'label'          => ['bn' => 'প্রাইভেট ব্যাচ', 'en' => 'Private Batch', 'ar' => 'دفعة خاصة'],
        'default_layout' => 'mobile-compact',
        'default_preset' => 'tutor-lite',
        'roles'          => ['admin', 'student', 'parent'],
        'terms' => [
            'institution'   => ['bn' => 'ব্যাচ',       'en' => 'Tuition', 'ar' => 'الدرس الخاص'],
            'program'       => ['bn' => 'বিষয়',       'en' => 'Subject', 'ar' => 'المادة'],
            'programs'      => ['bn' => 'বিষয়সমূহ',   'en' => 'Subjects', 'ar' => 'المواد'],
            'batch'         => ['bn' => 'ব্যাচ',       'en' => 'Batch', 'ar' => 'الدفعة'],
            'batches'       => ['bn' => 'ব্যাচসমূহ',   'en' => 'Batches', 'ar' => 'الدفعات'],
            'academic_year' => ['bn' => 'বছর',         'en' => 'Year', 'ar' => 'السنة'],
            'enrollment'    => ['bn' => 'ভর্তি',       'en' => 'Enrollment', 'ar' => 'التسجيل'],
            'tuition_fee'   => ['bn' => 'মাসিক ফি',    'en' => 'Monthly Fee', 'ar' => 'الرسوم الشهرية'],
        ],
        'modules' => ['students','enrollments','attendance','fees','exams','cashbook','support','syllabus','data_migration','student_leave','sms','notices','reports','expenses',
            'online_payment','public_site'],   // public_site default OFF for this type; turning it on also enables 'leads' (docs/modules/public-website.md)
        'onboarding' => ['public_site' => false, 'programs' => 'default_general', 'batches' => [], 'fee_categories' => ['মাসিক ফি']],
    ],

    // Modules a type may include but an institution must switch on itself (institutions.settings.opt_in_modules)
    'opt_in' => ['hifz', 'donations'],
];
