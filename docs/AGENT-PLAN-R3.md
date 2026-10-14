# AGENT PLAN — Release 3 (Money & People: টাকা ও মানুষ)

> **এই ফাইল হাতে সম্পাদনা করবেন না।** স্বয়ংক্রিয় তৈরি: `python3 infra/spec-verify/gen_release_plan.py .` (উৎস: `docs/release/r3-scope.json`, `docs/database/schema.sql`, routes-টেমপ্লেট, `docs/AUTHORIZATION.md`)। `verify.py` পুরনো হলে ব্যর্থ হয়। স্কোপ ও গ্রহণ-শর্ত: `docs/RELEASE-3.md`।
> **শুরুর আগে:** `AGENTS.md` পড়ুন। **Release 1 সম্পূর্ণ ও গৃহীত না হলে R3 শুরু করবেন না** (Task `R3.0`)। R1.1/R2 লাগে না — একমাত্র পূর্বশর্ত `expenses` (Task `R3.1`)।

## ক. নিয়ম (R1-এর নিয়মের উপর অতিরিক্ত)

1. **টাকা Decimal-এ, দুই দশমিক, ROUND_HALF_UP।** `float` নিষিদ্ধ। সংখ্যা মেলাতে স্বাধীন গণনা ব্যবহার করুন: `infra/spec-verify/payroll_ref.py`, `refs_r11.py`, `refs_r12.py` — কোড এগুলোর সাথে **পয়সা-পর্যন্ত** না মিললে ধাপ শেষ নয়।
2. **টাকার রেকর্ড কখনো মোছা/বদলানো যায় না (D32):** রসিদ, রিফান্ড, ভাউচার, payroll-run, PF-সারি, স্টক-movement — ভুল সংশোধন = নতুন উল্টো সারি।
3. **বেতন-তথ্য সংবেদনশীল (D33):** Super Admin ও প্ল্যাটফর্ম-সহায়তা কেউ দেখে না; শিক্ষক শুধু নিজেরটা; লগ/Sentry-তে অঙ্ক নয়; ব্যাকআপ/export-এ বেতন-ভাগ বাদ (D38)।
4. **আইনি/বাহ্যিক জিনিস অনুমান করবেন না:** PF/কর/গ্র্যাচুইটির হার, ব্যাংক-ফাইল ফরম্যাট — স্পেকে ফাঁকা স্লট (`TODO(OD-…)`); কোডে হার ধরে নেবেন না।
5. **bulk লেখা শুধু `TenantBulk`-এর মাধ্যমে**; প্রতিটি নতুন মডেলে `BelongsToInstitution`; প্রতিটি পরীক্ষায় অন্য-প্রতিষ্ঠানের তথ্য অদৃশ্যতা।
6. **মডিউল-গেট:** R3-মডিউল (`cashbook`, `hr_payroll`, `teacher_attendance`, `inventory`, `accounting`, `donations`) `config/release.php`-এ না থাকা পর্যন্ত বন্ধ। ধাপ শেষ হলে `docs/PROGRESS.md`-এ লিখে সব পরীক্ষা সবুজ করে commit।

## খ. ধাপের ক্রম

| Task | কী | নির্ভর করে | টেবিল | route | পরীক্ষা |
|---|---|---|---|---|---|
| `R3.0` | পূর্বশর্ত ও রিলিজ-গেট (R3-এর জন্য) | — | 0 | 0 | 1 |
| `R3.1` | খরচ (expenses) — ক্যাশবুকের পূর্বশর্ত | R3.0 | 1 | 6 | 0 |
| `R3.2` | দৈনিক ক্যাশবুক ও day-end close | R3.1 | 1 | 5 | 4 |
| `R3.3` | ফি রিফান্ড ও reversal | R3.2 | 1 | 6 | 5 |
| `R3.4` | কর্মচারী, উপস্থিতি ও ছুটি | R3.3 | 5 | 18 | 5 |
| `R3.5` | বেতন-কাঠামো, ইনক্রিমেন্ট ও বোনাস | R3.4 | 6 | 24 | 5 |
| `R3.6` | সমন্বয় (জরিমানা/ওভারটাইম) ও অগ্রিম/ঋণ | R3.5 | 2 | 9 | 1 |
| `R3.7` | Payroll run, payslip ও পরিশোধ | R3.6 | 2 | 13 | 7 |
| `R3.8` | ভবিষ্য তহবিল (PF), কর ও চূড়ান্ত নিষ্পত্তি | R3.7 | 1 | 4 | 3 |
| `R3.9` | স্টোর / ইনভেন্টরি | R3.2 | 2 | 9 | 6 |
| `R3.10` | হিসাব-খাত (Accounting) — double-entry | R3.3, R3.7, R3.9 | 5 | 20 | 13 |
| `R3.11` | দান ও তহবিল (ঐচ্ছিক মডিউল) | R3.10 | 4 | 21 | 6 |
| `R3.12` | R3-এর পাতা (ফ্রন্টএন্ড), ভূমিকাভেদে | R3.11 | 0 | 0 | 1 |
| `R3.13` | টাকা ও বেতন-তথ্যের নিরাপত্তা — সামগ্রিক যাচাই | R3.12 | 0 | 0 | 1 |
| `R3.14` | R3-এর কর্মক্ষমতা (ডেটা বাড়লে) | R3.13 | 0 | 0 | 1 |
| `R3.A` | R3 গ্রহণ-পরীক্ষা, তারপর চালু | R3.14 | 0 | 0 | 0 |

মোট: **16 task · 30 টেবিল · 135 route · 59টি আলাদা পরীক্ষা**। (ক্রম রৈখিক; `R3.9` শুধু `R3.2`-এর পর, তাই `R3.3`–`R3.8` ও `R3.9` সমান্তরালে চলতে পারে।)

## গ. `config/release.php` — R3-এর জন্য (R1-এর তালিকার উপর)

```php
// R3: cumulative. Add any R1.1 / R2 modules you have ALREADY built; never list a module whose code does not exist.
'modules' => ['students', 'enrollments', 'attendance', 'fees', 'exams', 'sms', 'reports', 'data_migration', 'question_bank', 'quiz', 'expenses', 'cashbook', 'hr_payroll', 'teacher_attendance', 'inventory', 'accounting', 'donations'],
```

## ঘ. Task-সমূহ

### TASK `R3.0` — পূর্বশর্ত ও রিলিজ-গেট (R3-এর জন্য)

- **নির্ভর করে:** — (শুরু)
- **লক্ষ্য:** R3 শুরুর আগে Release 1 সম্পূর্ণ ও গৃহীত কি না নিশ্চিত করা, আর `config/release.php`-কে সংখ্যায় বাড়ানো (R1-এর ৮ + `expenses` + R3-এর ৬ = ১৫ মডিউল)।
- **সীমা / নোট:** এই ধাপে কোনো নতুন টেবিল বা route নেই; শুধু কনফিগ ও গেট।
- **পড়ুন:** `docs/RELEASE-3.md`, `docs/RELEASE-1.md`, `docs/modules/institution-types.md`
- **লিখবেন ও সবুজ করবেন:** `ReleaseGateTest` (docs/modules/institution-types.md)
- **শেষ-শর্ত (Done When):** Release 1-এর গ্রহণ-শর্ত (`docs/RELEASE-1.md` §৭) সব সত্য। `config("release.modules")` হুবহু `r3-scope.json`-এর `release_php.modules`। D79 (D6/D47): R3-মডিউলে `ModuleGate::allows()` প্রথমে release gate যাচাই করে; release-এ না থাকলে explicit Super Admin override-সহ false। Release-এ থাকলে explicit override জেতে; override না থাকলে institution type এবং প্রয়োজনীয় opt-in সুইচ যাচাই হয়। Subscription plan module enablement নির্ধারণ করে না। `ReleaseGateTest` সবুজ।
- **যাচাই:** `python3 infra/spec-verify/verify.py . --deep` · `php artisan test --filter=ReleaseGateTest`

### TASK `R3.1` — খরচ (expenses) — ক্যাশবুকের পূর্বশর্ত

- **নির্ভর করে:** `R3.0`
- **লক্ষ্য:** ক্যাশবুক দিনের খরচ ধরে, তাই `expenses` মডিউল আগে চাই। **R1.1-এ আগেই বানানো হয়ে থাকলে এই ধাপ বাদ**; না হলে এখানে বানান।
- **সীমা / নোট:** শুধু R1.1-এর `ExpenseController`; খরচের শ্রেণি/সংযুক্তি যেমন স্পেকে আছে, বাড়তি কিছু নয়।
- **পড়ুন:** `docs/modules/panels-and-features.md`, `docs/ROADMAP.md`
- **মডিউল-কী:** `expenses`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE expenses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    category VARCHAR(100) NOT NULL,
    title VARCHAR(150) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    expense_date DATE NOT NULL,
    note TEXT,
    receipt_path VARCHAR(255),
    added_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT 'cash';
ALTER TABLE expenses ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE expenses ADD COLUMN payroll_run_id BIGINT UNSIGNED NULL;
ALTER TABLE expenses ADD COLUMN fund_id BIGINT UNSIGNED NULL;
CREATE INDEX idx_expenses_inst_date ON expenses(institution_id, expense_date);
```
- **Route (6):**

```
GET /expenses -> ExpenseController@index [role:admin,accountant]
POST /expenses -> ExpenseController@store [role:admin,accountant]
GET /expenses/{id} -> ExpenseController@show [role:admin,accountant]
PUT /expenses/{id} -> ExpenseController@update [role:admin,accountant]
DELETE /expenses/{id} -> ExpenseController@destroy [role:admin,accountant]
GET /expenses/report -> ExpenseController@report [role:admin,accountant]
```
- **শেষ-শর্ত (Done When):** খরচ তৈরি/সম্পাদনা/মোছা (নরম) ও মাসিক রিপোর্ট; অঙ্ক Decimal (দুই দশমিক); এক প্রতিষ্ঠানের খরচ অন্যে দেখে না; স্কিমার `idx_expenses_inst_date` সূচক ব্যবহারে মাসিক যোগফল (`hot-queries.tsv`: `expenses_month`)। স্পেকে এই মডিউলের নামধারী পরীক্ষা নেই — tenant-বিচ্ছিন্নতা ও যোগফলের পরীক্ষা লিখুন।
- **যাচাই:** `php artisan test --filter=Expense` · `python3 infra/spec-verify/plan_check.py .`

### TASK `R3.2` — দৈনিক ক্যাশবুক ও day-end close

- **নির্ভর করে:** `R3.1`
- **লক্ষ্য:** প্রতিদিনের নগদ আয়-ব্যয়ের হিসাব (ফি-রসিদ + খরচ), দিনের শেষে মিলিয়ে বন্ধ করা; বন্ধ দিনে পরিবর্তন আটকানো, পুনরায় খোলা শুধু Admin ও নথিভুক্ত।
- **সীমা / নোট:** রিপোর্ট PDF/Excel শুধু স্পেকের `report.{ext}`; হিসাব-খাতের ভাউচার এখানে নয় (R3.10)।
- **পড়ুন:** `docs/modules/finance-advanced.md`, `docs/LOCKED-DECISIONS.md`
- **মডিউল-কী:** `cashbook`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE cash_book_closings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_in DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_out DECIMAL(12,2) NOT NULL DEFAULT 0,
    expected_closing DECIMAL(12,2) NOT NULL DEFAULT 0,
    counted_cash DECIMAL(12,2) NULL,
    difference DECIMAL(12,2) NULL,
    status ENUM('closed','reopened') NOT NULL DEFAULT 'closed',
    note VARCHAR(255) NULL,
    closed_by BIGINT UNSIGNED NULL,
    closed_at TIMESTAMP NULL,
    reopened_by BIGINT UNSIGNED NULL,
    reopened_at TIMESTAMP NULL,
    reopen_reason VARCHAR(255) NULL,
    UNIQUE KEY unique_cash_day (institution_id, date),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
- **Route (5):**

```
GET /cashbook -> CashBookController@show [role:admin,accountant] (module cashbook)
GET /cashbook/range -> CashBookController@range [role:admin,accountant] (module cashbook)
GET /cashbook/{date}/report.{ext} -> CashBookController@report [role:admin,accountant] (module cashbook)
POST /cashbook/{date}/close -> CashBookController@close [role:admin,accountant] (module cashbook)
POST /cashbook/{date}/reopen -> CashBookController@reopen [role:admin] (module cashbook)
```
- **লিখবেন ও সবুজ করবেন:** `CashBookMathTest` (docs/modules/finance-advanced.md), `CashBookSourcesTest` (docs/modules/finance-advanced.md), `CashBookLockTest` (docs/modules/finance-advanced.md), `CashBookTenancyTest` (docs/modules/finance-advanced.md)
- **শেষ-শর্ত (Done When):** `CashBookMathTest`: স্পেকের উদাহরণে প্রত্যাশিত সমাপনী = **19,400.00** (স্বাধীন গণনা `infra/spec-verify/refs_r11.py`-এর সাথে পয়সা-পর্যন্ত মেলে)। উৎস = ফি-রসিদ ও খরচ (`CashBookSourcesTest`); bKash/অনলাইন রসিদ নগদ-সারিতে নয়। বন্ধ দিনে রসিদ/খরচের পরিবর্তন 422 (`CashBookLockTest`); পুনরায় খোলা নতুন সারি, পুরনোটি মোছা নয় (D32)। এক স্কুল অন্যের ক্যাশবুক দেখে না।
- **যাচাই:** `php artisan test --filter=CashBook` · `python3 infra/spec-verify/refs_r11.py`

### TASK `R3.3` — ফি রিফান্ড ও reversal

- **নির্ভর করে:** `R3.2`
- **লক্ষ্য:** ছাত্রের ফি ফেরত: আবেদন → অনুমোদন → পরিশোধ। রসিদ কখনো মোছা বা বদলানো যায় না — রিফান্ড নতুন সারি (D32)।
- **সীমা / নোট:** `fee_payments.online_payment_id` ঐচ্ছিক রেফারেন্স — R2 না থাকলে খালি।
- **পড়ুন:** `docs/modules/finance-advanced.md`, `docs/modules/fees-advanced.md`, `docs/LOCKED-DECISIONS.md`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE fee_refunds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    original_receipt_no VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    refund_lines JSON NOT NULL,                          -- [{fee_payment_id, amount}] - which receipt lines are reversed
    reason VARCHAR(255) NOT NULL,
    method VARCHAR(16) NOT NULL DEFAULT 'cash',   -- cash | bank | bkash | nagad | online_gateway
    online_payment_id BIGINT UNSIGNED NULL,
    gateway_refund_ref VARCHAR(100) NULL,
    status ENUM('requested','approved','processed','rejected') NOT NULL DEFAULT 'requested',
    reversal_receipt_no VARCHAR(50) NULL,
    requested_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    processed_by BIGINT UNSIGNED NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
```
- **Route (6):**

```
POST /super/payments/{id}/refund -> SuperRefundController@subscription [role:super_admin]
GET /fee-refunds/refundable -> FeeRefundController@refundable [role:admin,accountant] (module fees)
GET /fee-refunds -> FeeRefundController@index [role:admin,accountant] (module fees)
POST /fee-refunds -> FeeRefundController@store [role:admin,accountant] (module fees)
GET /fee-refunds/{id} -> FeeRefundController@show [role:admin,accountant] (module fees)
POST /fee-refunds/{id}/{action} -> FeeRefundController@transition [role:admin,accountant] (module fees)
```
- **লিখবেন ও সবুজ করবেন:** `RefundCapTest` (docs/modules/finance-advanced.md), `RefundDueRecalcTest` (docs/modules/finance-advanced.md), `RefundImmutabilityTest` (docs/modules/finance-advanced.md), `RefundSettlementTest` (docs/modules/finance-advanced.md), `SubscriptionRefundTest` (docs/modules/finance-advanced.md)
- **শেষ-শর্ত (Done When):** ফেরতযোগ্য সীমা = প্রদত্ত − আগের ফেরত; তা পেরোলে 422 (`RefundCapTest`)। রিফান্ডের পর বকেয়া নতুন করে ঠিক বাড়ে (`RefundDueRecalcTest`)। রিফান্ড-সারি অপরিবর্তনীয় (`RefundImmutabilityTest`)। নগদ-ফেরত ক্যাশবুকে ঋণাত্মক সারি হয় (`RefundSettlementTest`)। Super Admin স্কুলের subscription-পেমেন্ট ফেরত দেয় (`SubscriptionRefundTest`)। অনলাইন-পেমেন্টের রিফান্ড **শুধু** online payment মডিউল (R2) থাকলে; না থাকলে সেই শাখা নিষ্ক্রিয়।
- **যাচাই:** `php artisan test --filter=Refund` · `python3 infra/spec-verify/refs_r11.py`

### TASK `R3.4` — কর্মচারী, উপস্থিতি ও ছুটি

- **নির্ভর করে:** `R3.3`
- **লক্ষ্য:** অ-শিক্ষক কর্মচারীর প্রোফাইল, শিক্ষক ও কর্মচারীর দৈনিক উপস্থিতি, ছুটির ধরন ও আবেদন (অনুমোদিত ছুটি উপস্থিতি-সারসংক্ষেপে যোগ, অবৈতনিক ছুটি বেতনে কাটে)।
- **সীমা / নোট:** ছুটির route (`/hr/leave-types`, `/hr/leaves`, `/teacher/leave`) R17-তে টেমপ্লেটে যোগ হয়েছে — `hr-payroll.md` বর্ণনা করলেও আগে ছিল না। RFID/device-পাঞ্চ (`StaffPunchTest`) R4-এ।
- **পড়ুন:** `docs/modules/staff-payroll.md`, `docs/modules/hr-payroll.md`, `docs/LOCKED-DECISIONS.md`
- **মডিউল-কী:** `hr_payroll`, `teacher_attendance`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE staff_members (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,                -- only if the person has a login (e.g. an accountant)
    employee_id VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    designation VARCHAR(80) NULL,
    department VARCHAR(80) NULL,
    phone VARCHAR(20) NULL,
    photo VARCHAR(255) NULL,
    joining_date DATE NULL,
    leaving_date DATE NULL,
    status ENUM('active','inactive','on_leave') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_staff_code (institution_id, employee_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE staff_attendances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    staff_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    check_in TIME NULL,
    check_out TIME NULL,
    note VARCHAR(255) NULL,
    marked_by BIGINT UNSIGNED NULL,
    UNIQUE KEY unique_staff_attendance (institution_id, staff_id, date),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (staff_id) REFERENCES staff_members(id)
);
```
```sql
CREATE TABLE teacher_attendances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    check_in TIME NULL,
    check_out TIME NULL,
    note VARCHAR(255) NULL,
    marked_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_teacher_attendance (institution_id, teacher_id, date),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);
```
```sql
CREATE TABLE leave_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    max_days_per_year INT DEFAULT 10,
    is_paid TINYINT(1) DEFAULT 1
);
CREATE INDEX idx_leave_types_inst ON leave_types(institution_id);
```
```sql
CREATE TABLE leave_applications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,                -- R10: teacher (via users) OR staff_id below - exactly one, checked in the service
    leave_type_id BIGINT UNSIGNED NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    total_days INT NOT NULL,
    reason TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
ALTER TABLE leave_applications ADD COLUMN staff_id BIGINT UNSIGNED NULL;
CREATE INDEX idx_leave_inst_status ON leave_applications(institution_id, status);
```
- **Route (18):**

```
GET /teacher-attendance -> TeacherAttendanceController@index [role:admin] (module teacher_attendance)
POST /teacher-attendance -> TeacherAttendanceController@store [role:admin] (module teacher_attendance)
GET /hr/staff -> StaffController@index [role:admin,accountant] (module hr_payroll)
POST /hr/staff -> StaffController@store [role:admin,accountant] (module hr_payroll)
GET /hr/staff/{id} -> StaffController@show [role:admin,accountant] (module hr_payroll)
PUT /hr/staff/{id} -> StaffController@update [role:admin,accountant] (module hr_payroll)
DELETE /hr/staff/{id} -> StaffController@destroy [role:admin,accountant] (module hr_payroll)
GET /hr/staff-attendance -> StaffAttendanceController@index [role:admin,accountant] (module hr_payroll)
POST /hr/staff-attendance -> StaffAttendanceController@store [role:admin,accountant] (module hr_payroll)
GET /hr/leave-types -> LeaveTypeController@index [role:admin] (module hr_payroll)
POST /hr/leave-types -> LeaveTypeController@store [role:admin] (module hr_payroll)
PUT /hr/leave-types/{id} -> LeaveTypeController@update [role:admin] (module hr_payroll)
GET /hr/leaves -> LeaveController@index [role:admin] (module hr_payroll)
POST /hr/leaves -> LeaveController@store [role:admin] (module hr_payroll)
GET /hr/leaves/balance -> LeaveController@balance [role:admin] (module hr_payroll)
PATCH /hr/leaves/{id}/{action} -> LeaveController@transition [role:admin] (module hr_payroll)
GET /teacher/leave -> LeaveController@mine [role:teacher] (module hr_payroll)
POST /teacher/leave -> LeaveController@apply [role:teacher] (module hr_payroll)
```
- **লিখবেন ও সবুজ করবেন:** `AttendanceSummaryTest` (docs/modules/staff-payroll.md), `LeaveOverlapTest` (docs/modules/hr-payroll.md), `LeaveBalanceTest` (docs/modules/hr-payroll.md), `LeavePayrollLinkTest` (docs/modules/hr-payroll.md), `LeaveActorTest` (docs/modules/hr-payroll.md)
- **শেষ-শর্ত (Done When):** কর্মচারী যোগ/সম্পাদনা (`user_id` ঐচ্ছিক — লগইন ছাড়াও কর্মচারী থাকতে পারে); একই `employee_id` প্রতিষ্ঠানে একবারই। ছুটি: একই জনের দুটি `approved/pending` ছুটির সময় ওভারল্যাপ করলে 422 (`LeaveOverlapTest`); বার্ষিক সীমা পেরোলে 422, Admin `override` করলে audit-এ (`LeaveBalanceTest`); আবেদনকারী ঠিক একজন — `user_id` (শিক্ষক) অথবা `staff_id` (`LeaveActorTest`); অনুমোদিত অবৈতনিক ছুটি payroll-এ `lwp_days` (`LeavePayrollLinkTest`); উপস্থিতি-সারসংক্ষেপ ছুটিকে `leave` গণনা করে (`AttendanceSummaryTest`)।
- **যাচাই:** `php artisan test --filter=Leave` · `php artisan test --filter=AttendanceSummaryTest`

### TASK `R3.5` — বেতন-কাঠামো, ইনক্রিমেন্ট ও বোনাস

- **নির্ভর করে:** `R3.4`
- **লক্ষ্য:** তারিখ-ভিত্তিক বেতন-কাঠামো ও উপাদান, সংশোধন (revision) চক্র, ব্যাচ-ইনক্রিমেন্ট, বোনাস-স্কিম, পরিশোধ-অ্যাকাউন্ট। বেতন-তথ্য সংবেদনশীল (D33)।
- **সীমা / নোট:** গ্র্যাচুইটি ও ছুটি-নগদায়ন সূত্র-ভিত্তিক নয় — ডিফল্টে হাতে-সমন্বয় (`PRODUCT.md` ডিফল্ট)।
- **পড়ুন:** `docs/modules/staff-payroll.md`, `docs/LOCKED-DECISIONS.md`
- **মডিউল-কী:** `hr_payroll`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE salary_components (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(30) NOT NULL,
    name JSON NOT NULL,                          -- {"bn":"...","en":"...","ar":"..."}
    type ENUM('earning','deduction') NOT NULL,
    calc VARCHAR(20) NOT NULL DEFAULT 'fixed',   -- fixed | percent_basic
    taxable TINYINT(1) NOT NULL DEFAULT 1,
    is_pf TINYINT(1) NOT NULL DEFAULT 0,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT DEFAULT 0,
    UNIQUE KEY unique_component_code (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE salary_structures (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    basic DECIMAL(10,2) NOT NULL,
    gross DECIMAL(10,2) NOT NULL,                -- computed from the lines when the structure was created
    effective_from DATE NOT NULL,
    effective_to DATE NULL,                      -- NULL = current
    designation VARCHAR(80) NULL,
    grade VARCHAR(30) NULL,
    revision_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_structure_start (institution_id, payee_type, payee_id, effective_from),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE salary_structure_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    structure_id BIGINT UNSIGNED NOT NULL,
    component_id BIGINT UNSIGNED NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'fixed',   -- fixed | percent_basic
    value DECIMAL(10,2) NOT NULL,
    UNIQUE KEY unique_structure_component (structure_id, component_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (structure_id) REFERENCES salary_structures(id),
    FOREIGN KEY (component_id) REFERENCES salary_components(id)
);
```
```sql
CREATE TABLE salary_revisions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(12) NOT NULL,                   -- initial | increment | decrement | promotion | correction
    batch_id VARCHAR(40) NULL,
    batch_label VARCHAR(100) NULL,
    change_mode VARCHAR(8) NOT NULL DEFAULT 'set',   -- percent | amount | set
    change_value DECIMAL(10,2) NULL,
    target VARCHAR(40) NOT NULL DEFAULT 'basic',     -- basic | component:<code>
    old_basic DECIMAL(10,2) NULL,
    new_basic DECIMAL(10,2) NOT NULL,
    old_gross DECIMAL(10,2) NULL,
    new_gross DECIMAL(10,2) NOT NULL,
    effective_from DATE NOT NULL,
    reason VARCHAR(255) NULL,
    arrears_policy VARCHAR(8) NOT NULL DEFAULT 'auto',   -- auto | none
    status ENUM('proposed','approved','rejected','applied','cancelled') NOT NULL DEFAULT 'proposed',
    proposed_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    approved_at TIMESTAMP NULL,
    acknowledged_path VARCHAR(255) NULL,         -- payee's signed acknowledgement (decrement), private disk
    letter_no VARCHAR(30) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_revision_letter (institution_id, letter_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_revisions_payee ON salary_revisions(institution_id, payee_type, payee_id, effective_from);
```
```sql
CREATE TABLE bonus_schemes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'festival',    -- festival | performance | annual | other
    pay_month VARCHAR(7) NOT NULL,
    basis VARCHAR(8) NOT NULL DEFAULT 'basic',       -- basic | gross | fixed
    value DECIMAL(10,2) NOT NULL,                    -- percent of basis, or the amount when basis = fixed
    min_service_months INT NOT NULL DEFAULT 0,
    prorate_below_months INT NOT NULL DEFAULT 0,
    applies_to JSON NULL,                            -- {payee_types, designations, exclude:[{type,id}]}
    max_amount DECIMAL(10,2) NULL,
    taxable TINYINT(1) NOT NULL DEFAULT 1,
    status ENUM('draft','applied','cancelled') NOT NULL DEFAULT 'draft',
    applied_at TIMESTAMP NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE salary_pay_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    method VARCHAR(12) NOT NULL,                 -- cash | bank | bkash | nagad | rocket | cheque
    account_name VARCHAR(120) NULL,
    account_number TEXT NULL,                    -- encrypted cast; never returned by any API (last 4 only)
    bank_name VARCHAR(100) NULL,
    branch_name VARCHAR(100) NULL,
    routing_number VARCHAR(20) NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY unique_pay_account (institution_id, payee_type, payee_id, method),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
- **Route (24):**

```
GET /hr/salary-components -> SalaryComponentController@index [role:admin,accountant] (module hr_payroll)
POST /hr/salary-components -> SalaryComponentController@store [role:admin,accountant] (module hr_payroll)
PUT /hr/salary-components/{id} -> SalaryComponentController@update [role:admin,accountant] (module hr_payroll)
DELETE /hr/salary-components/{id} -> SalaryComponentController@destroy [role:admin,accountant] (module hr_payroll)
GET /hr/people/{type}/{id}/salary -> SalaryStructureController@history [role:admin,accountant] (module hr_payroll)
GET /hr/people/{type}/{id}/pay-accounts -> PayAccountController@show [role:admin,accountant] (module hr_payroll)
PUT /hr/people/{type}/{id}/pay-accounts -> PayAccountController@update [role:admin,accountant] (module hr_payroll)
GET /hr/revisions -> SalaryRevisionController@index [role:admin,accountant] (module hr_payroll)
POST /hr/revisions -> SalaryRevisionController@store [role:admin,accountant] (module hr_payroll)
GET /hr/revisions/{id} -> SalaryRevisionController@show [role:admin,accountant] (module hr_payroll)
POST /hr/revisions/{id}/approve -> SalaryRevisionController@approve [role:admin,accountant] (module hr_payroll)
POST /hr/revisions/{id}/reject -> SalaryRevisionController@reject [role:admin,accountant] (module hr_payroll)
POST /hr/revisions/{id}/cancel -> SalaryRevisionController@cancel [role:admin,accountant] (module hr_payroll)
GET /hr/revisions/{id}/letter.pdf -> SalaryRevisionController@letter [role:admin,accountant] (module hr_payroll)
POST /hr/increment-batches/preview -> IncrementBatchController@preview [role:admin,accountant] (module hr_payroll)
POST /hr/increment-batches -> IncrementBatchController@store [role:admin,accountant] (module hr_payroll)
GET /hr/bonus-schemes -> BonusSchemeController@index [role:admin,accountant] (module hr_payroll)
POST /hr/bonus-schemes -> BonusSchemeController@store [role:admin,accountant] (module hr_payroll)
GET /hr/bonus-schemes/{id} -> BonusSchemeController@show [role:admin,accountant] (module hr_payroll)
PUT /hr/bonus-schemes/{id} -> BonusSchemeController@update [role:admin,accountant] (module hr_payroll)
DELETE /hr/bonus-schemes/{id} -> BonusSchemeController@destroy [role:admin,accountant] (module hr_payroll)
POST /hr/bonus-schemes/{id}/preview -> BonusSchemeController@preview [role:admin,accountant] (module hr_payroll)
POST /hr/bonus-schemes/{id}/apply -> BonusSchemeController@apply [role:admin,accountant] (module hr_payroll)
POST /hr/bonus-schemes/{id}/cancel -> BonusSchemeController@cancel [role:admin,accountant] (module hr_payroll)
```
- **লিখবেন ও সবুজ করবেন:** `SalaryStructureTest` (docs/modules/staff-payroll.md), `RevisionLifecycleTest` (docs/modules/staff-payroll.md), `IncrementBatchTest` (docs/modules/staff-payroll.md), `BonusSchemeTest` (docs/modules/staff-payroll.md), `SalaryAccessTest` (docs/modules/staff-payroll.md)
- **শেষ-শর্ত (Done When):** একই ব্যক্তির দুটি কাঠামোর কার্যকর-সময় ওভারল্যাপ করে না (`SalaryStructureTest`)। সংশোধন draft → অনুমোদিত → প্রয়োগকৃত, প্রয়োগের পর অপরিবর্তনীয় (`RevisionLifecycleTest`)। ব্যাচ-ইনক্রিমেন্ট আগে `preview`, তারপর প্রয়োগ (`IncrementBatchTest`)। বোনাস-স্কিম স্পেকের ভিত্তি/ন্যূনতম-চাকরি/আনুপাতিক নিয়মে (`BonusSchemeTest`)। বেতন-তথ্য শুধু অনুমতিপ্রাপ্ত ভূমিকা দেখে; শিক্ষক শুধু নিজেরটা; **Super Admin ও প্ল্যাটফর্ম-সহায়তা কেউ নয়** (`SalaryAccessTest`, D33)।
- **যাচাই:** `php artisan test --filter=Salary` · `php artisan test --filter=Revision` · `php artisan test --filter=Bonus`

### TASK `R3.6` — সমন্বয় (জরিমানা/ওভারটাইম) ও অগ্রিম/ঋণ

- **নির্ভর করে:** `R3.5`
- **লক্ষ্য:** বেতনের উপর ইতিবাচক/নেতিবাচক সমন্বয় (জরিমানা, ওভারটাইম, অতিরিক্ত ক্লাস) এবং অগ্রিম/ঋণ, কিস্তিতে স্বয়ংক্রিয় কর্তন।
- **সীমা / নোট:** "অতিরিক্ত ক্লাস" বদলি-শিক্ষক মডিউলের (R2) সাথে যুক্ত হলে স্বয়ংক্রিয়; না থাকলে হাতে-এন্ট্রি।
- **পড়ুন:** `docs/modules/staff-payroll.md`, `docs/modules/finance-advanced.md`
- **মডিউল-কী:** `hr_payroll`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE salary_adjustments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(12) NOT NULL,                   -- bonus | allowance | overtime | extra_class | arrear | fine | recovery | other
    direction ENUM('earning','deduction') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,               -- always positive; direction carries the sign
    month VARCHAR(7) NOT NULL,                   -- payroll month it lands in
    taxable TINYINT(1) NOT NULL DEFAULT 1,
    scheme_id BIGINT UNSIGNED NULL,
    revision_id BIGINT UNSIGNED NULL,
    description VARCHAR(255) NULL,
    attachment VARCHAR(255) NULL,
    status ENUM('pending','approved','applied','cancelled') NOT NULL DEFAULT 'pending',
    payroll_item_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_scheme_payee (scheme_id, payee_type, payee_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_adjustments_month ON salary_adjustments(institution_id, month, status);
```
```sql
CREATE TABLE salary_advances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255) NULL,
    installments INT NOT NULL DEFAULT 1,
    installment_amount DECIMAL(10,2) NOT NULL,
    recover_from_month VARCHAR(7) NOT NULL,
    recovered DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(12) NULL,
    status ENUM('requested','approved','active','closed','rejected','written_off') NOT NULL DEFAULT 'requested',
    requested_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    disbursed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
- **Route (9):**

```
GET /hr/adjustments -> SalaryAdjustmentController@index [role:admin,accountant] (module hr_payroll)
POST /hr/adjustments -> SalaryAdjustmentController@store [role:admin,accountant] (module hr_payroll)
GET /hr/adjustments/suggest-extra-class -> SalaryAdjustmentController@suggestExtraClass [role:admin,accountant] (module hr_payroll)
POST /hr/adjustments/{id}/approve -> SalaryAdjustmentController@approve [role:admin,accountant] (module hr_payroll)
POST /hr/adjustments/{id}/cancel -> SalaryAdjustmentController@cancel [role:admin,accountant] (module hr_payroll)
GET /hr/advances -> SalaryAdvanceController@index [role:admin,accountant] (module hr_payroll)
POST /hr/advances -> SalaryAdvanceController@store [role:admin,accountant] (module hr_payroll)
GET /hr/advances/{id} -> SalaryAdvanceController@show [role:admin,accountant] (module hr_payroll)
POST /hr/advances/{id}/{action} -> SalaryAdvanceController@transition [role:admin,accountant] (module hr_payroll)
```
- **লিখবেন ও সবুজ করবেন:** `AdvanceRecoveryTest` (docs/modules/staff-payroll.md)
- **শেষ-শর্ত (Done When):** অগ্রিম অনুমোদন → বিতরণ → কিস্তি বেতন থেকে কাটা; কিস্তি বাদ (skip) ও অবলোপন (write-off) নথিভুক্ত (`AdvanceRecoveryTest`); অগ্রিম বিতরণ ক্যাশবুকে নগদ-বহির্গমন। সমন্বয় নির্দিষ্ট মাসে বাঁধা, অনুমোদনের পর বদলায় না। শিক্ষকের `/teacher/salary/advances` শুধু নিজের।
- **যাচাই:** `php artisan test --filter=Advance`

### TASK `R3.7` — Payroll run, payslip ও পরিশোধ

- **নির্ভর করে:** `R3.6`
- **লক্ষ্য:** মাসিক বেতন-হিসাব (run): গণনা → পর্যালোচনা → maker-checker অনুমোদন → পরিশোধ-নথি → payslip PDF। অনুমোদিত run অপরিবর্তনীয়।
- **সীমা / নোট:** ব্যাংক-ফাইল ও কর-হার আপনার হিসাবরক্ষক/ব্যাংক থেকে আসল ফরম্যাট পেলে।
- **পড়ুন:** `docs/modules/staff-payroll.md`, `docs/LOCKED-DECISIONS.md`, `infra/spec-verify/payroll_ref.py`
- **মডিউল-কী:** `hr_payroll`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE payroll_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    month VARCHAR(7) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'regular',     -- regular | bonus | final | supplementary
    label VARCHAR(80) NOT NULL DEFAULT '',
    status ENUM('draft','reviewed','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
    settings_snapshot JSON NULL,
    payees_count INT NOT NULL DEFAULT 0,
    total_gross DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_net DECIMAL(12,2) NOT NULL DEFAULT 0,
    prepared_by BIGINT UNSIGNED NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    approved_at TIMESTAMP NULL,
    self_approved TINYINT(1) NOT NULL DEFAULT 0,
    paid_at TIMESTAMP NULL,
    cancelled_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_payroll_run (institution_id, month, kind, label),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE payroll_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    run_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    structure_id BIGINT UNSIGNED NULL,
    days_in_month TINYINT UNSIGNED NOT NULL,
    paid_days DECIMAL(5,2) NOT NULL DEFAULT 0,
    absent_days DECIMAL(5,2) NOT NULL DEFAULT 0,
    lwp_days DECIMAL(5,2) NOT NULL DEFAULT 0,
    late_count INT NOT NULL DEFAULT 0,
    basic DECIMAL(10,2) NOT NULL DEFAULT 0,
    gross DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_earnings DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    net DECIMAL(10,2) NOT NULL DEFAULT 0,
    breakdown JSON NOT NULL,                     -- immutable snapshot after the run is approved (staff-payroll.md section 7.3)
    status ENUM('ready','held','paid','failed') NOT NULL DEFAULT 'ready',
    hold_reason VARCHAR(255) NULL,
    payment_method VARCHAR(12) NULL,
    paid_reference VARCHAR(100) NULL,
    paid_at TIMESTAMP NULL,
    paid_by BIGINT UNSIGNED NULL,
    slip_no VARCHAR(30) NULL,
    UNIQUE KEY unique_item_per_run (run_id, payee_type, payee_id),
    UNIQUE KEY unique_slip_no (institution_id, slip_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (run_id) REFERENCES payroll_runs(id)
);
CREATE INDEX idx_payroll_items_payee ON payroll_items(institution_id, payee_type, payee_id);
```
- **Route (13):**

```
GET /hr/payroll-runs -> PayrollRunController@index [role:admin,accountant] (module hr_payroll)
POST /hr/payroll-runs -> PayrollRunController@store [role:admin,accountant] (module hr_payroll)
GET /hr/payroll-runs/{id} -> PayrollRunController@show [role:admin,accountant] (module hr_payroll)
POST /hr/payroll-runs/{id}/{action} -> PayrollRunController@transition [role:admin,accountant] (module hr_payroll)
PATCH /hr/payroll-items/{id} -> PayrollItemController@update [role:admin,accountant] (module hr_payroll)
GET /hr/payroll-items/{id}/slip.pdf -> PayrollItemController@slip [role:admin,accountant] (module hr_payroll)
GET /hr/payroll-runs/{id}/{file} -> PayrollRunController@download [role:admin,accountant] (module hr_payroll)
GET /hr/reports/{name} -> PayrollReportController@show [role:admin,accountant] (module hr_payroll)
GET /teacher/salary -> TeacherSalaryController@summary [role:teacher] (module hr_payroll)
GET /teacher/salary/slips -> TeacherSalaryController@slips [role:teacher] (module hr_payroll)
GET /teacher/salary/slips/{id}.pdf -> TeacherSalaryController@slip [role:teacher] (module hr_payroll)
GET /teacher/salary/advances -> TeacherSalaryController@advances [role:teacher] (module hr_payroll)
GET /teacher/salary/history -> TeacherSalaryController@history [role:teacher] (module hr_payroll)
```
- **লিখবেন ও সবুজ করবেন:** `PayrollGoldenTest` (docs/modules/staff-payroll.md), `PayrollProrationTest` (docs/modules/staff-payroll.md), `ArrearsTest` (docs/modules/staff-payroll.md), `MakerCheckerTest` (docs/modules/staff-payroll.md), `PayrollImmutabilityTest` (docs/modules/staff-payroll.md), `PayrollPaymentTest` (docs/modules/staff-payroll.md), `PayrollTenancyTest` (docs/modules/staff-payroll.md)
- **শেষ-শর্ত (Done When):** `PayrollGoldenTest`: স্পেকের **১৭টি fixture** স্বাধীন গণনা `infra/spec-verify/payroll_ref.py`-এর সাথে পয়সা-পর্যন্ত মেলে (যেমন gross **30,500.00**, নিট **28,532.26**; Decimal, ROUND_HALF_UP)। অর্ধ-মাসের যোগদান/প্রস্থানে আনুপাতিক (`PayrollProrationTest`); পূর্ববর্তী মাসের সংশোধন বকেয়া (`ArrearsTest`)। যে বানায় সে অনুমোদন করতে পারে না — কেবল প্রতিষ্ঠানে একমাত্র অ্যাডমিন থাকলে ব্যতিক্রম, audit-সহ (`MakerCheckerTest`)। অনুমোদিত run বদলানো যায় না; সংশোধন নতুন run (`PayrollImmutabilityTest`)। পরিশোধ ক্যাশবুক/ব্যাংকে (`PayrollPaymentTest`)। শিক্ষক শুধু নিজের payslip (`SalaryAccessTest`)। **ব্যাংক-disbursement ফাইলের ফরম্যাট ফাঁকা স্লট (`TODO(OD-bank-format)`) — অনুমান নয়।** payslip PDF-এর ইঞ্জিন Spike S5c-র ফল।
- **যাচাই:** `php artisan test --filter=Payroll` · `python3 infra/spec-verify/verify.py . --deep`

### TASK `R3.8` — ভবিষ্য তহবিল (PF), কর ও চূড়ান্ত নিষ্পত্তি

- **নির্ভর করে:** `R3.7`
- **লক্ষ্য:** PF-খতিয়ান (কর্মচারী ও প্রতিষ্ঠানের অংশ), উৎসে-কর (প্যারামিটার, ডিফল্টে বন্ধ), চাকরি-ছাড়ার চূড়ান্ত নিষ্পত্তি।
- **সীমা / নোট:** **আইনি হার (PF, কর, গ্র্যাচুইটি) স্পেকে অনুমান করা নেই — আইনজীবী/হিসাবরক্ষক থেকে নিশ্চিত হওয়া বাধ্যতামূলক (প্রকাশ্য বিক্রির আগে)।**
- **পড়ুন:** `docs/modules/staff-payroll.md`, `docs/LOCKED-DECISIONS.md`
- **মডিউল-কী:** `hr_payroll`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE provident_fund_entries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payee_type VARCHAR(10) NOT NULL,
    payee_id BIGINT UNSIGNED NOT NULL,
    month VARCHAR(7) NOT NULL,
    kind VARCHAR(12) NOT NULL,                   -- employee | employer | withdrawal | interest | adjustment
    amount DECIMAL(10,2) NOT NULL,               -- withdrawal / negative adjustment stored negative
    payroll_item_id BIGINT UNSIGNED NULL,
    note VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_pf_payee ON provident_fund_entries(institution_id, payee_type, payee_id, month);
```
- **Route (4):**

```
POST /hr/final-settlement/{type}/{id}/start -> FinalSettlementController@start [role:admin,accountant] (module hr_payroll)
GET /hr/pf/entries -> ProvidentFundController@index [role:admin,accountant] (module hr_payroll)
POST /hr/pf/entries -> ProvidentFundController@store [role:admin,accountant] (module hr_payroll)
GET /hr/pf/{type}/{id}/statement.pdf -> ProvidentFundController@statement [role:admin,accountant] (module hr_payroll)
```
- **লিখবেন ও সবুজ করবেন:** `PfLedgerTest` (docs/modules/staff-payroll.md), `TaxModeTest` (docs/modules/staff-payroll.md), `FinalSettlementTest` (docs/modules/staff-payroll.md)
- **শেষ-শর্ত (Done When):** PF-সারি শুধু যোগ (append-only), স্টেটমেন্ট PDF (`PfLedgerTest`)। কর-মোড ডিফল্ট **বন্ধ**; চালু করলে হার প্রতিষ্ঠান-সেটিং থেকে, কোডে ধরা নেই (`TaxModeTest`)। চূড়ান্ত নিষ্পত্তি বকেয়া বেতন + PF + অগ্রিম-সমন্বয় হিসাব করে; গ্র্যাচুইটি/ছুটি-নগদায়ন হাতে-সমন্বয় (`FinalSettlementTest`)।
- **যাচাই:** `php artisan test --filter=Pf` · `php artisan test --filter=TaxMode` · `php artisan test --filter=FinalSettlement`

### TASK `R3.9` — স্টোর / ইনভেন্টরি

- **নির্ভর করে:** `R3.2`
- **লক্ষ্য:** স্টকের পণ্য, আসা-যাওয়া (ক্রয়, ইস্যু, বিক্রি, সমন্বয়), গড়-ব্যয় (moving average), বিক্রয়-রসিদ। স্টক শুধু আসা-যাওয়ার মাধ্যমে বদলায়। plan-নির্ভর (Pro+)।
- **পড়ুন:** `docs/modules/inventory.md`, `docs/LOCKED-DECISIONS.md`
- **মডিউল-কী:** `inventory`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE inventory_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(60) NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    sale_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    avg_cost DECIMAL(10,2) NOT NULL DEFAULT 0,    -- moving average, maintained by InventoryService
    reorder_level DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock DECIMAL(12,2) NOT NULL DEFAULT 0,       -- CACHE of the movement ledger; only InventoryService writes it
    is_sellable TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_item_code (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE inventory_movements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    type ENUM('receive','issue','sale','return','adjust','damage') NOT NULL,
    qty DECIMAL(12,2) NOT NULL,                   -- always positive; `direction` (+1/-1) gives the sign
    direction TINYINT NOT NULL,                   -- +1 adds stock, -1 removes
    unit_amount DECIMAL(10,2) NOT NULL DEFAULT 0, -- receive: unit cost; sale: unit price
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    balance_after DECIMAL(12,2) NOT NULL,
    student_id BIGINT UNSIGNED NULL,
    issued_to_type VARCHAR(10) NULL,              -- student | teacher | staff | department
    issued_to_id BIGINT UNSIGNED NULL,
    supplier VARCHAR(100) NULL,
    receipt_no VARCHAR(30) NULL,                  -- sales only (prefix STR-)
    payment_method VARCHAR(16) NULL,
    reference VARCHAR(100) NULL,
    note VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_store_receipt (institution_id, receipt_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);
CREATE INDEX idx_inventory_item ON inventory_movements(institution_id, item_id, created_at);
```
- **Route (9):**

```
GET /inventory/items -> InventoryItemController@index [role:admin,accountant] (module inventory)
POST /inventory/items -> InventoryItemController@store [role:admin,accountant] (module inventory)
PUT /inventory/items/{id} -> InventoryItemController@update [role:admin,accountant] (module inventory)
DELETE /inventory/items/{id} -> InventoryItemController@destroy [role:admin,accountant] (module inventory)
GET /inventory/items/{id}/ledger -> InventoryItemController@ledger [role:admin,accountant] (module inventory)
POST /inventory/{type} -> InventoryMovementController@store [role:admin,accountant] (module inventory)
GET /inventory/stock -> InventoryReportController@stock [role:admin,accountant] (module inventory)
GET /inventory/reports/{name} -> InventoryReportController@show [role:admin,accountant] (module inventory)
GET /inventory/sales/{receipt_no}/receipt.pdf -> InventoryReportController@receipt [role:admin,accountant] (module inventory)
```
- **লিখবেন ও সবুজ করবেন:** `InventoryGateTest` (docs/modules/inventory.md), `StockLedgerTest` (docs/modules/inventory.md), `StockConcurrencyTest` (docs/modules/inventory.md), `InventoryImmutabilityTest` (docs/modules/inventory.md), `StoreReceiptTest` (docs/modules/inventory.md), `InventoryTenancyTest` (docs/modules/inventory.md)
- **শেষ-শর্ত (Done When):** স্টক-সংখ্যা সরাসরি সম্পাদনা নেই — শুধু movement (`StockLedgerTest`); movement অপরিবর্তনীয়, ভুল সংশোধন উল্টো movement (`InventoryImmutabilityTest`)। একই পণ্যে একসাথে ইস্যুতে স্টক কখনো ঋণাত্মক হয় না — সারি-লক (`StockConcurrencyTest`)। গড়-ব্যয় স্পেকের উদাহরণের সাথে মেলে (স্বাধীন গণনা `refs_r11.py`)। বিক্রয়-রসিদ PDF ও ক্যাশবুকে প্রবেশ (`StoreReceiptTest`)। plan-নির্ভর: নিম্ন plan-এ 403 (`InventoryGateTest`)।
- **যাচাই:** `php artisan test --filter=Inventory` · `php artisan test --filter=Stock` · `python3 infra/spec-verify/refs_r11.py`

### TASK `R3.10` — হিসাব-খাত (Accounting) — double-entry

- **নির্ভর করে:** `R3.3`, `R3.7`, `R3.9`
- **লক্ষ্য:** ডবল-এন্ট্রি খতিয়ান: ডিফল্ট হিসাব-তালিকা, ভাউচার (স্বয়ংক্রিয় ও হাতে), ব্যাংক-মিলকরণ, বাজেট, শুরুর-জের উইজার্ড, সময়-লক। plan-নির্ভর (Pro+)। ফি-রসিদ, রিফান্ড, খরচ, বেতন, অগ্রিম, স্টোর থেকে ভাউচার নিজে তৈরি হয়।
- **সীমা / নোট:** হিসাব-তালিকা ও রিপোর্টের ফরম্যাট একজন হিসাবরক্ষক/অডিটরকে দিয়ে দেখাতে হবে (`PRODUCT.md` খোলা কাজ)।
- **পড়ুন:** `docs/modules/accounting.md`, `docs/LOCKED-DECISIONS.md`, `infra/spec-verify/refs_r12.py`
- **মডিউল-কী:** `accounting`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE ledger_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(120) NOT NULL,
    type ENUM('asset','liability','equity','income','expense') NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    is_cash_or_bank TINYINT(1) NOT NULL DEFAULT 0,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY unique_account_code (institution_id, code),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE vouchers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    voucher_no VARCHAR(30) NOT NULL,
    type ENUM('receipt','payment','journal','contra') NOT NULL,
    date DATE NOT NULL,
    narration VARCHAR(255) NULL,
    source VARCHAR(12) NOT NULL DEFAULT 'manual',   -- manual | fee | expense | payroll | donation | store | refund
    source_id BIGINT UNSIGNED NULL,
    status ENUM('draft','posted','reversed') NOT NULL DEFAULT 'draft',
    reverses_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    posted_by BIGINT UNSIGNED NULL,
    posted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_voucher_no (institution_id, voucher_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_voucher_source ON vouchers(institution_id, source, source_id);
CREATE UNIQUE INDEX uq_voucher_source ON vouchers(institution_id, source, source_id);
CREATE INDEX idx_vouchers_inst_date ON vouchers(institution_id, date);
```
```sql
CREATE TABLE voucher_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    voucher_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    debit DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit DECIMAL(12,2) NOT NULL DEFAULT 0,
    memo VARCHAR(255) NULL,
    reconciled_at TIMESTAMP NULL,
    reconciled_ref VARCHAR(50) NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
    FOREIGN KEY (account_id) REFERENCES ledger_accounts(id)
);
CREATE INDEX idx_voucher_lines_account ON voucher_lines(institution_id, account_id);
```
```sql
CREATE TABLE budgets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    fiscal_year VARCHAR(9) NOT NULL,                -- 2027 or 2026-2027
    status ENUM('draft','approved','closed') NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_budget (institution_id, name, fiscal_year),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE budget_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    budget_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    UNIQUE KEY unique_budget_line (budget_id, account_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (budget_id) REFERENCES budgets(id),
    FOREIGN KEY (account_id) REFERENCES ledger_accounts(id)
);
```
- **Route (20):**

```
GET /accounting/accounts -> AccountController@index [role:admin,accountant] (module accounting)
POST /accounting/accounts -> AccountController@store [role:admin,accountant] (module accounting)
PUT /accounting/accounts/{id} -> AccountController@update [role:admin,accountant] (module accounting)
GET /accounting/accounts/tree -> AccountController@tree [role:admin,accountant] (module accounting)
GET /accounting/vouchers -> VoucherController@index [role:admin,accountant] (module accounting)
POST /accounting/vouchers -> VoucherController@store [role:admin,accountant] (module accounting)
GET /accounting/vouchers/{id} -> VoucherController@show [role:admin,accountant] (module accounting)
POST /accounting/vouchers/{id}/{action} -> VoucherController@transition [role:admin,accountant] (module accounting)
GET /accounting/budgets -> BudgetController@index [role:admin,accountant] (module accounting)
POST /accounting/budgets -> BudgetController@store [role:admin,accountant] (module accounting)
GET /accounting/budgets/{id} -> BudgetController@show [role:admin,accountant] (module accounting)
PUT /accounting/budgets/{id} -> BudgetController@update [role:admin,accountant] (module accounting)
PUT /accounting/budgets/{id}/lines -> BudgetController@lines [role:admin,accountant] (module accounting)
POST /accounting/budgets/{id}/approve -> BudgetController@approve [role:admin,accountant] (module accounting)
GET /accounting/reports/{name} -> AccountingReportController@show [role:admin,accountant] (module accounting)
GET /accounting/bank-reconciliation/{account_id} -> BankReconciliationController@show [role:admin,accountant] (module accounting)
POST /accounting/bank-reconciliation/{account_id}/{action} -> BankReconciliationController@act [role:admin,accountant] (module accounting)
POST /accounting/opening-balances -> AccountingSettingController@opening [role:admin,accountant] (module accounting)
POST /accounting/repost -> AccountingSettingController@repost [role:admin,accountant] (module accounting)
PUT /accounting/settings -> AccountingSettingController@update [role:admin,accountant] (module accounting)
```
- **লিখবেন ও সবুজ করবেন:** `PostingMapTest` (docs/modules/accounting.md), `AutoPostingIdempotentTest` (docs/modules/accounting.md), `VoucherBalanceTest` (docs/modules/accounting.md), `VoucherImmutabilityTest` (docs/modules/accounting.md), `TrialBalanceZeroTest` (docs/modules/accounting.md), `LedgerCashEqualsCashBookTest` (docs/modules/accounting.md), `BudgetActualTest` (docs/modules/accounting.md), `BankReconcileTest` (docs/modules/accounting.md), `PeriodLockTest` (docs/modules/accounting.md), `FundAccountGuardTest` (docs/modules/accounting.md), `StartDateTest` (docs/modules/accounting.md), `AccountingAccessTest` (docs/modules/accounting.md), `AccountingTenancyTest` (docs/modules/accounting.md)
- **শেষ-শর্ত (Done When):** প্রতিটি ভাউচারে ডেবিট = ক্রেডিট (`VoucherBalanceTest`); পোস্ট-করা ভাউচার অপরিবর্তনীয়, ভুল সংশোধন উল্টো ভাউচার (`VoucherImmutabilityTest`)। স্বয়ংক্রিয় ভাউচার প্রতি উৎস-রেকর্ডে **ঠিক একবার** — ডাটাবেস-স্তরে অনন্য কী (`AutoPostingIdempotentTest`)। স্পেকের উদাহরণে: খতিয়ান `1100` = ক্যাশবুক সমাপনী **19,400.00** (`LedgerCashEqualsCashBookTest`); trial balance ডেবিট-ক্রেডিট ফারাক **0.00** (`TrialBalanceZeroTest`); bKash রসিদ `1300`-এ, `1100`-এ নয় (`PostingMapTest`); বাজেট বনাম বাস্তব **48.00% / −11,000.00 / 0.00%** (`BudgetActualTest`) — সব `refs_r12.py`-এর সাথে মেলে। সময়-লক (`locked_until`) এর আগের তারিখে পোস্ট 422 (`PeriodLockTest`)। হাতে-ভাউচার তহবিল-হিসাব ছুঁতে পারে না (`FundAccountGuardTest`)। ডিফল্ট **নগদ-ভিত্তিক** (accrual নয়)।
- **যাচাই:** `php artisan test --filter=Accounting` · `php artisan test --filter=Voucher` · `python3 infra/spec-verify/refs_r12.py`

### TASK `R3.11` — দান ও তহবিল (ঐচ্ছিক মডিউল)

- **নির্ভর করে:** `R3.10`
- **লক্ষ্য:** দাতা, তহবিল (শ্রেণি শুধু লেবেল), প্রচারণা, দানের রসিদ। তহবিলের বেশি খরচ আটকানো। ঐচ্ছিক (opt-in) মডিউল — চালু না করলে লুকানো।
- **সীমা / নোট:** অনলাইন দান ও দাতা-তালিকা প্রকাশ নেই (ডিফল্ট)।
- **পড়ুন:** `docs/modules/donations.md`, `docs/LOCKED-DECISIONS.md`
- **মডিউল-কী:** `donations`
- **টেবিল (migration, model, factory এই ধাপেই):**

```sql
CREATE TABLE donors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NULL,
    address VARCHAR(255) NULL,
    type VARCHAR(12) NOT NULL DEFAULT 'individual',  -- individual | organization
    note VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY unique_donor_phone (institution_id, phone),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE donation_funds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'general',     -- general | zakat | sadaqah | waqf | project | other
    restricted TINYINT(1) NOT NULL DEFAULT 0,        -- may only be spent for its stated purpose
    description VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY unique_fund_name (institution_id, name),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
```
```sql
CREATE TABLE donation_campaigns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    fund_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    goal_amount DECIMAL(12,2) NULL,
    starts_on DATE NULL,
    ends_on DATE NULL,
    status ENUM('draft','active','closed') NOT NULL DEFAULT 'draft',
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (fund_id) REFERENCES donation_funds(id)
);
```
```sql
CREATE TABLE donations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    donor_id BIGINT UNSIGNED NULL,                   -- NULL = anonymous
    fund_id BIGINT UNSIGNED NOT NULL,
    campaign_id BIGINT UNSIGNED NULL,
    amount DECIMAL(12,2) NOT NULL,
    method VARCHAR(16) NOT NULL DEFAULT 'cash',
    received_on DATE NOT NULL,
    receipt_no VARCHAR(30) NOT NULL,                 -- prefix DON-
    purpose_note VARCHAR(255) NULL,
    status ENUM('received','reversed') NOT NULL DEFAULT 'received',
    reverses_id BIGINT UNSIGNED NULL,
    received_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_donation_receipt (institution_id, receipt_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (fund_id) REFERENCES donation_funds(id)
);
```
- **Route (21):**

```
GET /donors -> DonorController@index [role:admin,accountant] (module donations)
POST /donors -> DonorController@store [role:admin,accountant] (module donations)
GET /donors/{id} -> DonorController@show [role:admin,accountant] (module donations)
PUT /donors/{id} -> DonorController@update [role:admin,accountant] (module donations)
DELETE /donors/{id} -> DonorController@destroy [role:admin,accountant] (module donations)
GET /donors/{id}/statement.pdf -> DonorController@statement [role:admin,accountant] (module donations)
GET /donation-funds -> DonationFundController@index [role:admin,accountant] (module donations)
POST /donation-funds -> DonationFundController@store [role:admin,accountant] (module donations)
GET /donation-funds/{id} -> DonationFundController@show [role:admin,accountant] (module donations)
PUT /donation-funds/{id} -> DonationFundController@update [role:admin,accountant] (module donations)
GET /donation-funds/{id}/statement -> DonationFundController@statement [role:admin,accountant] (module donations)
GET /donation-campaigns -> DonationCampaignController@index [role:admin,accountant] (module donations)
POST /donation-campaigns -> DonationCampaignController@store [role:admin,accountant] (module donations)
GET /donation-campaigns/{id} -> DonationCampaignController@show [role:admin,accountant] (module donations)
PUT /donation-campaigns/{id} -> DonationCampaignController@update [role:admin,accountant] (module donations)
GET /donation-campaigns/{id}/progress -> DonationCampaignController@progress [role:admin,accountant] (module donations)
GET /donations -> DonationController@index [role:admin,accountant] (module donations)
POST /donations -> DonationController@store [role:admin,accountant] (module donations)
GET /donations/{id} -> DonationController@show [role:admin,accountant] (module donations)
POST /donations/{id}/reverse -> DonationController@reverse [role:admin,accountant] (module donations)
GET /donations/{id}/receipt.pdf -> DonationController@receipt [role:admin,accountant] (module donations)
```
- **লিখবেন ও সবুজ করবেন:** `DonationGateTest` (docs/modules/donations.md), `DonationReceiptTest` (docs/modules/donations.md), `DonationReversalTest` (docs/modules/donations.md), `DonorPrivacyTest` (docs/modules/donations.md), `FundBalanceEqualsLedgerTest` (docs/modules/donations.md), `FundGuardTest` (docs/modules/donations.md)
- **শেষ-শর্ত (Done When):** সীমিত তহবিলে খরচ > জমা হলে 422 `fund_overdrawn` — স্পেকের উদাহরণ: 10,000 − 7,000 সফল, আরও 4,000 প্রত্যাখ্যাত (`FundGuardTest`)। দান-রসিদ `DON-{YYYY}-{ক্রম}` (`DonationReceiptTest`); দান বাতিল = নতুন সারি (`DonationReversalTest`, D32)। দাতার তথ্য শিক্ষক/ছাত্র/অভিভাবক কেউ দেখে না (`DonorPrivacyTest`)। তহবিলের ব্যালেন্স = খতিয়ানের তহবিল-হিসাব (`FundBalanceEqualsLedgerTest`)। `opt_in_modules`-এ না থাকলে 403 (`DonationGateTest`)। **সিস্টেম কোনো ধর্মীয়/আইনি রায় দেয় না — কোন তহবিল থেকে কী খরচ চলবে তা প্রতিষ্ঠান ঠিক করে (D39)।**
- **যাচাই:** `php artisan test --filter=Donation` · `php artisan test --filter=Fund`

### TASK `R3.12` — R3-এর পাতা (ফ্রন্টএন্ড), ভূমিকাভেদে

- **নির্ভর করে:** `R3.11`
- **লক্ষ্য:** প্রতিটি R3 মডিউলের পাতা মেনুতে: ক্যাশবুক, রিফান্ড, কর্মচারী/ছুটি/বেতন, payslip, ইনভেন্টরি, হিসাব-খাত, দান। মডিউল বন্ধ থাকলে মেনু-আইটেম লুকানো।
- **সীমা / নোট:** পাতার তালিকা স্বয়ংক্রিয় — `AUTHORIZATION.md`-এর মেনু থেকে R3-মডিউল-সংযুক্ত আইটেম।
- **পড়ুন:** `docs/AUTHORIZATION.md`, `docs/UI-PACKS.md`, `docs/DESIGN-SYSTEM.md`, `docs/I18N.md`
- **পাতা (মেনু থেকে):**

```
admin: cashbook (/admin/fees/cashbook)
admin: expenses (/admin/expenses)
admin: inventory (/admin/inventory)
admin: hr-staff (/admin/hr/staff)
admin: hr-components (/admin/hr/salary-components)
admin: hr-revisions (/admin/hr/revisions)
admin: hr-increments (/admin/hr/increments)
admin: hr-bonus (/admin/hr/bonus)
admin: hr-adjustments (/admin/hr/adjustments)
admin: hr-advances (/admin/hr/advances)
admin: hr-payroll (/admin/hr/payroll)
admin: hr-pf (/admin/hr/pf)
admin: leave (/admin/hr/leave)
admin: t-att (/admin/hr/attendance)
admin: hr-reports (/admin/hr/reports)
admin: acc-vouchers (/admin/accounting/vouchers)
admin: acc-accounts (/admin/accounting/accounts)
admin: acc-budgets (/admin/accounting/budgets)
admin: acc-bank (/admin/accounting/bank)
admin: acc-reports (/admin/accounting/reports)
admin: don-donors (/admin/donations/donors)
admin: don-funds (/admin/donations/funds)
admin: don-campaigns (/admin/donations/campaigns)
admin: don-list (/admin/donations)
```
- **লিখবেন ও সবুজ করবেন:** `MenuReleaseTest` (docs/TESTING.md)
- **শেষ-শর্ত (Done When):** নিচের তালিকার প্রতিটি পাতা আছে ও তার পিছনে route আছে; মডিউল বা plan বন্ধ হলে মেনু-আইটেম ও route দুটোই বন্ধ (`MenuReleaseTest`)। সব পাতা বাংলা ও ইংরেজিতে, মোবাইলে (৩৬০px) ব্যবহারযোগ্য। বেতন/payslip-পাতা শুধু অনুমতিপ্রাপ্ত ভূমিকার মেনুতে।
- **যাচাই:** `npm test -- --run MenuReleaseTest` · `node infra/check-theme-rules.mjs`

### TASK `R3.13` — টাকা ও বেতন-তথ্যের নিরাপত্তা — সামগ্রিক যাচাই

- **নির্ভর করে:** `R3.12`
- **লক্ষ্য:** সব R3 টেবিলে স্কুল-বিচ্ছিন্নতা, বেতন-তথ্য প্ল্যাটফর্মের লোকের অগম্য, bulk-লেখা শুধু `TenantBulk`-এর মাধ্যমে।
- **পড়ুন:** `docs/SECURITY.md`, `docs/LOCKED-DECISIONS.md`, `docs/modules/platform-ops.md`
- **লিখবেন ও সবুজ করবেন:** `TenancyArchitectureTest` (docs/TESTING.md)
- **শেষ-শর্ত (Done When):** `TenancyArchitectureTest` সবুজ: R3-এর কোনো মডেল `BelongsToInstitution` ছাড়া নয়, কোনো bulk `insert/upsert` `TenantBulk` ছাড়া নয়। চারটি tenancy-পরীক্ষা (`PayrollTenancyTest`, `AccountingTenancyTest`, `CashBookTenancyTest`, `InventoryTenancyTest`) একসাথে সবুজ। Super Admin বেতন/payslip/PF/অগ্রিম-পথে 403 (D33)। **ব্যাকআপ/export-এ বেতন-ভাগ বাদ** (D33, D38 — tenant export R1.1-এ থাকলে সেখানে যাচাই)। বেতন-অঙ্ক লগ/Sentry-তে যায় না।
- **যাচাই:** `php artisan test --filter=Tenancy`

### TASK `R3.14` — R3-এর কর্মক্ষমতা (ডেটা বাড়লে)

- **নির্ভর করে:** `R3.13`
- **লক্ষ্য:** R3-এর ঘন কোয়েরিগুলো ইনডেক্স-যোগ্য রাখা (ডেটা বাড়লে ধীর না হওয়ার জন্য), `hot-queries.tsv`-এ যুক্ত।
- **সীমা / নোট:** নতুন ইনডেক্স শুধু ক্যাটালগের নাম-ধরা কোয়েরির জন্য (লেখা ধীর করে)।
- **পড়ুন:** `infra/scripts/hot-queries.tsv`, `docs/ops/performance-benchmarks.md`
- **লিখবেন ও সবুজ করবেন:** `PerfCatalogueTest` (docs/TESTING.md)
- **শেষ-শর্ত (Done When):** `python3 infra/spec-verify/plan_check.py .` সবুজ — `hot-queries.tsv`-এর R3-কোয়েরিগুলো (payroll-মাস, কর্মচারী-হাজিরা, ভাউচার-সময়কাল, খতিয়ান-হিসাব, স্টক-আসা-যাওয়া, দান) full-scan ছাড়া, প্রথম equality-কলাম ও তারিখ-সীমা ইনডেক্সের ভিতরে। আসল MySQL-এ `perf-check.py`-এর ধাঁচে মাপা (এখনো চালানো হয়নি)।
- **যাচাই:** `python3 infra/spec-verify/plan_check.py .`

### TASK `R3.A` — R3 গ্রহণ-পরীক্ষা, তারপর চালু

- **নির্ভর করে:** `R3.14`
- **লক্ষ্য:** নিচের গ্রহণ-শর্ত সব সত্য হলে তবেই R3-মডিউল গ্রাহকের জন্য চালু।
- **পড়ুন:** `docs/RELEASE-3.md`
- **শেষ-শর্ত (Done When):** `docs/RELEASE-3.md` §গ্রহণ-শর্ত সবগুলো সত্য ও লিখিত; payroll-এর আইনি/হিসাব-যাচাই হয়েছে; আসল MySQL-এ আচরণ-পরীক্ষা সবুজ।
- **যাচাই:** `python3 infra/spec-verify/verify.py . --deep` · `bash infra/scripts/mysql-smoke.sh`

## ঙ. গ্রহণ-শর্ত (R3 চালুর আগে সব সত্য)

1. দিনের শেষে ক্যাশবুক মিলিয়ে বন্ধ করা যায়; বন্ধ দিনে রসিদ/খরচ বদলানো যায় না; পুনরায় খোলা শুধু Admin ও নথিভুক্ত
2. ফি রিফান্ড সীমা পেরোলে প্রত্যাখ্যাত; রিফান্ডের পর বকেয়া ঠিক; রিফান্ড-সারি অপরিবর্তনীয়
3. কর্মচারী যোগ, শিক্ষক-কর্মচারীর উপস্থিতি, ছুটি আবেদন → অনুমোদন; অবৈতনিক ছুটি বেতনে কাটে
4. তারিখ-ভিত্তিক বেতন-কাঠামো, ব্যাচ-ইনক্রিমেন্ট (আগে preview), বোনাস-স্কিম
5. payroll run: ১৭টি fixture পয়সা-পর্যন্ত মেলে; যে বানায় সে অনুমোদন করে না; অনুমোদিত run অপরিবর্তনীয়; payslip PDF (বাংলা ঠিক)
6. অগ্রিম কিস্তিতে কাটে; জরিমানা/ওভারটাইম সমন্বয় নির্দিষ্ট মাসে বাঁধা
7. PF-খতিয়ান ও চূড়ান্ত নিষ্পত্তি; কর-মোড ডিফল্টে বন্ধ
8. ইনভেন্টরি: স্টক শুধু movement-এ; একসাথে ইস্যুতে ঋণাত্মক হয় না
9. হিসাব-খাত: স্বয়ংক্রিয় ভাউচার প্রতি উৎসে একবার; trial balance 0.00; খতিয়ান 1100 = ক্যাশবুক
10. দান: তহবিলের বেশি খরচ আটকানো; দাতার তথ্য শিক্ষক/অভিভাবক দেখে না
11. Super Admin কোনো বেতন-তথ্য দেখতে পায় না; এক স্কুল অন্যের R3-তথ্য দেখে না (tenancy-পরীক্ষা সবুজ)
12. আসল MySQL-এ স্কিমা ও আচরণ-পরীক্ষা সবুজ; R3 hot-query পরীক্ষা সবুজ
13. payroll-এর আইনি/হিসাব যাচাই (PF, কর, গ্র্যাচুইটি, কর্তনের নিয়ম) একজন হিসাবরক্ষক ও আইনজীবী করেছেন

## চ. বাইরের তথ্য ছাড়া যা এগোয় না (আপনার/বিশেষজ্ঞের কাজ)

- ব্যাংক-disbursement ফাইলের আসল ফরম্যাট (TODO OD-bank-format)
- PF, উৎসে-কর, গ্র্যাচুইটি, ছুটি-নগদায়নের আইনি নিয়ম — আইনজীবী ও হিসাবরক্ষক
- হিসাব-তালিকা ও রিপোর্টের ফরম্যাট — একজন হিসাবরক্ষক/অডিটর
- হিসাব-পদ্ধতি: নগদ-ভিত্তিক না accrual (ডিফল্ট নগদ-ভিত্তিক)
- payslip/রিপোর্ট PDF-এর ইঞ্জিন (Spike S5c)

## ছ. ঐচ্ছিক কাটছাঁট (R3a / R3b)

হিসাব-খাত ও দান বাকি R3 মডিউলের উপর নির্ভর করে, কিন্তু বাকিগুলো এদের ছাড়াই চলে। কাজ কমাতে চাইলে R3.10–R3.11 পরের দফায় সরানো যায় (R3a = R3.0–R3.9, R3.12–R3.14)।
