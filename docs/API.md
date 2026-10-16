# API Endpoint List

Base URL: https://{tenant-host}/api/v1   (tenant-host = {slug}.schoolapp.com or an active custom domain; Super Admin = admin.schoolapp.com)
Auth: Bearer Token (Sanctum)
Tenant: resolved from the request Host (no tenant header). Base path is relative: /api/v1

## Auth Endpoints (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/login | লগিন — সব রোল |
| POST | /auth/logout | লগআউট |
| POST | /auth/forgot-password | পাসওয়ার্ড রিসেট ইমেইল |
| POST | /auth/reset-password | নতুন পাসওয়ার্ড সেট |
| GET | /auth/me | লগইন ইউজারের তথ্য |

## Super Admin (role: super_admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /super/dashboard | স্ট্যাটস ও চার্ট ডেটা |
| GET | /super/institutions | সব স্কুল লিস্ট |
| POST | /super/institutions | নতুন স্কুল যোগ |
| GET | /super/institutions/{id} | স্কুল ডিটেইল |
| PUT | /super/institutions/{id} | স্কুল আপডেট |
| PATCH | /super/institutions/{id}/toggle | Active/Inactive টগল |
| GET | /super/plans | প্ল্যান লিস্ট |
| POST | /super/plans | নতুন প্ল্যান তৈরি |
| PUT | /super/plans/{id} | প্ল্যান আপডেট |
| GET | /super/payments | পেমেন্ট লিস্ট |
| GET | /super/reports/revenue | রেভিনিউ রিপোর্ট |

## Students (role: admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /students | ছাত্র লিস্ট (ফিল্টার সহ) |
| POST | /students | নতুন ছাত্র ভর্তি |
| GET | /students/{id} | ছাত্রের প্রোফাইল |
| PUT | /students/{id} | ছাত্র তথ্য আপডেট |
| DELETE | /students/{id} | ছাত্র নিষ্ক্রিয় করা |
| POST | /students/{id}/transfer | TC ইস্যু |
| POST | /students/promote | বাল্ক প্রমোশন |
| GET | /students/{id}/card | আইডি কার্ড PDF |

## Academic (role: admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | /programs | ক্লাস CRUD |
| GET/POST/PUT/DELETE | /batches | সেকশন CRUD |
| GET/POST/PUT/DELETE | /subjects | বিষয় CRUD |
| GET/POST/PUT/DELETE | /routines | রুটিন CRUD |

## Attendance (role: admin, teacher)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /attendance | উপস্থিতি লিস্ট |
| POST | /attendance | বাল্ক উপস্থিতি এন্ট্রি |
| PUT | /attendance/{id} | উপস্থিতি সংশোধন |
| GET | /attendance/report | মাসিক রিপোর্ট |
| GET | /attendance/summary/{studentId} | ছাত্রের সারসংক্ষেপ |

## Exam & Result (role: admin, teacher)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /exams | পরীক্ষা লিস্ট |
| POST | /exams | নতুন পরীক্ষা |
| PUT | /exams/{id} | পরীক্ষা আপডেট |
| POST | /exams/{id}/publish | রেজাল্ট পাবলিশ |
| GET | /results | রেজাল্ট লিস্ট |
| POST | /results/bulk | বাল্ক মার্ক এন্ট্রি |
| GET | /results/marksheet/{studentId} | মার্কশিট PDF |

## Fees (role: admin, accountant)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT | /fees/categories | ফি ক্যাটাগরি CRUD |
| GET | /fees/payments | পেমেন্ট লিস্ট |
| POST | /fees/collect | ফি কালেকশন |
| GET | /fees/dues | বকেয়া লিস্ট |
| GET | /fees/receipt/{paymentId} | রসিদ PDF |
| GET | /fees/report | ফি রিপোর্ট |

## Expenses (role: admin, accountant)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /expenses | Expense list (category, date range filter) |
| POST | /expenses | Add new expense entry |
| GET | /expenses/{id} | Immutable expense entry and correction references |
| PUT | /expenses/{id} | D81: append reversal and replacement; original remains unchanged |
| DELETE | /expenses/{id} | D81: cancel by appending a reversal; no row/file deletion |
| GET | /expenses/report | Income-expense summary report (PDF/Excel) |

D81: manual expenses require a positive decimal amount. Correction/cancellation is tenant-bound, row-locked and atomic; an already reversed entry or a payroll/advance/store/refund entry is rejected. `reversal_of_id` identifies the original negated entry; `replaces_expense_id` identifies the corrected entry. Reports sum signed ledger amounts over the institution/date index. Historical receipts remain private and retained. The nullable reversal/replacement unique keys deliberately allow multiple ordinary entries without references (D81 exception to the generic zero-default rule).

## Exam Seat Plan (role: admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /exams/{id}/seat-plan/generate | Auto-assign seats for an exam |
| GET | /exams/{id}/seat-plan | View current seating arrangement |
| PUT | /exams/{id}/seat-plan/{studentId} | Manually adjust one student's seat |
| GET | /exams/{id}/seat-plan/print | Room-wise seating PDF |

## Audit Log (role: admin, super_admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /audit-logs | List audit trail (action, user, date filter) |
| GET | /audit-logs/{id} | Single audit entry detail (old/new values) |

## Notices & SMS (role: admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | /notices | নোটিশ CRUD |
| POST | /sms/send | SMS পাঠানো |
| GET/POST | /messages | মেসেজিং |

## Payment Gateway
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /fees/payment/bkash/create | bKash পেমেন্ট শুরু |
| GET | /fees/payment/bkash/callback | bKash callback |
| POST | /billing/initiate | SaaS subscription payment |
| POST | /billing/ssl/success | SSLCommerz success |
| POST | /billing/ssl/fail | SSLCommerz fail |

## Response Format
```json
{
  "success": true,
  "data": {},
  "message": "সফলভাবে সম্পন্ন হয়েছে",
  "meta": {
    "current_page": 1,
    "total": 100,
    "per_page": 20
  }
}
```

## Error Response Format
```json
{
  "success": false,
  "error": "validation_failed",
  "message": "ইনপুট যাচাইয়ে ত্রুটি",
  "errors": {
    "name": ["নাম দেওয়া আবশ্যক"]
  }
}
```

---

## Pagination Standard

### Page-based (Default — used in all lists)
```json
GET /api/v1/students?page=2&per_page=20&search=রাজু&program_id=3

Response:
{
  "success": true,
  "data": [...],
  "meta": {
    "current_page": 2,
    "last_page": 10,
    "per_page": 20,
    "total": 200,
    "from": 21,
    "to": 40
  },
  "links": {
    "first": "/api/v1/students?page=1",
    "prev":  "/api/v1/students?page=1",
    "next":  "/api/v1/students?page=3",
    "last":  "/api/v1/students?page=10"
  }
}
```

### Cursor-based (large datasets — SMS logs, Audit logs)
```json
GET /api/v1/sms-logs?cursor=eyJpZCI6MTAwfQ&per_page=50

Response:
{
  "data": [...],
  "meta": {
    "next_cursor": "eyJpZCI6MTUwfQ",
    "prev_cursor": "eyJpZCI6NTF9",
    "per_page": 50
  }
}
// Suitable for infinite scroll
// Fast query without OFFSET on large tables
```

### Laravel Implementation
```php
// Page-based (default)
return StudentResource::collection(
    Student::paginate($request->per_page ?? 20)
);

// Cursor-based
return StudentResource::collection(
    Student::cursorPaginate($request->per_page ?? 50)
);
```

## Standard Query Filters (applies to all list endpoints)
```
?search=রাজু          → name/id দিয়ে সার্চ
?program_id=3           → ক্লাস ফিল্টার
?batch_id=5         → সেকশন ফিল্টার
?status=active        → status ফিল্টার
?from=2025-01-01      → তারিখ শুরু
?to=2025-01-31        → তারিখ শেষ
?sort_by=name         → sort field
?sort_dir=asc         → asc | desc
?per_page=20          → প্রতি পেজে রেকর্ড সংখ্যা
?page=1               → পেজ নম্বর
```

## API Response Wrapper (BaseController)
```php
// app/Http/Controllers/BaseController.php
class BaseController extends Controller {

    protected function success($data, string $message = '', int $code = 200): JsonResponse {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ], $code);
    }

    protected function error(string $message, string $errorCode = 'error', int $code = 400): JsonResponse {
        return response()->json([
            'success' => false,
            'error'   => $errorCode,
            'message' => $message,
        ], $code);
    }

    protected function paginated($paginator, string $resourceClass): JsonResponse {
        return response()->json([
            'success' => true,
            'data'    => $resourceClass::collection($paginator),
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }
}
```

---

## New Feature API Endpoints (Revision 4)

### Fee Installment
```
POST /fees/installments/plan           → Installment plan তৈরি
GET  /fees/installments/{planId}       → Plan + installments detail
POST /fees/installments/{id}/pay       → নির্দিষ্ট installment pay
GET  /fees/installments/overdue        → Overdue list
```

### Homework Submission
```
POST /homework/{id}/submit             → Student submission (file/text)
GET  /homework/{id}/submissions        → Teacher: all submissions
POST /homework/submissions/{id}/grade  → Teacher: grade + feedback
GET  /student/homework/submitted       → Student: own submissions
```

### Online Exam / Quiz
```
GET/POST  /online-exams                → List & create
POST      /online-exams/{id}/publish   → Publish exam
GET/POST  /online-exams/{id}/questions → Questions manage
POST      /online-exams/{id}/start     → Student: start exam
POST      /online-exams/{id}/submit    → Student: submit answers
GET       /online-exams/{id}/results   → Teacher: all results
GET       /online-exams/{id}/leaderboard → Result ranking
```

### Behavior & Health
```
GET/POST  /students/{id}/behavior      → Behavior log
POST      /behavior/{id}/notify-parent → Notify parent via SMS
GET/PUT   /students/{id}/health        → Health record
GET       /health/reports/{programId}    → Class health summary
```

### Certificates & Documents
```
GET/POST  /certificates                → List & generate
GET       /certificates/{id}/download  → PDF download
POST      /certificates/bulk           → Bulk generate
GET       /students/{id}/qr-code       → QR code URL
GET       /students/id-cards/bulk      → Bulk ID card PDF
```

### Institution Operations
```
POST   /visitors/check-in              → Visitor check-in
PATCH  /visitors/{id}/check-out        → Visitor check-out
GET    /visitors                       → Today's visitors
POST   /meetings/request               → Meeting request
PATCH  /meetings/{id}/confirm          → Parent confirms
GET    /parent/meetings                → Parent's meetings
```

### Alumni
```
GET/POST  /alumni                      → List & register
PUT       /alumni/{id}                 → Update profile
GET       /alumni/directory            → Public directory
```

### Auth Extras
```
POST /auth/verify-otp                  → 2FA OTP verify
PATCH /auth/toggle-2fa                 → Enable/disable 2FA
PATCH /user/whatsapp                   → WhatsApp number & enable
```

### Bulk Operations
```
POST /fees/reminder/preview            → Due students preview
POST /fees/reminder/send               → Bulk SMS dispatch
GET  /fees/reminder/history            → SMS reminder log
POST /students/import/sync   [SUPERSEDED R16 -> /imports kind=students] → Excel student import (sync)
GET  /students/import/template   [SUPERSEDED R16 -> /imports kind=students] → Import template download
GET  /students/import/logs   [SUPERSEDED R16 -> /imports kind=students] → Import history
GET  /exams/{id}/marks/template        → Mark entry template
POST /exams/{id}/marks/import          → Bulk mark upload
```

---

## Revision 5 — New API Endpoints

### AI Assistant
```
POST /ai/chat                    → AI chat query
POST /ai/generate-notice         → AI draft notice
POST /ai/generate-questions      → MCQ generate from topic
GET  /ai/analytics-summary       → AI institution performance summary
```

### Student Analytics
```
GET /students/{id}/analytics     → Performance trend, subject-wise, attendance
```

### GPS Tracking
```
POST /vehicles/{id}/location     → GPS tracker sends location (API key auth)
GET  /vehicles/{id}/live         → Parent: live bus location
GET  /vehicles/{id}/route-today  → Today's route with ETA
```

### Data Export
```
POST /institution/export/request      → Start full data export (Queue)
GET  /institution/export/{jobId}      → Export progress
GET  /institution/export/{jobId}/download → Download ZIP
```

### Exam Admit Card
```
POST /exams/{id}/admit-cards/generate → Bulk generate
GET  /student/exams/{id}/admit-card   → Own admit card PDF
GET  /exams/{id}/admit-cards/bulk     → All admit cards PDF
```

### Scholarship
```
GET/POST /scholarships                     → List & create
POST     /scholarships/{id}/apply          → Student applies
GET      /scholarships/{id}/applications   → View applications
PATCH    /scholarships/applications/{id}/award → Award
GET      /student/scholarships             → Student's applications
```

### Events & Competitions
```
GET/POST  /events                       → List & create
POST      /events/{id}/register         → Student registers
PATCH     /events/{id}/attendance/{sid} → Mark attendance
POST      /events/{id}/results          → Add winners
GET       /events/upcoming              → Upcoming events
GET       /student/events               → Student's registrations
```

### Teacher Training
```
GET/POST  /training-programs                → Training CRUD
POST      /training-programs/{id}/enroll    → Enroll teacher
PATCH     /training-programs/{id}/complete  → Complete + cert upload
GET       /teachers/{id}/trainings          → Teacher's CPD history
GET       /hr/cpd-report                    → Institution-wide CPD summary
```

### Per-Institution Theme (Super Admin + Institution Admin)
```
GET   /super/institutions/{id}/theme         → Super Admin: view any institution's theme
PUT   /super/institutions/{id}/theme         → Super Admin: update any institution's theme
POST  /super/institutions/{id}/theme/logo    → Super Admin: upload institution logo
POST  /super/institutions/{id}/theme/favicon → Super Admin: upload institution favicon
GET   /super/institutions/{id}/theme/history → Theme change audit log
POST  /super/institutions/{id}/theme/reset   → Reset to default theme
GET   /admin/theme                      → Institution Admin: view own theme
PUT   /admin/theme                      → Institution Admin: update own theme (Pro+ only)
GET   /theme/public                     → Public: unauthenticated, used by Login page
```

---

## Revision 6 Endpoints

### Public (No Auth, Tenant From Host)
```
GET   /bootstrap                         → institution, terms, modules, roles, theme, plan  (docs/modules/institution-types.md)
GET   /theme/public                      → effective theme object
GET   /api/v1/manifest.webmanifest              → per-institution PWA manifest (full path /api/v1/manifest.webmanifest — Nginx forwards only /api to PHP)
# Central host only
POST  /public/signup                     → { institution_type, name, slug, admin_name, phone, email?, password }
GET   /public/slug-check?slug=           → { available: bool }
GET   /public/plans?institution_type=    → plans for the pricing/signup page
```

### Academic Structure — docs/modules/academic-structure.md
```
GET|POST /programs      PUT|DELETE /programs/{id}        (replaces the old /classes)
GET|POST /batches       PUT|DELETE /batches/{id}         (replaces sections)
GET      /batches/{id}/students
POST     /enrollments   PUT /enrollments/{id}
POST     /enrollments/{id}/end           POST /enrollments/{id}/transfer
GET      /students/{id}/enrollments
POST     /attendance                     → { batch_id, date, records[] }   (batch_id is now required)
```

### Coaching / Private Batch — docs/modules/coaching-private-batch.md
```
GET|POST /leads         PUT|DELETE /leads/{id}           POST /leads/{id}/convert
GET      /teacher-payouts?month=         POST /teacher-payouts/generate
PUT      /teacher-payouts/{id}           POST /teacher-payouts/{id}/approve | /pay
GET      /exams/{id}/merit-list?batch_id=
POST     /subscription/sms-credits       → buy prepaid SMS credits
```

### Theme & Layout — docs/THEMING.md
```
GET|PUT  /admin/theme                    PUT  /admin/theme/tokens     PUT /admin/theme/layout
POST     /admin/theme/preset             POST /admin/theme/logo | /favicon
GET|POST /super/theme-presets            PUT|DELETE /super/theme-presets/{id}
```

### Domains — docs/modules/custom-domain.md
```
GET|POST /admin/domains                  DELETE /admin/domains/{id}
POST     /admin/domains/{id}/verify      POST /admin/domains/{id}/primary
PUT      /admin/slug
GET      /super/domains                  POST /super/domains/{id}/approve | /reject | /disable | /recheck
POST     /super/institutions/{id}/domains
GET      /api/internal/tls-check?domain= (loopback only, outside /v1)
```

### Settings & Super Admin Additions
```
GET|PUT  /admin/settings/terminology     → institutions.terminology
GET|PUT  /admin/settings/general         → institutions.settings (fee_proration, use_programs, student_portal, use_gpa)
PUT      /super/institutions/{id}        → now also: institution_type, enabled_modules
POST     /super/institutions/{id}/sms-credits
GET      /super/institutions?institution_type=&plan=&status=
```

---

## Revision 6.2 Endpoints

### Online Fee Payment — docs/modules/online-fee-payment.md
```
# Parent (module:online_payment)
GET    /parent/fees/payment-options                   → [{gateway, mode:'institution'|'platform'}]  (empty = no Pay button)
POST   /fees/payment/{gateway}/create                 → { student_id, dues:["12:3:2026-10",…] } → { payment_url, ref, mode }   gateway ∈ bkash|sslcommerz
GET    /parent/online-payments/{ref}                  → { status, receipt_no? }
# Gateway callbacks (central host, public)
GET    /fees/payment/bkash/callback?ref=              POST|GET /fees/payment/ssl/{success|fail|cancel}     POST /fees/payment/ssl/ipn
POST|GET /fees/payment/{gateway}/notify               (R6.4 generic provider notification - Bangla QR and any future gateway)
# Institution Admin (Accountant: GET only on the first three)
GET    /admin/payments                  GET /admin/payments/{id}                GET /admin/payments/settlements
GET    /admin/settings/payments         PUT /admin/settings/payments/gateways/{gateway}
POST   /admin/settings/payments/gateways/{gateway}/test        DELETE /admin/settings/payments/gateways/{gateway}
PUT    /admin/settings/payments/payout-account
# Super Admin
GET    /super/online-payments           GET|PUT /super/payout-accounts[/{id}]
GET    /super/settlements               POST /super/settlements/generate        GET|PUT|DELETE /super/settlements/{id}
POST   /super/settlements/{id}/approve  POST /super/settlements/{id}/pay        GET /super/reports/settlement-liability
```
Fee collection (`docs/templates/laravel-core-files.md` → "Revision 6.2 FeeService Methods"): `GET /fees/dues?student_id=` → due lines with keys; `POST /fees/collect` body `{ student_id, lines:[{key, paid_amount?}], payment_method }` → one receipt.

### SMS Sender ID — docs/modules/notifications.md
```
GET|PUT|DELETE /admin/settings/sms-sender
GET  /super/sms-senders?status=pending        POST /super/institutions/{id}/sms-sender/approve | /reject
```

### Public Website & Admission — docs/modules/public-website.md
```
# Tenant host, public (module:public_site)
GET  /public/site          GET /public/notices?page=          POST /public/admission
# Plain HTML/text (not under /api): GET /  /notices  /admission  /robots.txt  /sitemap.xml   (routes/public.php)
# Institution Admin
GET|PUT /admin/settings/website            POST /admin/settings/website/hero
```

### Revision 9 — Language
```
PUT  /auth/locale                      { locale }                  any authenticated user (must be in the institution's enabled list)
GET|PUT /admin/settings/language       { enabled[], default, sms_locale }   [admin]   (bn cannot be disabled)
POST /admin/settings/terminology-preset { preset: 'madrasa' | null }          [admin]
GET  /bootstrap  → …, locales:{ default, enabled, dir }
Request header: Accept-Language (sent by the SPA); response header: Content-Language
```

### Revision 8 — UI Pack
```
PUT  /admin/theme/pack          { ui_pack }      [admin, feature custom_branding]   - must be compatible with the effective layout_key (422 otherwise)
GET  /admin/theme               → …, available_packs:[{key,label,layouts}]
(Super Admin: PUT /super/institutions/{id}/theme also accepts ui_pack)
```

### Revision 6.3 — Exam Subjects (schedule & marks)
```
GET  /exams/{id}/subjects                      → [{subject_id, name, full_marks, pass_marks, exam_date, start_time, end_time, room, components}]
PUT  /exams/{id}/subjects                      → edit schedule / full & pass marks / components (only while exam.status = upcoming|ongoing)
GET  /exams/{id}/subjects/{subjectId}/entry    → students (via active enrollments in the exam's program/batch) + existing marks + limits
POST /results/bulk                             → { exam_id, subject_id, rows:[{student_id, marks_obtained?, components?, is_absent?}] }  (grade is computed on the server and returned)
```
Admit card, seat plan and the exam routine print read `exam_subjects` (the Admit Card "Subject / Date & Time" table has no other source).

### Revision 7 — Sessions, Consent, Privacy
```
# Sessions (any authenticated user, own tokens only)
GET    /auth/sessions                       → [{id, device, created_at, last_used_at, is_current}]
DELETE /auth/sessions/{id}                  POST /auth/logout-all
# Admin (own institution only)
POST   /admin/users/{id}/force-logout       POST /admin/users/{id}/unlock
# Consent
GET|POST /students/{id}/consents            GET /students/{id}/consent-form.pdf        [admin]
GET /parent/consents                        PUT /parent/consents/{type}  { status }     [parent, own children]
# Privacy
POST   /students/{id}/anonymize             { confirm_name }                            [admin; irreversible]
GET    /parent/children/{id}/export                                                      [parent, own child]
POST   /student-erasure-requests            [parent|student]  → notifies the Admin
GET    /privacy  /terms                     (plain pages on every host, no auth)
# Super Admin
GET    /super/tenant-purge/candidates       POST /super/tenant-purge/{institutionId}/dry-run    POST /super/tenant-purge/{institutionId}/execute
```

### Revision 10 — Advanced Academics (`docs/modules/academics-advanced.md`)
```
# Final (weighted) results - module result_sheets
GET|POST /result-sheets    GET|PUT|DELETE /result-sheets/{id} (PUT/DELETE draft only)
POST /result-sheets/{id}/compute | publish | new-version      GET /result-sheets/{id}/preview | tabulation.pdf | export.xlsx
GET  /student/final-results   GET /parent/children/{id}/final-results
# Dues block (settings.fees.block_*) - module fees
GET  /students/{id}/due-block                POST /students/{id}/due-block-exemptions    DELETE /students/{id}/due-block-exemptions/{id}
GET  /exams/{id}/admit-cards/blocked
# Period attendance - module period_attendance
GET  /teacher/periods/today   POST /period-attendance { routine_id, date, records[] }   GET /period-attendance/report
# Substitution, routine blocks - modules substitution, routine
GET  /substitutions/needed?date=   GET|POST /substitutions   PATCH|DELETE /substitutions/{id}   GET /routines/available-teachers
GET|POST|PUT|DELETE /routine-blocks
# Marks lock - module exams
POST /exams/{id}/subjects/{subjectId}/submit | unlock { reason }
# Student leave - module student_leave
POST /parent/children/{id}/leave-requests   GET /parent/leave-requests
GET  /leave-requests/students?status=       PATCH /leave-requests/students/{id} { status, note }
```

### Revision 10 — Staff, Salary & Payroll (`docs/modules/staff-payroll.md`, module hr_payroll)
```
GET|POST|PUT|DELETE /hr/staff     GET|POST /hr/staff-attendance     GET|POST|PUT|DELETE /hr/salary-components
GET  /hr/people/{type}/{id}/salary           GET|PUT /hr/people/{type}/{id}/pay-accounts      ({type} = teacher|staff)
GET|POST /hr/revisions   GET /hr/revisions/{id}   POST /hr/revisions/{id}/approve | reject | cancel   GET /hr/revisions/{id}/letter.pdf
POST /hr/increment-batches/preview    POST /hr/increment-batches
GET|POST|PUT|DELETE /hr/bonus-schemes     POST /hr/bonus-schemes/{id}/preview | apply | cancel
GET|POST /hr/adjustments   GET /hr/adjustments/suggest-extra-class?month=   POST /hr/adjustments/{id}/approve | cancel
GET|POST /hr/advances      POST /hr/advances/{id}/approve | reject | disburse | skip-installment | write-off
GET|POST /hr/payroll-runs  GET /hr/payroll-runs/{id}   POST /hr/payroll-runs/{id}/recompute | review | approve | reject | cancel | pay
PATCH /hr/payroll-items/{id} { hold | release, reason }     GET /hr/payroll-items/{id}/slip.pdf
GET  /hr/payroll-runs/{id}/disbursement.csv | register.xlsx | register.pdf
POST /hr/final-settlement/{type}/{id}/start
GET|POST /hr/pf/entries     GET /hr/pf/{type}/{id}/statement.pdf     GET /hr/reports/{name}
# Teacher (own pay only)
GET  /teacher/salary   /teacher/salary/slips   /teacher/salary/slips/{id}.pdf   /teacher/salary/advances   /teacher/salary/history
```
(পুরনো `/hr/salary/process`, `/hr/salary/{teacherId}/slip`, `/hr/salary/report` বাতিল।)

### Revision 10 — Completeness list (routes defined in `docs/templates/laravel-core-files.md` that earlier sections did not name)
Verification found these routes with no mention in the docs; listed here so API.md is complete. `{id}`-forms of `apiResource` CRUD are implied.
```
GET|POST|PUT|DELETE /teachers  /teachers/{id}                      (admin)           ·  GET|POST|PUT|DELETE /homework /homework/{id}    (teacher/admin, module homework)
GET|POST /teacher-attendance                                       (admin, module teacher_attendance)
GET  /teacher/routine/today                                        (teacher)         ·  GET /fees/payments/student/{id}                 (admin/accountant: a student's payment lines)
PUT  /fees/categories/{id}                                         (admin)           ·  PUT /results/{id} · PUT /subjects/{id} · PUT /routine-blocks/{id} · PATCH /notices/{id}
GET  /admin/reports/{type}   /accountant/reports/{type}            (report catalogue: docs/modules/pdf-reports.md)
GET  /subscription                         → current plan, usage vs limits, status (any tenant admin)
POST /subscription/checkout                { plan_id, cycle }  → gateway redirect (central callbacks below); a coupon field is added with platform-ops
POST /billing/ssl/success | fail | cancel | ipn                    (central host, SSLCommerz callbacks for SUBSCRIPTION payments; not fee payments)
POST /super/domains/{id}/reject | recheck        GET /super/reports/growth        POST /super/institutions/{id}/theme/logo | favicon · /theme/reset · GET /theme/history
```

### Revision 12 — Full scope, part 2 (specs: `docs/modules/{finance-advanced,inventory,attendance-devices,accounting,donations,madrasa,syllabus,risk-alerts,admission-cycle,data-migration,communication-plus,quick-wins,platform-ops,public-website-plus}.md`)
```
# finance-advanced  (module cashbook / fees)
# Cashbook D82: close/reopen/reclose append consecutive immutable tenant/date revisions; latest revision defines status. Reopen is admin-only with required reason. Closed-day cash writes return 409 day_closed; invalid input returns 422. R3.2 aggregates positive cash fee receipts and signed cash expenses once, without future source implementations or duplicate refund/payroll outflows. Close/reopen and fee/expense cash writes share the tenant institution transaction lock; correction checks both original and replacement cash dates.
# R3.2 request details: GET date defaults to today; range requires from/to (Y-m-d, ordered, no future dates). First close requires opening_cash; later close derives opening from preceding closed counted_cash (expected fallback), without day gaps or earlier reopened days. Close requires counted_cash, and note on mismatch. Amount input is a nonnegative decimal string/integer, max two decimal places, max 9,999,999,999.99. Server owns revision/status/actors/totals. JSON daily/range includes method/category/collector totals and immutable revision history; report ext is pdf or xlsx. Cash writes reject future dates; noncash entries do not alter cash balance or trigger day_closed.
GET  /cashbook?date=   /cashbook/range?from=&to=   /cashbook/{date}/report.pdf|xlsx      POST /cashbook/{date}/close { counted_cash, note? }   POST /cashbook/{date}/reopen { reason }  [admin]
GET  /fee-refunds/refundable?receipt_no=     GET|POST /fee-refunds   GET /fee-refunds/{id}   POST /fee-refunds/{id}/approve | reject | process  [D84: root request ID, append-only snapshots; approve/reject admin-only]
# inventory  (plan-gated)
GET|POST|PUT /inventory/items   DELETE /inventory/items/{id}   GET /inventory/items/{id}/ledger   POST /inventory/receive|issue|sale|damage|adjust|return
GET  /inventory/stock?low=1   /inventory/reports/stock|movements|sales|valuation   /inventory/sales/{receipt_no}/receipt.pdf
# attendance-devices  (plan-gated)   device -> platform:  POST /device/punches   (tenant host, HMAC: X-Device-Key, X-Timestamp, X-Signature; no Sanctum)
GET|POST|PUT /attendance-devices   POST /attendance-devices/{id}/rotate-secret | disable   GET|POST /person-credentials   POST /person-credentials/import
GET  /device-punches?status=   POST /device-punches/{id}/assign { person_type, person_id }   POST /device-punches/reprocess
# accounting  (plan-gated, admin+accountant)   prefix /accounting
GET|POST|PUT /accounts   GET /accounts/tree   GET|POST /vouchers   GET /vouchers/{id}   POST /vouchers/{id}/post | reverse { reason }
GET|POST|PUT /budgets   PUT /budgets/{id}/lines   POST /budgets/{id}/approve   GET /reports/trial-balance|ledger|income-expenditure|balance-sheet|budget-actual|unposted
GET  /bank-reconciliation/{account_id}   POST /bank-reconciliation/{account_id}/import|match|unmatch   POST /opening-balances   POST /repost { from, to }   PUT /settings
# donations  (opt-in)
GET|POST|PUT|DELETE /donors   GET /donors/{id}/statement.pdf?year=   GET|POST|PUT /donation-funds   GET /donation-funds/{id}/statement?from=&to=
GET|POST|PUT /donation-campaigns   GET /donation-campaigns/{id}/progress   GET|POST /donations   POST /donations/{id}/reverse { reason }   GET /donations/{id}/receipt.pdf
# madrasa  (hifz opt-in)
GET|POST|PUT|DELETE /hifz/records   GET /hifz/students/{id}/progress   GET /hifz/batches/{id}/overview?stale_days=   GET /hifz/reports/monthly.pdf   GET /parent/children/{id}/hifz
# syllabus
GET|POST|PUT|DELETE /syllabus/units   POST /syllabus/units/clone|import   GET /syllabus/coverage   POST|DELETE /syllabus/coverage   GET /syllabus/overview|behind
GET|POST|PUT|DELETE /lesson-plans   POST /lesson-plans/{id}/taught|skipped   GET /parent/children/{id}/syllabus
# risk-alerts
GET /risk/flags   GET /risk/students/{id}   POST /risk/flags/{id}/acknowledge|resolve { note }   GET|PUT /risk/settings   POST /risk/evaluate   [admin]
# admission-cycle
GET|POST|PUT /admission/cycles   POST /admission/cycles/{id}/open|freeze|close   POST /admission/cycles/{id}/test-marks   POST /admission/cycles/{id}/list/merit|lottery { seed }
GET  /admission/cycles/{id}/draw   POST /admission/leads/{id}/confirm|decline|admit
Public:  GET /public/admission/status?application_no=&phone=   GET /public/admission/cycle/{id}/transparency   POST /public/admission/{lead_id}/pay { lead_token, gateway }
# data-migration
GET|POST /imports   GET /imports/{id}   PUT /imports/{id}/mapping   POST /imports/{id}/dry-run|run|rollback   GET /imports/{id}/errors.xlsx   GET /imports/templates/{kind}.xlsx
# communication-plus  (module sms / notices)
GET|POST|PUT /sms/templates   POST /sms/templates/{id}/preview   GET|POST /sms/campaigns   POST /sms/campaigns/{id}/estimate|schedule|send|cancel   GET /sms/campaigns/{id}/report
GET  /sms/emergency/estimate   POST /sms/emergency { template_id|body, audience, confirm_word }   [admin]      POST /webhooks/sms/{provider}   (central; inactive until a provider adapter exists)
POST /notices/{id}/ack   GET /notices/{id}/receipts   POST /notices/{id}/remind-missing
# quick-wins
GET  /public/verify/{code}   (certificate / TC verification, throttled)      PUT /auth/ui-preferences { font_scale, high_contrast, dyslexia_font, reduce_motion, wide_spacing }
# platform-ops  tenant side
GET|POST /support/tickets   GET /support/tickets/{id}   POST /support/tickets/{id}/messages|close|reopen|rate|grant-access
GET|POST /admin/exports   GET /admin/exports/{id}   GET /admin/exports/{id}/download   POST /subscription/coupon/validate { code, plan_id, cycle }   POST /auth/impersonate/exchange { code }   POST /auth/impersonate/end
# platform-ops  Super Admin (central)
GET /super/support/tickets   /{id}   POST /super/support/tickets/{id}/messages|assign|status      GET|POST|PUT /super/coupons   GET /super/coupons/{id}/redemptions
GET|PUT /super/platform-settings   POST /super/institutions/{id}/impersonate   POST /super/institutions/{id}/backup { reason }   POST /super/institutions/import { export_id|upload, new_slug, type }   # subscription refund endpoint deferred (D55/D84)
# public-website-plus
GET /public/gallery   /public/gallery/{album_id}   /public/news   /public/news/{slug}   /public/pages/{slug}   /public/teachers   /public/events
Admin: GET|POST|PUT|DELETE /admin/site/albums   /admin/site/albums/{id}/items   /admin/site/posts   PATCH /admin/site/teachers/{id}/public
```

### R16 — অভিভাবক-পোর্টালের অনুপস্থিত endpoint (যাচাইয়ে ধরা পড়েছিল)
```
GET /parent/children/{id}/attendance?month=YYYY-MM     [parent, own child]   → মাসিক সারাংশ + দৈনিক তালিকা
GET /parent/children/{id}/results                       [parent, own child]   → শুধু প্রকাশিত পরীক্ষা
GET /results/marksheet/{studentId}?exam_id=             [admin, teacher, parent(own child, published), student(self)]   → PDF
```
পুরনো `GET /student/*` শুধু ছাত্র-role (R1.1)। ভুল সন্তানের id সবসময় 404।

# HR leave - module hr_payroll (R3; docs/modules/hr-payroll.md)
GET  /hr/leave-types                     POST /hr/leave-types      PUT /hr/leave-types/{id}
GET  /hr/leaves?status=&type=&id=        POST /hr/leaves           GET /hr/leaves/balance?type=&id=
PATCH /hr/leaves/{id}/approve | reject | cancel
GET  /teacher/leave                      POST /teacher/leave

### R3.1 expense request/report details (D81)

POST requires category, title, positive decimal amount (string or integer) and expense_date (Y-m-d). PUT accepts correction fields; protected actor/tenant/source/link fields are rejected. Receipt documents follow SECURITY.md: PDF/JPEG/PNG up to 5 MB, stored privately at the documented UUID path. GET /expenses supports category/from/to and per_page (1–100); GET /expenses/report accepts month (Y-m, default current month), format=json (default), pdf or xlsx. JSON returns the signed monthly expense total; PDF/Excel show immutable ledger rows and that total. This task does not implement a combined income/cashbook report or expense UI.

## D84 institutional refund request contract

POST /fee-refunds accepts request_key (UUID), student_id, original_receipt_no, refund_lines [{fee_payment_id, amount}], reason and method (cash/bank/bkash/nagad). Amount is computed from exact line amounts. The same key/payload returns the original root request; changed payload 409. GET/list returns latest status with immutable history; revision IDs cannot be used as root request IDs. Admin/accountant request/process, admin approve/reject; audited sole-active-admin exception only. Processing uses one captured timestamp, negative fee reversal rows plus one positive refund expense, cash-day 409 day_closed and consent-aware after-commit notification. Online fields/online_gateway fail closed while online_payment is unavailable; no subscription refund route is registered. See D84 and docs/modules/finance-advanced.md.


## D85 HR leave transition

PATCH /hr/leaves/{id}/{action} retains approve|reject|cancel and module hr_payroll. Roles admin,teacher; teacher only own pending cancel, admin other transitions. cancelled is distinct from rejected. See hr-payroll.md D85 for calendar, snapshots, annual balance and summary contract. No additional route.


## D86 R3.5 salary access and settlement boundary

GET /hr/people/{type}/{id}/salary uses admin,accountant,teacher (teacher own teacher profile only); no new route. Salary data denies Super Admin/explicit impersonated tokens with 403 sensitive_scope. Bonus apply is 409 dependency_pending without side effects until R3.6 integration; automatic ended-month arrears fail closed until later paid-history/arrears integration. Revision reviewed calculation snapshot is server-owned; source changes are 409 stale_revision. Exact contract: staff-payroll.md D86 and owner/salary-structure-contract-decision.md. Pay account responses never contain full account_number.


## D87 R3.6 adjustment and advance API

The existing nine admin/accountant adjustment/advance routes remain. Assign existing planned GET /teacher/salary/advances to SalaryAdvanceController@mine in R3.6, role teacher/module hr_payroll, own teacher profile only (ten R3.6 routes, no duplicate R3.7 route). D33 Super Admin/explicit impersonated ability returns 403 sensitive_scope before queries. Admin-only approval/skip/write-off applies in services with configured maker-checker/sole-active-admin exception; accountant prepares and disburses approved advances. Server-owned snapshot/status/recovered/ownership/expense linkage cannot be client assigned. Disbursement atomically links one source=advance expense; identical retries return original, conflicting retry 409, closed cash day rejected. Snapshot source/policy changes reject stale approval/disbursement. Bonus apply now integrates approved unique adjustments atomically under D87 when dependency exists; otherwise 409 dependency_pending with no effects. Applied retry returns original effects; supplied stale preview evidence rejected, no client totals. Unavailable substitution suggestions return 409 dependency_pending. No full account/private attachment path or sensitive audit/request log values. Exact immutable terms/skips/application evidence and lifecycle requirements: staff-payroll.md D87; actual payroll recovery remains R3.7.

## D90 — account/onboarding contract (R3.6a/b)

Authoritative payload, host, state and resource rules: `docs/architecture/staff-account-contract.md`; approved current-route matrix: `docs/department-permission-contract.json`. R3.6a has twenty planned routes, including POST /public/institutions/{id}/verification (central generic resend), POST /auth/activate (pending staff on correct active tenant host), and POST /admin/staff/{id}/activation (principal-authorized reissue). Existing POST /super/institutions integrates the same service; it is not counted twice.

Registration accepts one contact={channel:phone|email,value:string}; Super Admin provisions admin.name/admin.contact without a supplied reusable password. Public signup also accepts principal password+confirmation. Verify consumes bound request public_id/code with recipient password setup when required. Review accepts decision=approve|reject and rejection reason. No client user_id/role/status/actor/approval fields, raw secret response or token before all activation predicates. Principal own-profile self-service allows User.name/avatar only; authorization/HR/contact fields remain principal controlled. Ordinary inactive-user login/reset remains denied. State conflicts use 409, invalid input 422, host/ownership/role/module checks remain existing API contracts; do not disclose pending identities on generic resend.

This is a canonical contract, not implemented endpoint or migration evidence. Public exposure waits for runtime/security/delivery acceptance, with no app/demo DB writes in this checkpoint.
## D91 staff business-request header contract

`institution_staff` business requests require `X-Department-Id: <positive decimal department ID>` under `docs/architecture/staff-account-contract.md` section D91 (owner decision checkpoint 4b29f90). Supply exactly one value; missing, empty, malformed, multiple/comma-separated or array-like values are rejected. The header never proves membership: the server revalidates the selected context and its exact duty/action, fresh identity and resource/module/feature/security constraints on every request. No other department's duty, body/query override or automatic first/sole-department selection is accepted. Switching sends a different selector on the next request, revalidated in full, without new storage, cookie, token claim, endpoint or migration. Identity-only routes keep their current boundaries. This is a contract refinement, not runtime route exposure or tenant rollout approval; existing business default-deny remains until each route's integration passes.


## D92 staff subject-index contract

For existing GET|HEAD /subjects, follow docs/architecture/staff-account-contract.md section D92 (owner registry checkpoint 4cac920). The institution_staff branch requires the D91 header/context and exact staff.subject.index plus a fresh active unambiguous own Teacher. Include only explicitly assigned nonzero batch_teachers subjects in own-tenant upcoming/running batches with matching subject/batch program; deduplicate. Optional program_id only narrows the authorized set. Staff response fields are subject id/name and program id/name only; existing admin response remains unchanged. Direct subject teacher, zero sentinel, teacher_subjects and class-teacher identity alone grant nothing for this first branch. No detail/write/export/student access or new endpoint follows. Runtime exposure waits for verified integration; R3.6b remains incomplete.


## D93 staff subject-show contract

Existing GET|HEAD /subjects/{id} follows docs/architecture/staff-account-contract.md section D93 (separate owner registry checkpoint 8cf6f8f). Require D91 selected context, independently exact staff.subject.show and fresh active unambiguous own Teacher. Restrict the path subject to the D92 narrow explicit nonzero batch_teachers assignment in own-tenant upcoming/running batches with matching subject/batch program; excluded source-alone grants remain excluded. Response is only subject id/name and program id/name, preserving admin response. Index/show permissions are independent. Invalid context/duty/Teacher is denied403; foreign/nonexistent/non-owned subject is404 after valid prerequisites. Query/body IDs cannot override the numeric path. Preserve security/module gates and legacy consumers; no marks/teacher disclosure, write/export/student access, mapping, tenant switch, schema, new endpoint or UI. Runtime exposure waits for verified integration; R3.6b remains incomplete.


## D99 leave-linked substitution operation replay (design only)

No endpoint, runtime capability or executable task is registered by this section. D99 selects a separate request receipt in `leave_substitution_operations`; `leave_substitution_slots` remains current state and `leave_substitution_events` remains immutable history. This supplements D96; exact action paths/payload validation and expected-version sources remain gates.

The incoming key is an opaque nonempty UTF-8 string, maximum128 encoded bytes, preserved exactly (no trim/case folding). Store lowercase SHA-256 hex of canonical JSON `["leave-substitution-key-v1", key]` as `idempotency_key_sha256`, unique within institution and authenticated user across these mutation actions. Raw keys and request bodies are not stored in receipts. Child event keys are lowercase SHA-256 hex of canonical JSON `["leave-substitution-event-v1", institutionId, userId, operationId, slotId]`, with IDs represented as decimal strings. Existing event request uniqueness remains intact; one operation can link at most one event per slot, and each slot/version remains unique.

Canonical request envelope has exactly `format`, `action`, `resource`, `context`, `payload`, `expected_versions`; `format` is `leave-substitution-v1`. Resource/context are server-bound. IDs/versions are normalized positive decimal strings; nullable department is explicit null. Strings preserve Unicode code points without normalization; booleans/null remain JSON values; numeric literals/floats are not accepted in this envelope. Object keys sort by Unicode code point; JSON uses UTF-8, no ASCII escaping, no whitespace outside strings. Reject duplicate/unknown keys and malformed Unicode before hashing. Arrays preserve order; fields representing sets must first be validated for duplicates and sorted by their specified identity; exact per-action field/set definitions remain gated. Hash the canonical envelope to lowercase SHA-256 hex as `payload_sha256`; do not persist the sensitive payload. Altered action, resource, context, payload or expected versions must conflict for the same incoming identity, including disjoint slot sets.

Transaction order: revalidate current tenant/actor/context access, acquire institution row first, then look up receipt. Matching digest replays the immutable result before stale-version rejection, without incrementing versions or repeating transitions/audit/intents. Different digest conflicts. With no receipt, load/lock fresh prerequisites in the shared deterministic order and revalidate expected versions/cutoff/conflicts. Denied/stale/validation failures commit no success receipt. Apply all leave/source fan-out plus event history, audit and required durable notification intents atomically; successful zero-slot work still creates a receipt. No committed in-progress receipt. All writes roll back on failure. Exact deadlock retry budget/error mapping remains an API gate.

Receipt result is a minimal relational manifest: receipt ID, result_code, result_http_status, result_slot_count and linked immutable events ordered by slot ID (event ID, slot ID, resulting version). No arbitrary JSON ID manifest or raw payload. `action` and result_code/status must be validated against the future action contract; result count must equal linked events at commit. Each event's payload digest matches its receipt. Multi-leave source work uses multiple linked events, not a misleading single leave FK on the receipt. No-event success has an empty manifest. These are service invariants, not SQL aggregate constraints. Replay returns this historical result, not today's mutable slot state; it is not an unredacted resource snapshot or bypass of current visibility.

Receipt/history are retained for the same lifecycle until authorized D27 tenant purge; keys are not silently recycled while history remains. Purge events before slots/operations, then referenced leaves/users/departments; never delete history during ordinary cancellation or source edits. Operational export/import excludes all three design-only tables today. Future portable export/import must explicitly remap relational IDs and invalidate/rebind tenant-, actor- and resource-dependent request digests/keys; copying receipts as replayable requests into another institution is forbidden. Until reviewed migration/remapping checks exist, export/import of this design data fails closed and cannot be activated. Receipt is not an outbox; durable notification primitive, delivery deduplication and acceptance remain pending.


## D96 dated slot actions (design only; no route registration)

This section refines only existing/materialized slot mutations. It does not define a slot-creation endpoint, candidate/list read grant, leave approval grant or an executable task. All paths below are relative to `/api/v1`, require the `substitution` module and accepted dependencies before future exposure. Existing D85 leave routes retain their own hr_payroll gate. Every mutation requires `Idempotency-Key` under D99; body/query tenant, actor, department, leave/routine/date/interval and status overrides are rejected. The route binds tenant -> leave -> slot; foreign/mismatched nesting is404. Every action requires a future period and fresh source/leave prerequisites; no confirmed-cover force override.

| Action | Method and future path | Body besides expected_versions | Allowed leave / slot state | Result state / event |
|---|---|---|---|---|
| nominate | PUT /hr/leaves/{leave}/substitution-slots/{slot}/nomination | substitute_teacher_id | own pending / unassigned,nominated | nominated / nomination_set |
| clear_nomination | DELETE /hr/leaves/{leave}/substitution-slots/{slot}/nomination | none | own pending / nominated | unassigned / nomination_cleared |
| offer | PUT /hr/leaves/{leave}/substitution-slots/{slot}/offer | substitute_teacher_id; reason when replacing confirmed | approved / unassigned,offered,confirmed | offered / offer_created, or cover_replaced from confirmed |
| clear_offer | DELETE /hr/leaves/{leave}/substitution-slots/{slot}/offer | reason when clearing confirmed | approved / offered,confirmed | unassigned / cover_cleared |
| accept | PATCH /hr/leaves/{leave}/substitution-slots/{slot}/accept | none | approved / offered, own current target | confirmed / offer_accepted |
| decline | PATCH /hr/leaves/{leave}/substitution-slots/{slot}/decline | optional reason | approved / offered, own current target | unassigned / offer_declined |

Only `expected_versions`, the specified target and bounded reason are accepted fields. Expected versions is exactly `{ "slot": "positive-decimal-version", "source": "lowercase-sha256" }`; target IDs are positive decimal strings. Reason is trimmed, nonempty when required, maximum255 Unicode code points; it is sensitive audit/history data, never routine request logging. Canonical action names are the table's action column. Resource is `{type:"leave_substitution_slot",leave_id:routeLeaveId,id:routeSlotId}`; context has institution_id, user_id and selected department_id or explicit null for a nonstaff branch. Payload includes only the action's validated fields, with absent optional reason normalized to null. All IDs/versions are strings. Unknown fields, numeric identifiers, missing key/version/digest and malformed data are422 validation_failed. GET/list response design must expose these preconditions safely before any route can become executable.

The server-derived source digest uses D99 canonical encoding over `{format:"leave-substitution-source-v1",leave:...,routine:...,occurrence:...}`. Leave fields are id,user_id,staff_id,status,from_date,to_date and accepted D85 working-date snapshot (pending uses current HrCalendar working dates); routine fields are id,program_id,batch_id,subject_id,teacher_id,day_of_week,start_time,end_time,room_no; occurrence fields are slot id, routine_id, original_teacher_id, occurrence_date, source_start_time, source_end_time, source_room_no. Normalize dates YYYY-MM-DD, times HH:MM:SS, IDs as decimal strings, nulls explicit and working dates sorted ascending without duplicates. Exclude leave reason/contact/payroll fields. Recompute under institution lock and compare; this is a state fingerprint, not a claim that routine/leave have revision columns. An ABA source mutation cannot resurrect authority: participating writers invalidate affected slots and increment slot versions even if source fields later revert. Target eligibility, block/other routine/approved leave/confirmed-cover conflicts are always freshly checked, independent of this digest.

Successful changed transition increments slot version exactly once and appends exactly one mapped event linked to the D99 receipt, preserving old state through history; clearing/decline sets target null. Offer replacement revokes old authority atomically and requires target acceptance, even when the replacement target is the same Teacher. A byte-equivalent advisory nomination/offer or already-empty clear may return200 with a zero-event receipt only where the requested resulting advisory state already exists; it never re-confirms or replays another key's acceptance. For advisory clear only, unassigned is the additional no-op state; all leave/actor/cutoff prerequisites still apply. Fresh accept/decline of a non-offered slot is409 substitution_state_conflict. Cancelled slots have no public transition. In-place date change, confirmed-target withdrawal, post-start correction and cancellation bypass remain outside this scope.

D99 replay is checked after fresh access validation and institution lock, before source/slot stale checks. Same key/different canonical digest =>409 idempotency_conflict. Missing fresh row =>404 not_found; missing identity/context/capability =>403 forbidden. Non-replay stale slot/source =>409 substitution_version_conflict; period started =>409 substitution_period_started; changed target availability/conflict =>409 substitution_unavailable; other lifecycle mismatch =>409 substitution_state_conflict. Conflict responses disclose no other Teacher/leave/calendar details. Deadlocks/lock timeouts retry the whole transaction at most3 attempts, only for recognized transactional concurrency failures; validation/business errors never retry. Exhaustion =>409 substitution_retry_required with no partial writes; client retries using the same key and payload. Exact driver error classification and delivery behavior remain implementation gates. Success is200 with the D99 minimal historical result manifest, not a current-slot or HR snapshot.


## D96/D99 leave-wide materialization and reconciliation (design only)

This refines existing future integration of POST /hr/leaves and PATCH /hr/leaves/{id}/{action}; it adds no runtime endpoint, capability or release exposure. Preserve D90/D85 authorization: own Teacher creation/pending cancellation where already allowed; principal-only approve/reject and D85 pre-start approved cancellation with reason. No cover key grants these actions. Existing deployed behavior is unchanged until separate implementation approval.

Future integrated creation validates/persists the valid D85 leave first and atomically materializes unassigned slots for its real, not-yet-started source occurrences, with version1/slot_created events. Nomination is a separate own pending-slot action after creation; a rejected nominee does not discard valid leave data (P2). Application UI may orchestrate those steps later, but no UI or new draft endpoint is defined here. No eligible Teacher or no source periods means a valid unassigned/zero-slot leave, not rejection. Never synthesize past routine occurrences from today's weekly schedule; first-scope past-only HR requests use no newly invented cover periods. Existing historical slots remain readable under their eventual access rules, without post-start corrections.

D99 receipt gains nullable leave_application_id as the initiating leave, tenant-bound by composite FK. It is populated for leave-rooted operations, including zero-slot creation, so a lost create response can replay the new leave ID. It is not a restriction that every child event belong to that leave: substitute-leave approval can invalidate covers of other applicant leaves. Non-leave-rooted source operations use null. Minimal receipt replay manifest now includes this initiating leave ID (or null), result code/status/count and ordered immutable event ID/slot ID/version/result_status references. No raw payload, source/HR snapshot or opaque JSON ID manifest. Matching replay precedes stale checks and must not rerun the legacy latest-audit retry branch or create a second leave.

For integrated leave create/review/cancel, expected_versions contains exactly occurrence_scope (lowercase SHA-256). Hash a D99-canonical `{format:"leave-substitution-scope-v1",leave:...,working_dates:...,sources:...,slots:...,affected_covers:...}` envelope: leave is the same non-sensitive leave identity/status/date fields as the single-slot source contract (null before creation); working_dates are the D85 current candidate dates before approval or accepted snapshot afterwards; sources are the source-contract routine/occurrence tuples sorted numerically by routine ID then ISO date; slots and affected_covers are `[slotId,version,sourceDigest]` tuples sorted numerically by slot ID. IDs/versions are decimal strings, nulls explicit. affected_covers includes the applicant's currently actionable substitute obligations that the new approval would invalidate. Only an opaque digest is returned for collateral obligations; do not disclose other leave details. Candidate availability is excluded from this scope hash and freshly rechecked so newly conflicting nominees become gaps under P3. Exact read/picker endpoints that securely supply these preconditions remain an exposure gate.

Create canonical resource is `{type:"leave_application_collection",id:null}` with the bound applicant and validated original D85 fields in payload; review/cancel/reject resource is `{type:"leave_application",id:routeLeaveId}`. Canonical action is leave_create, leave_approve, leave_reject or leave_cancel. Every integrated operation uses D99 Idempotency-Key; creation digest is stable before the server allocates a leave ID. For approval only, payload additionally contains exhaustive cover_choices over the current not-started occurrence set: each choice is `{routine_id,occurrence_date,substitute_teacher_id}`; null target explicitly keeps a gap. Sort by numeric routine ID/date, reject duplicates/unknown occurrences/missing choices. Choosing an existing nominee explicitly is the keep decision; approval never silently converts all nominations. Malformed or foreign target IDs fail validation before writes; a legitimate selected target that has become inactive/unavailable/conflicting produces a gap and bounded reviewer-visible reason, while valid leave approval proceeds (P3). No conflict override may confirm a cover.

Under the shared institution lock, authorize, find receipt, then rebuild/compare the entire scope; mismatch =>409 substitution_version_conflict without partial writes. Apply the D85 approval snapshot, slot reconciliation, substitute-obligation invalidation, immutable events, receipt, audit and required durable notification intents in one transaction. Existing nominated -> eligible selected target gives offered/offer_created; existing nominated -> gap gives unassigned/nomination_cleared; existing unassigned -> selected target gives offered/offer_created; an unchanged unassigned gap records unassigned/leave_approved with a new version because its leave prerequisite changed. Newly materialized slots get a single slot_created event whose explicit result_status is the final unassigned/offered state. Approval never creates confirmed state. Obsolete future slots are cancelled/source_invalidated; no accepted snapshot or past history rewrite. Each affected slot has exactly one final event/version per operation, including collateral invalidation; if two effects target it, record the final state and appropriate invalidation cause, not duplicate events.

D85 reject/cancel marks each changed live linked slot cancelled with leave_rejected/leave_cancelled and a version increment; terminal slots are not rewritten. Approved cancel still requires authorized principal, reason and institution-local date strictly before from_date. No date amendment: cancel then create a new leave and new slots/receipts. Schema uniqueness is now `(institution_id,leave_application_id,routine_id,occurrence_date)`, allowing a new cycle while retaining old IDs/history. Before any materialization under the institution lock, reject another non-cancelled slot for the same tenant/routine/date, and retain D85 pending/approved overlap validation. The per-leave unique key is not a cross-leave booking or time-overlap guarantee. Do not reparent an old slot or its events to the new leave; old receipt manifests keep historical IDs. Existing non-leave substitutions are unchanged.

Initial creation event is slot_created, subsequent approval gap event is leave_approved; every event stores non-null result_status from the current canonical state enum. Its snapshot and result remain immutable after commit. Missing history is not backfilled here. Approved-source refresh within the same leave after invalidation, calendar/source settings classification, safe portable receipt replay rebinding, all-writer inventory closure and durable notification primitive remain separate design/implementation gates; no silent cancelled-slot revival or source refresh endpoint is authorized.
