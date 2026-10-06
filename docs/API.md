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
| PUT | /expenses/{id} | Update expense |
| DELETE | /expenses/{id} | Delete expense |
| GET | /expenses/report | Income-expense summary report (PDF/Excel) |

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
GET  /cashbook?date=   /cashbook/range?from=&to=   /cashbook/{date}/report.pdf|xlsx      POST /cashbook/{date}/close { counted_cash, note? }   POST /cashbook/{date}/reopen { reason }  [admin]
GET  /fee-refunds/refundable?receipt_no=     GET|POST /fee-refunds   GET /fee-refunds/{id}   POST /fee-refunds/{id}/approve | reject | process { gateway_refund_ref? }
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
GET|PUT /super/platform-settings   POST /super/institutions/{id}/impersonate   POST /super/institutions/{id}/backup { reason }   POST /super/institutions/import { export_id|upload, new_slug, type }   POST /super/payments/{id}/refund
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
