# Institution Types, Terminology & Module Gating (Revision 6)

## Overview
প্ল্যাটফর্মটি একটিই codebase, কিন্তু চার ধরনের tenant চালায়। প্রতিটি `institutions` row-এর `institution_type` তিনটি বিষয় নিয়ন্ত্রণ করে: (১) কোন module চালু, (২) UI-তে কোন শব্দ দেখাবে, (৩) onboarding-এ কী default তৈরি হবে। Type অনুযায়ী আলাদা controller, আলাদা table বা আলাদা page বানানো **নিষেধ** — পার্থক্য আসবে শুধু এই ফাইলের config থেকে।

| institution_type | Who | Structure | Default Layout |
|---|---|---|---|
| `school` | স্কুল (প্রাথমিক–মাধ্যমিক), মাদ্রাসা | Class → Section | `sidebar-classic` |
| `college` | কলেজ (একাদশ–দ্বাদশ, ডিগ্রি) | Class+Group → Section | `sidebar-classic` |
| `coaching` | কোচিং সেন্টার | Course → Batch | `sidebar-mini` |
| `private_batch` | একজন শিক্ষকের প্রাইভেট ব্যাচ | Batch (একটি default program) | `mobile-compact` |

`institution_type` signup-এ একবার নির্বাচন হয়। পরে শুধু Super Admin বদলাতে পারে (`PUT /super/institutions/{id}`), Institution Admin পারে না।

---

## Single Source of Config — config/institution_types.php
এই একটি ফাইলই backend ও frontend উভয়ের truth। Frontend এটি `GET /api/v1/bootstrap` থেকে পায় (নিচে দেখুন) — frontend-এ এই তথ্যের দ্বিতীয় কপি hardcode করা যাবে না।

```php
<?php
// config/institution_types.php   (R12: + a top-level 'opt_in' => ['hifz', 'donations'] key next to the four type entries)   (Revision 9: every label/term has bn + en + ar; Arabic is a DRAFT - docs/I18N.md section 10)
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
            'leads','online_payment','public_site','question_bank','quiz'],
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
            'ai_assistant','cpd','multi_branch','leads','online_payment','public_site','question_bank','quiz'],
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
        'modules' => ['students','enrollments','attendance','fees','exams','cashbook','support','syllabus','data_migration','accounting','inventory','attendance_devices','risk_alerts','admission_cycle','result_sheets','student_leave','hr_payroll','teacher_attendance','donations','sms','notices','reports',
            'expenses','routine','homework','id_cards','leads','teacher_payouts','merit_list',
            'online_class','online_quiz','fee_installment','analytics','ai_assistant','multi_branch',
            'online_payment','public_site','question_bank','quiz'],
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
            'online_payment','public_site','question_bank','quiz'],   // public_site default OFF for this type; turning it on also enables 'leads' (docs/modules/public-website.md)
        'onboarding' => ['public_site' => false, 'programs' => 'default_general', 'batches' => [], 'fee_categories' => ['মাসিক ফি']],
    ],
];
```

**Plan-gated module** হলো সেগুলোই যাদের key plan-এর `features` JSON-এ আছে (`docs/database/seeders.md` → PlanSeeder): `hostel, transport, library, hr_payroll, online_class, online_quiz, scholarships, alumni, fee_installment, multi_branch`। এগুলো চালু হতে type **এবং** plan — দুটোরই অনুমতি লাগে। `features`-এ যে module-এর key নেই (যেমন `students`, `attendance`, `leads`, `behavior`, `events`) সেটি শুধু type অনুমতি দিলেই চালু। খরচ-সংবেদনশীল চারটি (`ai_assistant`, `analytics`, `gps`, `cpd`) PlanSeeder-এ plan-gated: Pro-তে `analytics` ও `cpd`, Enterprise-এ সব; Super Admin → Plans থেকে বদলানো যায়। `custom_branding, custom_subdomain, custom_domain, white_label, whatsapp, two_factor` module নয়, feature flag — এগুলো `ModuleGate::feature()` দিয়ে চেক হয়।

---

## Module Gate — One Function, Used Everywhere
```php
<?php
// app/Services/ModuleGate.php
namespace App\Services;

use App\Models\Institution;

class ModuleGate
{
    public function allows(Institution $institution, string $module): bool
    {
        // 0. (R16) RELEASE GATE: a module this build has not shipped is off for EVERYONE - a Super Admin override cannot switch on code that does not exist.
        //    config/release.php is the only place that lists what the current release contains (source of truth: docs/release/r1-scope.json).
        if (!in_array($module, config('release.modules', []), true)) return false;

        // 1. Super Admin per-institution override always wins
        $override = $institution->enabled_modules[$module] ?? null;
        if ($override !== null) return (bool) $override;

        // 2. Institution type must include the module
        $typeModules = config("institution_types.{$institution->institution_type}.modules", []);
        if (!in_array($module, $typeModules, true)) return false;

        // 2b. (R12) OPT-IN modules (config 'institution_types.opt_in', e.g. hifz, donations) are off until the INSTITUTION turns them on
        //     (Settings, or the madrasa preset): institutions.settings.opt_in_modules. The type check above still applies - an institution
        //     cannot opt in to a module its type does not include. Only the Super Admin override (step 1) can bypass this.
        if (in_array($module, config('institution_types.opt_in', []), true)
            && !in_array($module, $institution->settings['opt_in_modules'] ?? [], true)) return false;

        // 3. Plan gate applies only when the plan's features JSON has this key
        $features = $institution->plan?->features ?? [];
        return array_key_exists($module, $features) ? (bool) $features[$module] : true;
    }

    /** Non-module plan flags: custom_branding, custom_domain, custom_subdomain, white_label, whatsapp, two_factor */
    public function feature(Institution $institution, string $flag): bool
    {
        $override = $institution->enabled_modules[$flag] ?? null;
        if ($override !== null) return (bool) $override;
        return (bool) ($institution->plan?->features[$flag] ?? false);
    }

    /** List sent to the frontend in /bootstrap */
    public function enabledModules(Institution $institution): array
    {
        $all = collect(config('institution_types'))->pluck('modules')->flatten()->unique();
        return $all->filter(fn ($m) => $this->allows($institution, $m))->values()->all();
    }
}
```
- Route: `Route::middleware('module:hostel')` — `ModuleMiddleware` `ModuleGate::allows()` call করে; false হলে: type-এ module না থাকলে `403 { error: "module_disabled" }`, plan-এর কারণে হলে `403 { error: "feature_not_available", feature, upgrade_to }` (frontend upgrade modal খোলে — `docs/templates/react-core-files.md`-এর axios interceptor)। Feature flag-এর জন্য `Route::middleware('feature:custom_domain')` → false হলে `403 { error: "feature_not_available" }`।
- `SubscriptionCheck` middleware-এর আগের `!$plan->features['hostel']` ধরনের সব চেক এই gate দিয়ে প্রতিস্থাপিত।
- Frontend: `useModules().has('hostel')` — menu item, route ও button লুকাতে। Backend চেক সবসময় বাধ্যতামূলক; frontend চেক শুধু UX।

---

## Terminology — No Hardcoded "Class / Section"
UI, PDF, SMS, Excel header — কোথাও "Class", "Section", "শ্রেণি", "শাখা", "Batch", "Course" সরাসরি লেখা যাবে না।

```php
// app/Support/Terms.php — backend (PDF, SMS, Excel, API messages)
function term(string $key, ?string $locale = null): string
{
    $institution = app('currentInstitution');
    $locale ??= app()->getLocale();                       // 'bn' default
    return $institution->terminology[$key][$locale]        // 1. institution override
        ?? config("institution_types.{$institution->institution_type}.terms.{$key}.{$locale}")  // 2. type default
        ?? $key;
}
```
```javascript
// src/hooks/useTerms.js — frontend
import { useInstitutionStore } from '../store/institutionStore'

export function useTerms() {
  const terms  = useInstitutionStore(s => s.terms)     // merged map from /bootstrap
  const locale = useInstitutionStore(s => s.locale)    // 'bn' | 'en'
  return (key) => terms?.[key]?.[locale] ?? key
}

// usage:  const t = useTerms();  <label>{t('batch')}</label>   → "শাখা" | "ব্যাচ"
```
Institution Admin `Settings → Terminology` পেজ থেকে নিজের label বদলাতে পারে (যেমন মাদ্রাসা `program` = "জামাত") — সেটি `institutions.terminology` JSON-এ যায়।

---

## Bootstrap Endpoint (Frontend Loads This Once Per Session)
`GET /api/v1/bootstrap` — public (pre-auth), host থেকে tenant resolve করে।

```json
{
  "institution": { "id": 12, "name": "…", "slug": "…", "institution_type": "coaching", "status": "active" },
  "terms":   { "program": {"bn":"কোর্স","en":"Course","ar":"الدورة"}, "batch": {"bn":"ব্যাচ","en":"Batch","ar":"الدفعة"}, "…": {} },
  "locales": { "default": "bn", "enabled": ["bn","en"], "dir": {"bn":"ltr","en":"ltr","ar":"rtl"} },
  "modules": ["students","enrollments","attendance","fees","exams","sms","leads","teacher_payouts"],
  "roles":   ["admin","teacher","student","parent","accountant"],
  "theme":   { "layout_key": "sidebar-mini", "primary_color": "#0F766E", "tokens": {}, "logo_url": null },
  "plan":    { "name": "Coaching", "white_label": false, "features": { "online_quiz": true, "custom_branding": false } },
  "settings": { "use_programs": true, "student_portal": true, "use_gpa": false, "fee_proration": "none", "public_site": { "enabled": true } },   // allow-list only — docs/modules/public-website.md "Bootstrap Whitelist"
  "is_central": false
}
```
Central host-এ (`admin.schoolapp.com`) response: `{ "is_central": true, "theme": <platform default> }`। `theme` অংশের পূর্ণ schema: `docs/THEMING.md`। আগের `GET /theme/public` endpoint-ও থাকবে এবং একই `theme` object ফেরত দেবে।

---

## Onboarding Defaults Per Type
`OnboardingService::applyDefaults(Institution $i)` signup-এর পরপরই চলে। `onboarding.public_site` অনুযায়ী `settings.public_site = { enabled: <bool>, admission_open: true, headline: <প্রতিষ্ঠানের নাম> }` বসায় এবং `settings.platform_collect = true`:

| onboarding.programs | What Is Created |
|---|---|
| `class_1_10` | Program "Class 1"…"Class 10" (`numeric_name` 1–10), প্রতিটিতে Batch "A" |
| `hsc_groups` | Program: "একাদশ - বিজ্ঞান", "একাদশ - মানবিক", "একাদশ - ব্যবসায় শিক্ষা", "দ্বাদশ - …" (৬টি; `numeric_name` 11/12, `group_name` সেট), প্রতিটিতে Batch "A" |
| `none` | কিছু না — wizard-এ Admin নিজের Course ও Batch তৈরি করে |
| `default_general` | একটি Program `name="General"`, `is_default=1`; UI-তে Program লুকানো থাকে |

Wizard-এর ধাপ type অনুযায়ী: `docs/modules/onboarding.md` (Revision 6 section)।

---

## Role Availability
- `config.roles`-এ যে role নেই, সেই role-এর user তৈরি করা যাবে না (validation) এবং তার panel route `404`।
- `private_batch`: মালিক-শিক্ষকই `admin`; `teacher` ও `accountant` role নেই। Student/Parent portal ঐচ্ছিক (Settings toggle `settings.student_portal`, default `false`)।
- `super_admin` কোনো tenant-এর অংশ নয়; শুধু central host `admin.schoolapp.com`-এ login করে।

## Notes / Edge Cases
- **নতুন type যোগ করা:** শুধু `config/institution_types.php`-এ একটি block + ENUM migration। অন্য কোনো ফাইল বদলাতে হলে design ভাঙা হয়েছে।
- **মাদ্রাসা/কিন্ডারগার্টেন:** `school` type + terminology override দিয়ে চলে।
- **Type পরিবর্তন:** Super Admin type বদলালে data মুছে যায় না; শুধু menu/terms বদলায়। `private_batch → coaching` upgrade সবচেয়ে প্রত্যাশিত পথ।
- **Cache:** `/bootstrap` response `bootstrap:{institution_id}` key-তে ১০ মিনিট cache; theme, plan, terminology বা enabled_modules বদলালে invalidate।

## config/release.php (R16) — এই build-এ কী আছে
```php
<?php
// config/release.php - changes with every release; docs/release/r1-scope.json is the source of truth and verify.py keeps them equal
return [
    'id'      => 'R1',                                   // R1 < R1.1 < R2 < R3 ... (menu items marked since:'R2' stay hidden until then)
    'modules' => ['students', 'enrollments', 'attendance', 'fees', 'exams', 'sms', 'reports', 'data_migration', 'question_bank', 'quiz'],
    'import_kinds' => ['students'],                      // data_migration ships in R1 for student import ONLY: ImportController answers 422 `kind_not_available` for any other kind (teachers, fee_history ... are R1.1)
    'roles'   => ['super_admin', 'admin', 'teacher', 'accountant', 'parent', 'content_writer', 'content_moderator', 'student'],     // student: D65 QB.9 (the question-bank portal; the rest of the student panel is R1.1). AuthService answers 403 `role_not_available` for any other role
];
```
`/bootstrap` ফেরত দেয় `release: { id }`; ফ্রন্টএন্ড `release.id`-এর চেয়ে বড় `since` চিহ্নিত মেনু-আইটেম লুকায় (`docs/AUTHORIZATION.md`)। পরীক্ষা: `ReleaseGateTest`।
