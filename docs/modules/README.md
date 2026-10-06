# Modules — সূচি

প্রতিটি মডিউল-কী (`ModuleGate`-এর) কোন ফাইলে, কোন Phase-এ। শেষ কলামে চার ধরনে চালু আছে কি (`school · college · coaching · private_batch`; ✓ আছে, – নেই) — উৎস `docs/modules/institution-types.md` কনফিগ। **core** = ধরন অনুমতি দিলেই চালু; **plan** = ধরন *ও* প্ল্যান দুটোই অনুমতি দিলে (`ModuleGate`, D6)।

| কী | কী করে | ফাইল | Phase | ধরন | school·college·coaching·batch |
|---|---|---|---|---|---|
| `students` | ছাত্র, প্রোফাইল, Excel import, সম্মতি | [`student-import.md`](student-import.md), [`academic-structure.md`](academic-structure.md) | Phase 4 · 4.2 | core | ✓✓✓✓ |
| `enrollments` | Program/Batch/Enrollment, EnrollmentService | [`academic-structure.md`](academic-structure.md) | Phase 2 · 2.5 | core | ✓✓✓✓ |
| `attendance` | batch+date হাজিরা, absent SMS | [`academic-structure.md`](academic-structure.md) | Phase 4 · 4.3 | core | ✓✓✓✓ |
| `fees` | ফি-র খাত, due গণনা, এক রসিদে একাধিক লাইন, waiver/late fee | [`fees-advanced.md`](fees-advanced.md), [`online-fee-payment.md`](online-fee-payment.md) | Phase 4 · 4.4 | core | ✓✓✓✓ |
| `exams` | exam_subjects, শতকরা-ভিত্তিক গ্রেড, merit list, marksheet | [`grading.md`](grading.md), [`report-cards.md`](report-cards.md) | Phase 4 · 4.5 | core | ✓✓✓✓ |
| `result_sheets` | ওজনযুক্ত ফাইনাল ফলাফল, Tabulation Sheet | [`academics-advanced.md`](academics-advanced.md) | Phase 6 · 6.6 | core | ✓✓✓– |
| `period_attendance` | Period/বিষয়-ভিত্তিক হাজিরা | [`academics-advanced.md`](academics-advanced.md) | Phase 6 · 6.6 | core | ✓✓–– |
| `substitution` | বদলি শিক্ষক, রুটিন-সংঘর্ষ, স্থির ব্লক | [`academics-advanced.md`](academics-advanced.md) | Phase 6 · 6.6 | core | ✓✓–– |
| `student_leave` | ছাত্র/অভিভাবকের ছুটির আবেদন | [`academics-advanced.md`](academics-advanced.md) | Phase 6 · 6.6 | core | ✓✓✓✓ |
| `support` | প্রতিষ্ঠান→প্ল্যাটফর্ম সাপোর্ট টিকিট (grant-সহ impersonation) | [`platform-ops.md`](platform-ops.md) | Phase 5 · 5.6 | core | ✓✓✓✓ |
| `cashbook` | দৈনিক ক্যাশবুক ও day-end close | [`finance-advanced.md`](finance-advanced.md) | Phase 6 · 6.7 | core | ✓✓✓✓ |
| `data_migration` | পুরনো সিস্টেম থেকে ডেটা আমদানি (dry-run, rollback) | [`data-migration.md`](data-migration.md) | Phase 6 · 6.8 | core | ✓✓✓✓ |
| `admission_cycle` | ভর্তি-চক্র: পরীক্ষা, মেধা/অপেক্ষমাণ তালিকা, যাচাইযোগ্য লটারি | [`admission-cycle.md`](admission-cycle.md) | Phase 6 · 6.9 | core | ✓✓✓– |
| `inventory` | স্টোর/ইনভেন্টরি (moving-average, বিক্রি-রসিদ) | [`inventory.md`](inventory.md) | Phase 7 · #15 | plan | ✓✓✓– |
| `attendance_devices` | RFID/QR/device-ID উপস্থিতি (স্বাক্ষরিত punch, টেমপ্লেট নয়) | [`attendance-devices.md`](attendance-devices.md) | Phase 7 · #16 | plan | ✓✓✓– |
| `accounting` | হিসাব-খাতা: ভাউচার, বাজেট, ব্যাংক মিলান | [`accounting.md`](accounting.md) | Phase 7 · #17 | plan | ✓✓✓– |
| `donations` | দান ও অনুদান (ফান্ড, দাতা, রসিদ) — **opt-in** | [`donations.md`](donations.md) | Phase 7 · #18 | opt-in | ✓✓–– |
| `hifz` | হিফজ ট্র্যাকিং, হিজরি, দ্বিভাষিক নাম, গ্রেড-লেবেল — **opt-in** | [`madrasa.md`](madrasa.md) | Phase 7 · #19 | opt-in | ✓✓–– |
| `syllabus` | সিলেবাস, পাঠ-পরিকল্পনা, কভারেজ | [`syllabus.md`](syllabus.md) | Phase 7 · #20 | core | ✓✓✓✓ |
| `risk_alerts` | সহায়তা-প্রয়োজন ছাত্র-সতর্কতা (নিয়ম-ভিত্তিক) | [`risk-alerts.md`](risk-alerts.md) | Phase 7 · #21 | core | ✓✓✓– |
| `sms` | SMS, sender ID, credit, সম্মতি-নির্ভর | [`notifications.md`](notifications.md) | Phase 4 · 4.6 | core | ✓✓✓✓ |
| `notices` | নোটিশ, in-app নোটিফিকেশন | [`notifications.md`](notifications.md) | Phase 4 · 4.6 | core | ✓✓✓✓ |
| `reports` | রসিদ, marksheet, ID কার্ড, due/collection রিপোর্ট | [`pdf-reports.md`](pdf-reports.md) | Phase 4 · 4.8 | core | ✓✓✓✓ |
| `expenses` | আয়-ব্যয় | [`panels-and-features.md`](panels-and-features.md) | Phase 4 · 4.4 | core | ✓✓✓✓ |
| `id_cards` | ID কার্ড (bulk) | [`pdf-reports.md`](pdf-reports.md), [`extended-features.md`](extended-features.md) | Phase 4 · 4.8 | core | ✓✓✓– |
| `merit_list` | merit list ও ফলাফল SMS | [`coaching-private-batch.md`](coaching-private-batch.md) | Phase 4 · 4.5 / 6.1 | core | ––✓– |
| `online_payment` | অভিভাবকের অনলাইন ফি, settlement; বাংলা QR পরে | [`online-fee-payment.md`](online-fee-payment.md), [`banglaqr-readiness.md`](banglaqr-readiness.md), [`payment-gateways.md`](payment-gateways.md) | Phase 5 · 5.2b | core | ✓✓✓✓ |
| `public_site` | পাবলিক সাইট ও ভর্তি-আবেদন, SEO | [`public-website.md`](public-website.md) | Phase 6 · 6.4 | core | ✓✓✓✓ |
| `leads` | ভর্তি-আবেদন/lead, convert | [`coaching-private-batch.md`](coaching-private-batch.md), [`public-website.md`](public-website.md) | Phase 6 · 6.1 / 6.4 | core | ✓✓✓– |
| `teacher_payouts` | শিক্ষক পেমেন্ট (ক্লাসপ্রতি/শতাংশ) | [`coaching-private-batch.md`](coaching-private-batch.md) | Phase 6 · 6.1 | core | ––✓– |
| `routine` | রুটিন বিল্ডার, শিক্ষক-বিষয় ম্যাট্রিক্স | [`routine.md`](routine.md), [`teacher-subjects.md`](teacher-subjects.md) | Phase 7 · #2 | core | ✓✓✓– |
| `homework` | হোমওয়ার্ক ও জমা | [`extended-features.md`](extended-features.md) | Phase 7 · #3 | core | ✓✓✓– |
| `academic_calendar` | একাডেমিক ক্যালেন্ডার, ছুটি, seat plan | [`academic-calendar.md`](academic-calendar.md) | Phase 7 · #1 | core | ✓✓–– |
| `promotion_tc` | প্রমোশন, TC, সেশন | [`promotion-tc.md`](promotion-tc.md), [`academic-sessions.md`](academic-sessions.md) | Phase 7 · #4 | core | ✓✓–– |
| `admit_card` | প্রবেশপত্র (exam_subjects-এর সময়সূচি থেকে) | [`advanced-features.md`](advanced-features.md) | Phase 7 · #5 | core | ✓✓–– |
| `teacher_attendance` | শিক্ষকের উপস্থিতি | [`hr-payroll.md`](hr-payroll.md) | Phase 7 · #6 | core | ✓✓–– |
| `hr_payroll` | স্টাফ, বেতন-কাঠামো, ইনক্রিমেন্ট/ডিক্রিমেন্ট, বোনাস, অগ্রিম, payroll, payslip, PF | [`staff-payroll.md`](staff-payroll.md), [`hr-payroll.md`](hr-payroll.md) (শুধু ছুটি) | Phase 7 · #6 | plan | ✓✓✓– |
| `fee_installment` | ফি কিস্তি | [`extended-features.md`](extended-features.md) | Phase 7 · #7 | plan | ✓✓✓– |
| `online_quiz` | অনলাইন পরীক্ষা/কুইজ | [`extended-features.md`](extended-features.md) | Phase 7 · #8 | plan | ✓✓✓– |
| `online_class` | অনলাইন ক্লাস (Zoom/Meet লিংক) | [`online-class.md`](online-class.md) | Phase 7 · #9 | plan | ✓✓✓– |
| `library` | লাইব্রেরি | [`library.md`](library.md) | Phase 7 · #10 | plan | ✓✓–– |
| `transport` | পরিবহন, রুট, ভাড়া | [`transport.md`](transport.md) | Phase 7 · #10 | plan | ✓✓–– |
| `hostel` | হোস্টেল | [`hostel.md`](hostel.md) | Phase 7 · #10 | plan | ✓✓–– |
| `behavior` | আচরণ-লগ | [`extended-features.md`](extended-features.md) | Phase 7 · #11 | core | ✓––– |
| `health` | স্বাস্থ্য-রেকর্ড | [`extended-features.md`](extended-features.md) | Phase 7 · #11 | core | ✓––– |
| `certificates` | সনদ জেনারেটর | [`extended-features.md`](extended-features.md) | Phase 7 · #11 | core | ✓✓–– |
| `visitors` | ভিজিটর লগ | [`extended-features.md`](extended-features.md) | Phase 7 · #11 | core | ✓✓–– |
| `parent_meeting` | অভিভাবক সভা | [`extended-features.md`](extended-features.md) | Phase 7 · #11 | core | ✓––– |
| `scholarships` | বৃত্তি | [`advanced-features.md`](advanced-features.md) | Phase 7 · #12 | plan | ✓✓–– |
| `events` | ইভেন্ট ও প্রতিযোগিতা | [`advanced-features.md`](advanced-features.md) | Phase 7 · #12 | core | ✓✓–– |
| `alumni` | প্রাক্তন শিক্ষার্থী | [`extended-features.md`](extended-features.md) | Phase 7 · #12 | plan | ✓✓–– |
| `cpd` | শিক্ষক-প্রশিক্ষণ/CPD | [`advanced-features.md`](advanced-features.md) | Phase 7 · #12 | plan | ✓✓–– |
| `multi_branch` | একাধিক শাখা | [`extended-features.md`](extended-features.md) | Phase 7 · #13 | plan | ✓✓✓– |
| `analytics` | অ্যানালিটিক্স ড্যাশবোর্ড | [`advanced-features.md`](advanced-features.md) | Phase 7 · #14 | plan | ✓✓✓– |
| `ai_assistant` | AI সহকারী (পরে) | [`advanced-features.md`](advanced-features.md) | Phase 10 | plan | ✓✓✓– |
| `gps` | বাস GPS (পরে) | [`advanced-features.md`](advanced-features.md) | Phase 10 | plan | ✓––– |

## মডিউল-কী-হীন (কাঠামো/সেবা) ফাইল
| ফাইল | বিষয় |
|---|---|
| [`communication-plus.md`](communication-plus.md) | SMS টেমপ্লেট/ক্যাম্পেইন/নির্ধারিত/delivery-অবস্থা, জরুরি সতর্কতা, নোটিশ-স্বীকৃতি (বিদ্যমান `sms`, `notices` মডিউলের সম্প্রসারণ) |
| [`quick-wins.md`](quick-wins.md) | EIIN/প্রতিষ্ঠান-পরিচয়, সনদ/TC-তে QR যাচাই, অ্যাক্সেসিবিলিটি মোড, শিফট |
| [`public-website-plus.md`](public-website-plus.md) | গ্যালারি, নিউজ/পেজ, শিক্ষক-প্রোফাইল, ইভেন্ট, অনলাইন আবেদন-ফি (বিদ্যমান `public_site`-এর সম্প্রসারণ) |
| [`institution-types.md`](institution-types.md) | চার ধরন, মডিউল-গেট, শব্দ-কোষ, onboarding ডিফল্ট |
| [`academic-structure.md`](academic-structure.md) | Program/Batch/Enrollment, Targeting Rule, ফি নির্ধারণ |
| [`college.md`](college.md) | Group, ঐচ্ছিক বিষয়, সেশন |
| [`coaching-private-batch.md`](coaching-private-batch.md) | Lead, শিক্ষক-পেমেন্ট, Lite মোড, SMS credit |
| [`subscription.md`](subscription.md) | প্ল্যান, lifecycle, limit |
| [`onboarding.md`](onboarding.md) | ধরনভেদে wizard, signup |
| [`custom-domain.md`](custom-domain.md) | subdomain/কাস্টম ডোমেইন, SSL, DNS, ক্লায়েন্ট-নির্দেশিকা |
| [`institution-branding.md`](institution-branding.md) | লোগো/রঙ (Layer 1) ও audit |
| [`payment-gateways.md`](payment-gateways.md) | subscription payment (SSLCommerz) — platform credential |
| [`banglaqr-readiness.md`](banglaqr-readiness.md) | বাংলা QR: যা এখন বসাতে হবে, ব্যাংককে প্রশ্ন, পরে adapter |
| [`mobile-app.md`](mobile-app.md) | Phase 10: মোবাইল অ্যাপ (পরে) |
| [`panels-and-features.md`](panels-and-features.md) | প্যানেল-ভিত্তিক ফিচার-সারাংশ |
| [`academics-advanced.md`](academics-advanced.md) | ওজনযুক্ত ফলাফল, বকেয়া-আটকানো, period-হাজিরা, বদলি/সংঘর্ষ, ছুটির আবেদন, marks-lock |
| [`staff-payroll.md`](staff-payroll.md) | **বেতনের একমাত্র স্পেক**: কর্মচারী, কাঠামো, ইনক্রিমেন্ট, বোনাস, অগ্রিম, payroll, PF |
| [`../I18N.md`](../I18N.md) | ভাষা (bn/en/ar), RTL, মাদ্রাসা প্রিসেট, SMS-এর ভাষা ও অংশ-গণনা |

## Feature flag (module নয়)
`custom_branding`, `custom_subdomain`, `custom_domain`, `white_label`, `whatsapp`, `two_factor` — `feature:x` middleware; `docs/modules/subscription.md`, `docs/THEMING.md`।

## মডিউল-ডক লেখার/বদলানোর নিয়ম
1. কলাম/টেবিল শুধু `docs/database/schema.sql`-এ (module-ডকে নতুন কলাম আবিষ্কার নয় — D13)।
2. endpoint যোগ হলে `docs/API.md`-এ; route `docs/templates/laravel-core-files.md`-এ।
3. মডিউলের নিজের `module:<key>` middleware, menu-তে `module: '<key>'` (`docs/AUTHORIZATION.md`), এবং `docs/TESTING.md`-এ অন্তত একটি test-নাম।
4. UI ব্যবহার করবে token-class ও `useTerms()` (D5, D11)।

## Opt-in মডিউল (R12)
`hifz`, `donations` — type অনুমতি দিলেও **ডিফল্ট বন্ধ**; প্রতিষ্ঠান `settings.opt_in_modules`-এ (Settings বা মাদ্রাসা-প্রিসেট) চালু করে। `ModuleGate` (`docs/modules/institution-types.md` ধাপ 2b): type-পরীক্ষা এড়ানো যায় না; শুধু Super Admin override (`enabled_modules`) পারে। `config/institution_types.php: opt_in`।
## পরীক্ষা-পাহারা
সব কী-র গেট `ModuleGateContractTest`-এ, সব route `RouteMiddlewareContractTest`-এ (`docs/TESTING.md`)।
