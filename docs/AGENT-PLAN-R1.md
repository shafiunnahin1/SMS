# AGENT PLAN — Release 1 (স্কুল, প্রকাশ্য বিক্রি)

> **এটি স্বয়ংক্রিয়ভাবে তৈরি — হাতে সম্পাদনা করবেন না।** পুনঃতৈরি: `python3 infra/spec-verify/gen_agent_plan.py .` (উৎস: `docs/release/r1-scope.json`, `docs/BUILD-SEQUENCE.md`, `docs/database/schema.sql`, routes-টেমপ্লেট)। `verify.py` পুরনো হলে ব্যর্থ হয়। মেশিন-পাঠ্য: `docs/release/r1-plan.json`।
> **কোডিং এজেন্ট:** `AGENTS.md` পড়ুন, তারপর **শুধু এই ফাইল** ধরে এক-এক task করে এগোন। প্রতিটি task-এ আছে: কী পড়বেন, কী বানাবেন (R1 পরিসর), কোন টেবিল/route/পরীক্ষা, কখন শেষ, কীভাবে যাচাই।

## ০. কাজের নিয়ম (সব task-এর জন্য)

1. **ক্রম মানুন।** Task-এর `depends_on` শেষ না হলে পরেরটি শুরু নয়। **Task `S` (Spike) একটি Gate**: মালিকের স্বাক্ষর ছাড়া Phase 3 শুরু নয়।
2. **শুধু R1 বানান।** Appendix C-র কোনো জিনিস (মডিউল, controller, টেবিল, মেনু) আগাম বানাবেন না। `config/release.php` ও `ModuleGate` তা বাধ্য করে। "মূল step-এর লেখা" অনেক সময় R1-এর চেয়ে বড় — সেখানে **"R1 পরিসর" বাক্সই চূড়ান্ত**।
3. **প্রতিটি task এই ক্রমে:** (ক) "কী পড়বেন" ফাইলগুলো পড়ুন, পুরোটা নয়, উল্লিখিত অংশ; (খ) পরীক্ষা আগে বা কোডের সাথে লিখুন; (গ) কোড লিখুন; (ঘ) "যাচাই" কমান্ড চালান — সব সবুজ না হলে এগোবেন না; (ঙ) `docs/PROGRESS.md`-এ এক সারি (task, তারিখ, কী হল, কোন পরীক্ষা সবুজ, অমীমাংসিত); (চ) একটি commit (`docs/ops/git-workflow.md`)।
4. **স্পেক ভুল/অস্পষ্ট মনে হলে:** চুপচাপ নিজের মতো করবেন না। `docs/DECISIONS.md`-এ সমস্যা + আপনার প্রস্তাব লিখুন, `[OWNER]` চিহ্ন দিন, ওই task থামান। কোড ও স্পেক বিরোধ করলে স্পেক ঠিক করুন (এবং `python3 infra/spec-verify/verify.py .` চালান)।
5. **অজানা বাইরের জিনিস অনুমান করবেন না:** SMS-gateway-র Unicode/DLR, bKash/SSLCommerz-এর আসল আচরণ, ব্যাংক-ফরম্যাট — adapter + `FakeGateway` বানান, `TODO(OD-…)` রাখুন, মালিককে জানান।
6. **নিরাপত্তার অপরিবর্তনীয়:** tenant-scoped model (`BelongsToInstitution`), bulk লেখা শুধু `TenantBulk`, ফাইল শুধু `private`/`public` ডিস্কে `institutions/{id}/…` পাথে, টাকার রেকর্ড কখনো সম্পাদনা নয় (উল্টো লাইন), কোনো hard-coded রঙ/শব্দ/`ml-4` নয় (`npm run lint:theme`)।
7. **স্পেক বদলালে:** `python3 infra/spec-verify/verify.py . --deep` (সবুজ থাকতে হবে)।
8. **মালিকের সিদ্ধান্ত যা এজেন্ট নেয় না:** `SIGNUP_MODE=open`, মূল্য/প্ল্যান-সংখ্যা, আইনি লেখা (`/terms`, `/privacy`), Spike-Gate।

### মালিকের কাছ থেকে যা লাগবে (না পেলে নির্দেশিত বিকল্প)

| কী | কোন task | না পেলে |
|---|---|---|
| SMS gateway ডকুমেন্ট ও test অ্যাকাউন্ট | 4.6 | adapter + log-only gateway; `TODO(OD-sms-unicode)` |
| SSLCommerz sandbox কী (subscription-পেমেন্ট) | 5.2 | `FakeSubscriptionGateway` (dev-only); আসল কী ছাড়া 5.2 "সম্পন্ন" নয় |
| `/terms`, `/privacy` লেখা (আইনজীবীর) | 8.1 | স্থানধারক পাতা; **R1 গ্রহণ আটকে থাকে** |
| আসল রসিদ ও মার্কশিটের নমুনা | 4.4, 4.5 | `docs/modules/pdf-reports.md`-এর ফরম্যাট; মালিকের অনুমোদন লাগবে |
| একটি আসল ছাত্র-তালিকার Excel | 4.2 | নমুনা টেমপ্লেট; এনকোডিং UTF-8 ধরুন |
| MySQL 8, Redis, Node 20, মানব-রিভিউয়ার | 0.1, S | **থামুন** — `docs/spike/SPIKE-READY.md` |

## ১. মানচিত্র

| # | Task | নির্ভর করে | টেবিল | route | পরীক্ষা |
|---|---|---|---|---|---|
| `0.1` | Laravel | — |  |  |  |
| `0.2` | React | `0.1` |  |  |  |
| `0.3` | .env, Folders, CI Skeleton | `0.2` |  |  |  |
| `1.1` | Migrations | `0.3` |  |  |  |
| `1.2` | Models | `1.1` |  |  |  |
| `1.3` | Seeders | `1.2` |  |  |  |
| `2.1` | Tenancy | `1.3` | 1 |  | 5 |
| `2.2` | Institution Types, Module Gate, Terminology | `2.1` |  | 2 | 3 |
| `2.3` | Authentication | `2.2` | 2 | 15 | 7 |
| `2.4` | Theme Service + Bootstrap Endpoint | `2.3` | 1 | 10 | 1 |
| `2.5` | Programs, Batches, Enrollment | `2.4` | 7 |  | 2 |
| `2.6` | Shared Services | `2.5` | 1 | 5 | 2 |
| `2.7` | Routes Skeleton | `2.6` |  | 1 |  |
| `S` | Walking-skeleton Spike and Gate (D28) | `2.7` |  |  |  |
| `3.1` | Core Infrastructure | `S` |  |  |  |
| `3.2` | Theme System | `3.1` |  |  |  |
| `3.3` | Layouts & Navigation | `3.2` |  |  | 1 |
| `3.4` | Shared Components | `3.3` |  |  |  |
| `3.5` | Auth Pages | `3.4` |  |  |  |
| `3.6` | UI Pack Runtime (পর্যায় A, D29) | `3.5` |  |  | 3 |
| `3.7` | Languages & RTL Foundation (D30) | `3.6` |  |  | 9 |
| `3.8` | E2E, Visual & a11y Harness (Playwright) | `3.7` |  |  |  |
| `4.1` | Programs & Batches UI | `3.8` | 1 | 22 |  |
| `4.2` | Students & Enrollment | `4.1` | 5 | 22 | 6 |
| `4.3` | Attendance | `4.2` | 2 | 6 | 5 |
| `4.4` | Fees | `4.3` | 3 | 10 | 3 |
| `4.5` | Exams & Results | `4.4` | 3 | 14 | 4 |
| `4.6` | Notifications & SMS | `4.5` | 2 | 1 | 4 |
| `4.7` | Dashboards & Role Panels | `4.6` |  | 6 |  |
| `4.8` | Core PDF & Reports | `4.7` |  | 2 |  |
| `5.3` | Super Admin Panel | `4.8` | 1 | 15 | 4 |
| `8.1` | Privacy and children's data (D27) | `5.3` |  | 5 | 3 |
| `8.2` | Security hardening | `8.1` |  |  |  |
| `8.5` | Load and scale test (before SIGNUP_MODE=open) | `8.2` |  |  |  |
| `9.1` | Deployment, backup, monitoring | `8.5` |  |  |  |
| `A` | Release 1 acceptance (local, D63/D64), open signup at deploy | `9.1` |  |  |  |
| `QB.0` | Question bank foundation: schema, module keys, roles, catalogue rule | `A` | 36 |  |  |
| `QB.1` | Curriculum: class → subject → chapter → topic | `QB.0` |  | 5 |  |
| `QB.2` | Writers' panel: writers, moderators, revisions, review flow | `QB.1` |  | 14 |  |
| `QB.3` | Questions: core types and the editor | `QB.2` |  | 1 |  |
| `QB.4` | Questions: the structured types | `QB.3` |  |  |  |
| `QB.5` | Concepts and resources (slides, books, PDFs) | `QB.4` |  | 20 |  |
| `QB.6` | Prices and the free / partly-free / discount rule engine | `QB.5` |  | 6 |  |
| `QB.7` | Teachers: browse, buy with the institution wallet, spending | `QB.6` |  | 7 |  |
| `QB.8` | Question papers: builder, PDF, the head teacher's view | `QB.7` |  | 7 |  |
| `QB.9` | Student login and portal: practice, concepts, bKash purchases | `QB.8` |  | 8 |  |
| `QB.10` | Quizzes and quiz packages | `QB.9` |  | 18 |  |
| `QB.10b` | Writers' earnings, wallet and withdrawals | `QB.10` |  | 8 |  |
| `QB.11` | Import from qbank | `QB.10b` | 1 |  |  |
| `QB.12` | qbank-style question editor (D72) | `QB.11` |  |  |  |
| `QB.14` | qbank's table builder and picture tool (D72, later step) | `QB.12` |  |  |  |
| `QB.13` | Smart editor: mixed parts, new item kinds, the new-question form (D73) | `QB.14` |  |  |  |
| `5.1` | Signup & Onboarding | `QB.13` |  | 3 | 1 |
| `5.2` | Subscription & Billing (প্রতিষ্ঠান → প্ল্যাটফর্ম) | `5.1` | 3 | 12 | 1 |

**সারসংক্ষেপ:** 54 task · 69 টেবিল · 245 route · 64 নামকৃত পরীক্ষা।

## ২. Task-এর তালিকা

---

### TASK `0.1` — Laravel

- **নির্ভর করে:** কিছু না  ·  **Release:** R1
- **কী পড়বেন:** `docs/architecture/folder-structure.md`, `docs/architecture/environment-variables.md`

**Done When:** `php artisan serve` চলে; `config('tenancy.base_domain')` ও `config('institution_types.coaching.terms.batch.bn')` tinker-এ মান দেয়।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> ```bash
> composer create-project laravel/laravel api && cd api
> composer require laravel/sanctum barryvdh/laravel-dompdf maatwebsite/excel endroid/qr-code
> php artisan install:api
> composer require league/flysystem-aws-s3-v3 "^3.0"      # only when FILES_DRIVER=s3 (docs/architecture/file-storage.md)
> ```
> `config/tenancy.php` ও `config/institution_types.php` এখনই বানান (code: `docs/templates/laravel-core-files.md`, `docs/modules/institution-types.md`)।
> **Spec Reference:** `docs/architecture/folder-structure.md` (+ Revision 6 additions), `docs/architecture/environment-variables.md`
> `spatie/laravel-permission` ইনস্টল করবেন না (`docs/LOCKED-DECISIONS.md` D17)।
> **Done When:** `php artisan serve` চলে; `config('tenancy.base_domain')` ও `config('institution_types.coaching.terms.batch.bn')` tinker-এ মান দেয়।
</details>

---

### TASK `0.2` — React

- **নির্ভর করে:** `0.1`  ·  **Release:** R1

**Done When:** `http://demo.lvh.me:5173` খোলে এবং `fetch('/api/v1/health')` Laravel-এ পৌঁছায় (Host header `demo.lvh.me` অক্ষত)।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> ```bash
> npm create vite@latest frontend -- --template react && cd frontend
> npm install tailwindcss @tanstack/react-query zustand axios react-router-dom react-hook-form zod @hookform/resolvers
> npm install recharts lucide-react qrcode.react date-fns react-i18next i18next
> ```
> `vite.config.js`: `/api` proxy → `http://127.0.0.1:8000`, `changeOrigin: false`, `allowedHosts: ['.lvh.me']`। `.env`: `VITE_API_URL=/api/v1`।
> **Done When:** `http://demo.lvh.me:5173` খোলে এবং `fetch('/api/v1/health')` Laravel-এ পৌঁছায় (Host header `demo.lvh.me` অক্ষত)।
</details>

---

### TASK `0.3` — .env, Folders, CI Skeleton

- **নির্ভর করে:** `0.2`  ·  **Release:** R1
- **কী পড়বেন:** `docs/architecture/environment-variables.md`, `docs/architecture/folder-structure.md`, `docs/ops/git-workflow.md`

**Done When:** দুই project-এর `.env.example` সম্পূর্ণ; CI-তে `php artisan test`, `npm test` (খালি হলেও) ও `npm run lint:theme` চলে।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `infra/check-theme-rules.mjs` → `frontend/scripts/check-theme-rules.mjs`; `package.json`: `"lint:theme": "node scripts/check-theme-rules.mjs"`; CI-তে `npm run lint:theme` (লঙ্ঘন = build ব্যর্থ) এবং `node infra/check-schema-parity.mjs` (module-ডকের নকল DDL `schema.sql` থেকে সরলে ব্যর্থ — D13)। এটি `no-hardcoded-colors`/`no-hardcoded-terms` grep-এর জায়গায় — রঙ-class, hex, `rounded-lg/xl`, হার্ডকোড Class/Section/Batch/Course শব্দ ও `dangerouslySetInnerHTML` ধরে।
> **Spec Reference:** `docs/architecture/environment-variables.md` (Revision 5 ও 6), `docs/architecture/folder-structure.md`, `docs/ops/git-workflow.md`
> **Done When:** দুই project-এর `.env.example` সম্পূর্ণ; CI-তে `php artisan test`, `npm test` (খালি হলেও) ও `npm run lint:theme` চলে।
</details>

---

### TASK `1.1` — Migrations

- **নির্ভর করে:** `0.3`  ·  **Release:** R1

**Done When:** `php artisan migrate:fresh` ত্রুটিহীন; database-এ ১৪৩টি table (+ Laravel-এর নিজস্ব); `users`-এ `(institution_id, email)`, `(institution_id, phone)`, `(institution_id, username)` unique index আছে।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan migrate:fresh --seed
bash infra/scripts/mysql-smoke.sh
bash infra/scripts/schema-diff.sh lms lms_smoke   # with SCHEMA_DIFF_ONLY=docs/release/r1-tables.txt
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `docs/database/schema.sql`-এর প্রতিটি `CREATE TABLE`-এর জন্য একটি migration, `docs/database/migrations.md`-এর ক্রমে। `schema.sql`-এর পরবর্তী `ALTER TABLE … ADD COLUMN` গুলো মূল table-এর migration-এই মিশিয়ে দিন (একটি table = একটি `create_*` migration); ব্যতিক্রম শুধু `docs/database/migrations.md` Revision 6-এ নাম ধরে দেওয়া `add_*` migration। JSON কলামে model-এ `array` cast।
> Laravel-এর নিজস্ব table (`personal_access_tokens`, `notifications`, `jobs`, `failed_jobs`) `docs/database/migrations.md`-এর "Laravel Framework Tables" অংশ অনুযায়ী artisan দিয়ে বানান।
> **Done When:** `php artisan migrate:fresh` ত্রুটিহীন; database-এ ১৪৩টি table (+ Laravel-এর নিজস্ব); `users`-এ `(institution_id, email)`, `(institution_id, phone)`, `(institution_id, username)` unique index আছে।
</details>

---

### TASK `1.2` — Models

- **নির্ভর করে:** `1.1`  ·  **Release:** R1
- **কী পড়বেন:** `docs/templates/laravel-core-files.md`, `docs/architecture/system-design-patterns.md`

**Done When:** ১৪৩টি model; `BelongsToInstitution` নেই শুধু `Institution`, `SubscriptionPlan`, `ThemePreset`, `OtpToken`, `Coupon`, `PlatformSetting`-এ।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan migrate:fresh --seed
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> প্রতিটি table-এর Eloquent model; tenant-scoped গুলোতে `BelongsToInstitution`। `Student` model-এ enrollment relation ও scope (`docs/modules/academic-structure.md`)।
> **Spec Reference:** `docs/templates/laravel-core-files.md` (trait, `Student.php`), `docs/architecture/system-design-patterns.md` (soft delete)
> **Done When:** ১৪৩টি model; `BelongsToInstitution` নেই শুধু `Institution`, `SubscriptionPlan`, `ThemePreset`, `OtpToken`, `Coupon`, `PlatformSetting`-এ।
</details>

---

### TASK `1.3` — Seeders

- **নির্ভর করে:** `1.2`  ·  **Release:** R1
- **কী পড়বেন:** `docs/database/seeders.md`

**Done When:** ৫টি plan, ৬টি theme preset, ১টি super admin DB-তে।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan migrate:fresh --seed
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> ক্রম: Plan → ThemePreset → SuperAdmin → DemoInstitution (school) → DemoData → DemoCoaching → DemoTutor। Demo seeder গুলো `EnrollmentService` ও `ThemeService::applyPreset()` ব্যবহার করে, তাই এই Step সম্পূর্ণ সবুজ হবে Step 2.5 ও 2.6-এর পরে — এখন Plan, ThemePreset, SuperAdmin চালান; বাকি তিনটি Step 2.6-এর Done When-এ।
> **Spec Reference:** `docs/database/seeders.md` (Revision 6 section সহ)
> **Done When:** ৫টি plan, ৬টি theme preset, ১টি super admin DB-তে।
</details>

---

### TASK `2.1` — Tenancy

- **নির্ভর করে:** `1.3`  ·  **Release:** R1
- **কী পড়বেন:** `docs/templates/laravel-core-files.md`, `docs/architecture/tenancy.md`, `docs/modules/custom-domain.md`

**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `institutions`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE institutions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,           -- default subdomain: {slug}.APP_BASE_DOMAIN
    -- R6: custom domains live in institution_domains (see docs/modules/custom-domain.md)
    institution_type ENUM('school','college','coaching','private_batch') NOT NULL DEFAULT 'school',
    enabled_modules JSON NULL,                   -- Super Admin overrides: {"hostel": true, "library": false}
    terminology JSON NULL,                       -- label overrides: {"batch": {"bn": "শাখা", "en": "Section"}}
    settings JSON NULL,                          -- {"fee_proration": "none", "use_programs": true, ...}
    sms_balance DECIMAL(10,2) NOT NULL DEFAULT 0, -- D56: SMS wallet in TAKA (recharged online / by Super Admin; each sent part costs the platform rate)
    sms_sender_id VARCHAR(20) NULL,              -- D59: the institution's own sender ID on its own API (masking name or a 13-digit number)
    sms_sender_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
    sms_sender_note VARCHAR(255) NULL,           -- rejection reason / Super Admin note
    onboarding_completed TINYINT(1) DEFAULT 0,
    onboarding_step INT DEFAULT 1,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    subscription_plan_id BIGINT UNSIGNED,
    subscription_expires_at TIMESTAMP NULL,
    status ENUM('trial','active','expired','suspended','inactive') DEFAULT 'trial',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id)
);
ALTER TABLE institutions ADD COLUMN parent_institution_id BIGINT UNSIGNED NULL;
ALTER TABLE institutions ADD COLUMN branch_name VARCHAR(100) NULL;
ALTER TABLE institutions ADD COLUMN is_head_office TINYINT(1) DEFAULT 0;
ALTER TABLE institutions ADD COLUMN primary_color VARCHAR(7) DEFAULT '#185FA5';
ALTER TABLE institutions ADD COLUMN secondary_color VARCHAR(7) DEFAULT '#0F6E56';
ALTER TABLE institutions ADD COLUMN accent_color VARCHAR(7) DEFAULT '#E67E22';
ALTER TABLE institutions ADD COLUMN logo_path VARCHAR(255) NULL;
ALTER TABLE institutions ADD COLUMN favicon_path VARCHAR(255) NULL;
ALTER TABLE institutions ADD COLUMN theme_mode ENUM('light','dark','auto') DEFAULT 'light';
ALTER TABLE institutions ADD COLUMN theme_updated_by BIGINT UNSIGNED NULL;
ALTER TABLE institutions ADD COLUMN theme_updated_at TIMESTAMP NULL;
ALTER TABLE institutions ADD COLUMN theme_preset_id BIGINT UNSIGNED NULL;
ALTER TABLE institutions ADD COLUMN layout_key VARCHAR(30) NULL;
ALTER TABLE institutions ADD COLUMN ui_pack VARCHAR(30) NULL;
ALTER TABLE institutions ADD COLUMN theme_tokens JSON NULL;
ALTER TABLE institutions ADD COLUMN sms_api_key TEXT NULL;
ALTER TABLE institutions ADD COLUMN sms_universal_enabled TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE institutions ADD COLUMN sms_own_enabled TINYINT(1) NOT NULL DEFAULT 0;
```
</details>

**পরীক্ষা:** `TenantResolverTest`, `TenantModeTest`, `TenantFailClosedTest`, `QueueTenantLeakTest`, `TenancyArchitectureTest`

**Done When:** (Fail-closed, D25) tenant ছাড়া `Student::count()` `TenantNotBoundException` দেয়; `Tenancy::withoutTenancy()` ভেতরে চলে, বাইরে নয়; একটি job-এর পরে অন্য প্রতিষ্ঠানের job চালালে আগেরটির tenant জমে থাকে না; `TenancyArchitectureTest` অনুমোদিত তালিকার বাইরে কোনো `withoutGlobalScope(s)`/`app()->instance('currentInstitution'`/raw `DB::table` ধরে। এবং: অজানা host → 404 `institution_not_found`; reserved slug resolve হয় না; `tenant` route central host-এ 404, `tenant:central` route tenant host-এ 404; Super Admin token tenant host-এ 403 `forbidden_host`, tenant user-এর token central host-এ বা অন্য tenant-এর host-এ 403 `institution_mismatch`; suspended institution শুধু auth/bootstrap/subscription/billing পথে ঢুকতে পারে।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=TenantResolverTest|TenantModeTest|TenantFailClosedTest|QueueTenantLeakTest|TenancyArchitectureTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `Tenancy` (+ `InstitutionScope`, `BelongsToInstitution`, `TenantAwareJob`/`BindTenant`, `PlatformScope`), `TenantResolver`, `TenantMiddleware`, central host, reserved slug; `bootstrap/app.php`-এ middleware alias (`tenant`, `tenant.optional`, `central`)।
> **Spec Reference:** `docs/templates/laravel-core-files.md` (Revision 6 code), `docs/architecture/tenancy.md`, `docs/modules/custom-domain.md` Part A
> **Tests:** `TenantResolverTest`, `TenantModeTest`, `TenantFailClosedTest`, `QueueTenantLeakTest`, `TenancyArchitectureTest`
> **Done When:** (Fail-closed, D25) tenant ছাড়া `Student::count()` `TenantNotBoundException` দেয়; `Tenancy::withoutTenancy()` ভেতরে চলে, বাইরে নয়; একটি job-এর পরে অন্য প্রতিষ্ঠানের job চালালে আগেরটির tenant জমে থাকে না; `TenancyArchitectureTest` অনুমোদিত তালিকার বাইরে কোনো `withoutGlobalScope(s)`/`app()->instance('currentInstitution'`/raw `DB::table` ধরে। এবং: অজানা host → 404 `institution_not_found`; reserved slug resolve হয় না; `tenant` route central host-এ 404, `tenant:central` route tenant host-এ 404; Super Admin token tenant host-এ 403 `forbidden_host`, tenant user-এর token central host-এ বা অন্য tenant-এর host-এ 403 `institution_mismatch`; suspended institution শুধু auth/bootstrap/subscription/billing পথে ঢুকতে পারে।
</details>

---

### TASK `2.2` — Institution Types, Module Gate, Terminology

- **নির্ভর করে:** `2.1`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/institution-types.md`, `docs/modules/subscription.md`, `docs/templates/laravel-core-files.md`

**R1-এ যে route বানাবেন:**
```
GET /admin/settings/terminology -> TerminologyController@show [role:admin]
PUT /admin/settings/terminology -> TerminologyController@update [role:admin]
```

**পরীক্ষা:** `ModuleGateTest`, `TerminologyTest`, `ReleaseGateTest`

**Done When:** একটি test route-এ `module:hostel` — coaching tenant-এ 403 `module_disabled`, Basic-plan school-এ 403 `feature_not_available`, Enterprise school-এ 200, override দিলে উল্টো। **D47:** `SubscriptionCheck`-এ plan-সীমা (`max_students`, `max_batches`) **বানাবেন না** — সংখ্যা বা স্টোরেজের কোনো সীমা নেই। মডিউল-গেট (ধরন, মডিউল-তালিকা, রিলিজ-গেট) যেমন আছে তেমন; plan-ভিত্তিক গেট নয় (পুনর্লিখন: `docs/PRICING-MODEL.md` PM-1)।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=ModuleGateTest|TerminologyTest|ReleaseGateTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `ModuleGate`, `ModuleMiddleware` (`module:x`), `FeatureMiddleware` (`feature:x`), `term()` helper, `SubscriptionCheck` (মেয়াদ + `max_students` + `max_batches`), `AcademicYearMiddleware`, `RoleMiddleware`।
> **Spec Reference:** `docs/modules/institution-types.md`, `docs/modules/subscription.md`, `docs/templates/laravel-core-files.md`
> **Tests:** `ModuleGateTest`, `TerminologyTest`
> **Done When:** একটি test route-এ `module:hostel` — coaching tenant-এ 403 `module_disabled`, Basic-plan school-এ 403 `feature_not_available`, Enterprise school-এ 200, override দিলে উল্টো।
</details>

---

### TASK `2.3` — Authentication

- **নির্ভর করে:** `2.2`  ·  **Release:** R1
- **কী পড়বেন:** `docs/AUTHORIZATION.md`, `docs/API-ERRORS.md`

**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `users`, `otp_tokens`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED,
    name VARCHAR(100) NOT NULL,
    -- R6: login identifier is email OR phone OR username, unique per institution
    email VARCHAR(100) NULL,
    phone VARCHAR(20) NULL,                      -- staff/parent login; NULL for student users
    username VARCHAR(50) NULL,                   -- student login = students.student_id
    password VARCHAR(255) NOT NULL,
    role ENUM('super_admin','admin','teacher','student','parent','accountant','content_writer','content_moderator') NOT NULL,   -- D65: content_writer/content_moderator are platform roles (institution_id NULL)
    avatar VARCHAR(255),
    is_active TINYINT(1) DEFAULT 1,
    last_login_at TIMESTAMP NULL,
    locale VARCHAR(5) NULL,                      -- R9: personal language (bn|en|ar); VARCHAR so a new language needs no migration (docs/I18N.md)
    failed_login_attempts INT NOT NULL DEFAULT 0, -- R7: used by the login lockout (docs/AUTHORIZATION.md); was only a comment before
    locked_until TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
    UNIQUE KEY unique_user_email (institution_id, email),
    UNIQUE KEY unique_user_phone (institution_id, phone),
    UNIQUE KEY unique_user_username (institution_id, username),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_users_institution_role ON users(institution_id, role);
ALTER TABLE users ADD COLUMN fcm_token VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN notification_preferences JSON NULL;
ALTER TABLE users ADD COLUMN two_factor_enabled TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN whatsapp_number VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN whatsapp_enabled TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN name_alt VARCHAR(150) NULL;
ALTER TABLE users ADD COLUMN ui_preferences JSON NULL;

CREATE TABLE otp_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    otp VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```
</details>

**R1-এ যে route বানাবেন:**
```
POST /auth/login -> LoginController@login
POST /auth/verify-otp -> LoginController@verifyOtp
POST /auth/forgot-password -> PasswordResetController@sendResetLink
POST /auth/reset-password -> PasswordResetController@reset
POST /auth/logout -> LoginController@logout [role:super_admin]
GET /auth/me -> LoginController@me [role:super_admin]
POST /auth/logout -> LoginController@logout
GET /auth/me -> LoginController@me
PATCH /auth/change-password -> PasswordResetController@changePassword
GET /auth/sessions -> SessionController@index
DELETE /auth/sessions/{id} -> SessionController@destroy
POST /auth/logout-all -> SessionController@logoutAll
POST /admin/users/{id}/force-logout -> SessionController@forceLogout [role:admin]
POST /admin/users/{id}/unlock -> SessionController@unlock [role:admin]
PUT /auth/locale -> LoginController@locale
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
PUT /auth/ui-preferences -> LoginController@uiPreferences  (accessibility mode is later)
```

**পরীক্ষা:** `LoginIdentifierTest`, `CrossTenantHostTest`, `TokenLifetimeTest`, `PasswordPolicyTest`, `LockoutTest`, `ReleaseRolesTest`, `LocaleTest`

**Done When:** তিন ধরনের identifier-এ login হয়; অন্য tenant-এর token অন্য host-এ 403। এবং (D26): মেয়াদ-উত্তীর্ণ token 401; idle-সীমা পার হলে 401 (Sanctum callback-এ — middleware-এ নয়); ৬ষ্ঠ লগইনে সবচেয়ে পুরনো token বাতিল; পাসওয়ার্ড বদলালে/ব্যবহারকারী নিষ্ক্রিয় হলে সব token বাতিল; লক হওয়া ও ভুল-পাসওয়ার্ডের উত্তর হুবহু এক; `/auth/sessions`, `/auth/logout-all`, Admin `force-logout`/`unlock`।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=LoginIdentifierTest|CrossTenantHostTest|TokenLifetimeTest|PasswordPolicyTest|LockoutTest|ReleaseRolesTest|LocaleTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Login (email / phone / student ID), lockout, must-change-password, password reset (email ও OTP), 2FA (ঐচ্ছিক), logout। Tenant host ও central host-এর বিভাজন।
> **Spec Reference:** `docs/AUTHORIZATION.md` (Token Strategy, Password Policy, Lockout — Revision 7), `docs/API-ERRORS.md`
> **Tests:** `LoginIdentifierTest`, `CrossTenantHostTest`, `TokenLifetimeTest`, `PasswordPolicyTest`, `LockoutTest`
> **Done When:** তিন ধরনের identifier-এ login হয়; অন্য tenant-এর token অন্য host-এ 403। এবং (D26): মেয়াদ-উত্তীর্ণ token 401; idle-সীমা পার হলে 401 (Sanctum callback-এ — middleware-এ নয়); ৬ষ্ঠ লগইনে সবচেয়ে পুরনো token বাতিল; পাসওয়ার্ড বদলালে/ব্যবহারকারী নিষ্ক্রিয় হলে সব token বাতিল; লক হওয়া ও ভুল-পাসওয়ার্ডের উত্তর হুবহু এক; `/auth/sessions`, `/auth/logout-all`, Admin `force-logout`/`unlock`।
</details>

---

### TASK `2.4` — Theme Service + Bootstrap Endpoint

- **নির্ভর করে:** `2.3`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/institution-branding.md`, `docs/THEMING.md`, `docs/modules/institution-types.md`

**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `theme_presets`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE theme_presets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(50) UNIQUE NOT NULL,           -- classic-blue, tutor-lite ...
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    layout_key VARCHAR(30) NOT NULL DEFAULT 'sidebar-classic',
    ui_pack VARCHAR(30) NOT NULL DEFAULT 'classic',   -- R8: structural UI (component variants + page views) - docs/UI-PACKS.md; VARCHAR so a new pack needs no migration
    primary_color VARCHAR(7) NOT NULL,
    secondary_color VARCHAR(7) NOT NULL,
    accent_color VARCHAR(7) NOT NULL,
    theme_mode ENUM('light','dark','auto') DEFAULT 'light',
    tokens JSON NOT NULL,                        -- see the token schema in docs/THEMING.md
    preview_image VARCHAR(255) NULL,
    allowed_types JSON NULL,                     -- NULL = all institution types
    is_premium TINYINT(1) DEFAULT 0,             -- requires plan feature custom_branding
    is_active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /bootstrap -> BootstrapController@show
GET /settings -> SettingController@index [role:admin]
PUT /settings -> SettingController@update [role:admin]
GET /admin/settings/general -> SettingController@general [role:admin]
PUT /admin/settings/general -> SettingController@updateGeneral [role:admin]
GET /admin/theme -> ThemeController@show [role:admin]
PUT /admin/theme -> ThemeController@update [role:admin]
POST /admin/theme/logo -> ThemeController@logo [role:admin]
GET /admin/settings/language -> SettingController@language [role:admin]
PUT /admin/settings/language -> SettingController@updateLanguage [role:admin]
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
PUT /admin/theme/tokens -> ThemeController@tokens  (theme editor is R2; R1 has logo and brand colour only)
PUT /admin/theme/layout -> ThemeController@layout  (theme editor is R2; R1 has logo and brand colour only)
PUT /admin/theme/pack -> ThemeController@pack  (theme editor is R2; R1 has logo and brand colour only)
POST /admin/theme/preset -> ThemeController@preset  (theme editor is R2; R1 has logo and brand colour only)
POST /admin/theme/favicon -> ThemeController@favicon  (theme editor is R2; R1 has logo and brand colour only)
```

**পরীক্ষা:** `ThemeResolutionTest`

**Done When:** `curl -H "Host: <slug>.lvh.me" /api/v1/bootstrap` — `terms`, `modules`, `theme` (৮টি token সহ) ফেরত দেয়; central host-এ `is_central: true`।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=ThemeResolutionTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `ThemeService` (Layer 1 code + Revision 6-এর `getTheme`, `applyPreset`, `updateTokens`, `updateLayout`), `ThemeTokensRule`, `GET /bootstrap`, `GET /theme/public`, `GET /api/v1/manifest.webmanifest`।
> **Spec Reference:** `docs/modules/institution-branding.md` (Layer 1), `docs/THEMING.md`, `docs/modules/institution-types.md` ("Bootstrap Endpoint")
> **Tests:** `ThemeResolutionTest`
> **Done When:** `curl -H "Host: <slug>.lvh.me" /api/v1/bootstrap` — `terms`, `modules`, `theme` (৮টি token সহ) ফেরত দেয়; central host-এ `is_central: true`।
</details>

---

### TASK `2.5` — Programs, Batches, Enrollment

- **নির্ভর করে:** `2.4`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/academic-structure.md`, `docs/modules/institution-types.md`

**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `academic_years`, `programs`, `batches`, `subjects`, `enrollments`, `batch_teachers`, `teacher_subjects`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE academic_years (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(20) NOT NULL,       -- '2024-2025'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE programs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    numeric_name INT,                            -- school/college: 1..12 ; NULL for courses
    code VARCHAR(20) NULL,
    group_name ENUM('science','humanities','business','general') NULL,  -- class 9-12 groups
    duration_months INT NULL,                    -- coaching course length; NULL = ongoing
    course_fee DECIMAL(10,2) NULL,               -- one-time course fee (coaching)
    is_default TINYINT(1) DEFAULT 0,             -- private_batch auto-created "General" program
    is_active TINYINT(1) DEFAULT 1,
    is_public TINYINT(1) DEFAULT 1,              -- R6.2: listed on the public website
    public_description VARCHAR(500) NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
ALTER TABLE programs ADD COLUMN name_alt VARCHAR(150) NULL;
ALTER TABLE programs ADD COLUMN qb_class_level_id BIGINT UNSIGNED NULL;

CREATE TABLE batches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(60) NOT NULL,
    teacher_id BIGINT UNSIGNED,                  -- class teacher / batch owner
    academic_year_id BIGINT UNSIGNED NULL,       -- NULL for ongoing coaching batches
    start_date DATE NULL,
    end_date DATE NULL,
    schedule JSON NULL,                          -- [{"day":"sat","start":"16:00","end":"17:30"}]
    monthly_fee DECIMAL(10,2) NULL,              -- batch-level tuition (coaching/private_batch)
    room VARCHAR(30) NULL,
    max_capacity INT DEFAULT 40,
    status ENUM('upcoming','running','completed','archived') DEFAULT 'running',
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);
ALTER TABLE batches ADD COLUMN name_alt VARCHAR(150) NULL;
ALTER TABLE batches ADD COLUMN shift VARCHAR(10) NULL;

CREATE TABLE subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    full_marks INT DEFAULT 100,
    pass_marks INT DEFAULT 33,
    is_optional TINYINT(1) DEFAULT 0,            -- R6: optional / 4th subject (see docs/modules/college.md)
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);
ALTER TABLE subjects ADD COLUMN name_alt VARCHAR(150) NULL;

CREATE TABLE enrollments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    academic_year_id BIGINT UNSIGNED NULL,
    roll_no INT NULL,
    optional_subject_id BIGINT UNSIGNED NULL,    -- college / class 9-10 4th subject
    fee_override DECIMAL(10,2) NULL,             -- negotiated monthly fee for this student in this batch
    is_primary TINYINT(1) DEFAULT 0,             -- exactly one active primary enrollment per student
    enrolled_at DATE NOT NULL,
    left_at DATE NULL,
    status ENUM('active','completed','dropped','transferred','promoted') DEFAULT 'active',
    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (program_id) REFERENCES programs(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id)
);
CREATE INDEX idx_enrollments_batch ON enrollments(institution_id, batch_id, status);
CREATE INDEX idx_enrollments_student ON enrollments(student_id, status);

CREATE TABLE batch_teachers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL DEFAULT 0, -- 0 = all subjects of the batch
    pay_type ENUM('salary','fixed_monthly','per_class','percentage') DEFAULT 'salary',
    pay_rate DECIMAL(10,2) DEFAULT 0,            -- BDT amount, or percent when pay_type = percentage
    UNIQUE KEY unique_batch_teacher (batch_id, teacher_id, subject_id),
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

CREATE TABLE teacher_subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    teacher_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,
    is_primary TINYINT(1) DEFAULT 1,
    UNIQUE KEY unique_teacher_subject (teacher_id, subject_id, program_id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
```
</details>

**পরীক্ষা:** `EnrollmentServiceTest`, `EnrollmentCacheSyncTest`

**Done When:** test পাস; এবং Step 1.3-এর বাকি তিনটি demo seeder চলে — `php artisan migrate:fresh --seed` ত্রুটিহীন, তিনটি demo tenant তৈরি।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=EnrollmentServiceTest|EnrollmentCacheSyncTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `ProgramController`, `BatchController`, `EnrollmentController`, `EnrollmentService`, `OnboardingService::applyDefaults()`।
> **Spec Reference:** `docs/modules/academic-structure.md`, `docs/modules/institution-types.md` ("Onboarding Defaults")
> **Tests:** `EnrollmentServiceTest`, `EnrollmentCacheSyncTest`
> **Done When:** test পাস; এবং Step 1.3-এর বাকি তিনটি demo seeder চলে — `php artisan migrate:fresh --seed` ত্রুটিহীন, তিনটি demo tenant তৈরি।
</details>

---

### TASK `2.6` — Shared Services

- **নির্ভর করে:** `2.5`  ·  **Release:** R1
- **কী পড়বেন:** `docs/templates/laravel-core-files.md`, `docs/modules/academic-structure.md`, `docs/modules/grading.md`, `docs/modules/notifications.md`, `docs/modules/pdf-reports.md`, `docs/architecture/backend-pattern.md`

**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `audit_logs`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED,
    user_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(100) NOT NULL,
    model VARCHAR(50),
    model_id BIGINT UNSIGNED,
    old_data JSON,
    new_data JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_inst_created ON audit_logs(institution_id, created_at);
CREATE INDEX idx_audit_model ON audit_logs(model, model_id, created_at);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /notifications -> NotificationController@index
PATCH /notifications/{id}/read -> NotificationController@markRead
PATCH /notifications/read-all -> NotificationController@markAllRead
GET /audit-logs -> AuditLogController@index [role:admin]
GET /audit-logs/{id} -> AuditLogController@show [role:admin]
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
PATCH /user/fcm-token -> NotificationController@updateFcmToken  (push / mobile app is R7)
```

**পরীক্ষা:** `TenantBulkGuardTest`, `FileDiskNamesTest`

**Done When:** প্রতিটি service class আছে ও resolve হয়; `FeeResolutionTest` পাস।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=TenantBulkGuardTest|FileDiskNamesTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> ক্রম: `StudentService` → `AttendanceService` → `ResultService` → `FeeService` (`resolveMonthlyAmount` সহ) → `NotificationService` → `SmsService` (quota + credit) → `PdfService`। `AppServiceProvider`-এ bind।
> **Spec Reference:** `docs/templates/laravel-core-files.md`, `docs/modules/academic-structure.md` (Fee Resolution, Attendance), `docs/modules/grading.md`, `docs/modules/notifications.md`, `docs/modules/pdf-reports.md`, `docs/architecture/backend-pattern.md`
> **Done When:** প্রতিটি service class আছে ও resolve হয়; `FeeResolutionTest` পাস।
</details>

---

### TASK `2.7` — Routes Skeleton

- **নির্ভর করে:** `2.6`  ·  **Release:** R1
- **কী পড়বেন:** `docs/templates/laravel-core-files.md`, `routes/api.php`, `docs/API.md`, `docs/SECURITY.md`

**R1-এ যে route বানাবেন:**
```
GET /health -> HealthController@__invoke
```

**Done When:** `php artisan route:list` ত্রুটিহীন এবং `php artisan route:cache` সফল (duplicate route name নেই); `GET /api/v1/health` বিনা token-এ 200; `TenantIsolationTest`-এর কাঠামো (চার type-এর দুটি করে tenant) চালু।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `routes/api.php`: `v1` prefix; group: public (tenant), public (central), authenticated role group, `super` (central host only), `internal`। প্রতিটি module route-এ `module:` middleware।
> **Spec Reference:** `docs/templates/laravel-core-files.md` (`routes/api.php`), `docs/API.md` (Revision 6 section সহ), `docs/SECURITY.md` (permission matrix)
> **Done When:** `php artisan route:list` ত্রুটিহীন এবং `php artisan route:cache` সফল (duplicate route name নেই); `GET /api/v1/health` বিনা token-এ 200; `TenantIsolationTest`-এর কাঠামো (চার type-এর দুটি করে tenant) চালু।
</details>

---

### TASK `S` — Walking-skeleton Spike and Gate (D28)

- **নির্ভর করে:** `2.7`  ·  **Release:** R1
- **লক্ষ্য:** Prove the architecture end to end on a thin slice BEFORE building the rest; measure; the owner signs the Gate.
- **কী পড়বেন:** `docs/spike/walking-skeleton.md`, `docs/spike/SPIKE-READY.md`, `docs/spike/SPIKE-RUNBOOK.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** S0-S8 incl. S5b/S5c/S5d. Run mysql-smoke.sh (exit must be 0) and perf-check.py first (SPIKE-RUNBOOK step 0, S1b).


**Done When:** Gate recorded and signed in docs/SPIKE-LOG.md. If the Gate says Adjust/Stop, STOP and return to the owner - do not start Phase 3.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
bash infra/scripts/mysql-smoke.sh
python3 infra/scripts/perf-check.py --scale 0.1
bash infra/scripts/schema-diff.sh lms lms_smoke
```

---

### TASK `3.1` — Core Infrastructure

- **নির্ভর করে:** `S`  ·  **Release:** R1
- **কী পড়বেন:** `docs/templates/react-core-files.md`, `docs/architecture/zustand-stores.md`, `docs/architecture/redis-cache-strategy.md`, `docs/architecture/system-design-patterns.md`

**Done When:** `http://alokito-coaching.lvh.me:5173` লোড হলে `/bootstrap` একবার call হয় এবং store ভরে; `admin.lvh.me`-এ `isCentral = true`।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> > ভাষা-অবকাঠামো (i18n init, `I18nProvider`, RTL) এই ধাপ ছুঁয়ে Step 3.7-এ পূর্ণ হয়; তার আগে কোনো page-এ literal বাংলা/ইংরেজি লেখা নয়।
> `api/axios.js`, `store/authStore.js`, `store/institutionStore.js` (`loadBootstrap`), `store/uiStore.js`, `hooks/useTerms.js`, `hooks/useModules.js`, i18n (`bn`, `en`), router (central host route: Landing, Signup, Super Admin; tenant host route: login + role group), `ProtectedRoute`।
> **Spec Reference:** `docs/templates/react-core-files.md`, `docs/architecture/zustand-stores.md`, `docs/architecture/redis-cache-strategy.md` (React Query অংশ), `docs/architecture/system-design-patterns.md` (i18n)
> **Done When:** `http://alokito-coaching.lvh.me:5173` লোড হলে `/bootstrap` একবার call হয় এবং store ভরে; `admin.lvh.me`-এ `isCentral = true`।
</details>

---

### TASK `3.2` — Theme System

- **নির্ভর করে:** `3.1`  ·  **Release:** R1
- **কী পড়বেন:** `docs/THEMING.md`

**Done When:** তিনটি demo tenant তিনটি ভিন্ন রঙ, font ও radius-এ দেখায়; reload-এ default নীল ঝলকায় না।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `theme/ThemeProvider.jsx`, `theme/tokens.css`, `theme/fonts.js`, `tailwind.config.js`।
> **Spec Reference:** `docs/THEMING.md`
> **Tests:** `ThemeProvider.test.jsx`
> **Done When:** তিনটি demo tenant তিনটি ভিন্ন রঙ, font ও radius-এ দেখায়; reload-এ default নীল ঝলকায় না।
</details>

---

### TASK `3.3` — Layouts & Navigation

- **নির্ভর করে:** `3.2`  ·  **Release:** R1
- **কী পড়বেন:** `docs/THEMING.md`, `docs/design/user-journeys.md`

**পরীক্ষা:** `MenuReleaseTest`

**Done When:** একটি খালি Dashboard page চারটি layout-এই (DB-তে `layout_key` বদলে) সঠিক দেখায় — desktop ও 360px মোবাইলে; coaching tenant-এ "কোর্সসমূহ/ব্যাচসমূহ", school-এ "শ্রেণিসমূহ/শাখাসমূহ" মেনু।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=MenuReleaseTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `layouts/registry.js`, `AppShell.jsx`, চারটি layout, `layouts/parts/*`, `nav/menu.js` (সব role-এর পূর্ণ menu — item তালিকা `docs/AUTHORIZATION.md` ও `docs/modules/panels-and-features.md` থেকে)।
> **Spec Reference:** `docs/THEMING.md` (Layout Contract), `docs/design/user-journeys.md` (route structure)
> **Tests:** `layouts.test.jsx`, `buildNav.test.js`
> **Done When:** একটি খালি Dashboard page চারটি layout-এই (DB-তে `layout_key` বদলে) সঠিক দেখায় — desktop ও 360px মোবাইলে; coaching tenant-এ "কোর্সসমূহ/ব্যাচসমূহ", school-এ "শ্রেণিসমূহ/শাখাসমূহ" মেনু।
</details>

---

### TASK `3.4` — Shared Components

- **নির্ভর করে:** `3.3`  ·  **Release:** R1
- **কী পড়বেন:** `docs/design/component-library.md`, `docs/templates/react-core-files.md`, `docs/THEMING.md`

**Done When:** `/dev/components` (dev-only route)-এ সব component render হয়; theme বদলালে প্রতিটি বদলায়; CI-র দুই grep script খালি।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `DataTable`, `StatCard`, `Card`, `ConfirmModal`, `FileUpload`, `DateRangePicker`, `PrintButton`, `ExportButton`, `Toast`, `EmptyState`, `Loader`, `Can`, `StatusBadge`, `PageHeader`, `NotificationBell`, form field গুলো — সব token class দিয়ে।
> **Spec Reference:** `docs/design/component-library.md`, `docs/templates/react-core-files.md`, `docs/THEMING.md` (class রূপান্তর টেবিল)
> **Done When:** `/dev/components` (dev-only route)-এ সব component render হয়; theme বদলালে প্রতিটি বদলায়; CI-র দুই grep script খালি।
</details>

---

### TASK `3.5` — Auth Pages

- **নির্ভর করে:** `3.4`  ·  **Release:** R1
- **কী পড়বেন:** `docs/templates/react-page-examples.md`, `docs/AUTHORIZATION.md`, `docs/THEMING.md`

**Done When:** তিনটি demo tenant-এ নিজ নিজ identifier দিয়ে login → role অনুযায়ী dashboard; login পেজে প্রতিষ্ঠানের লোগো/রঙ।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `Login` (তিনটি template), `ForgotPassword`, `ResetPassword` (email ও OTP), `ChangePassword`, 2FA ধাপ।
> **Spec Reference:** `docs/templates/react-page-examples.md` (`Login.jsx`), `docs/AUTHORIZATION.md`, `docs/THEMING.md` (Login Templates)
> **Done When:** তিনটি demo tenant-এ নিজ নিজ identifier দিয়ে login → role অনুযায়ী dashboard; login পেজে প্রতিষ্ঠানের লোগো/রঙ।
</details>

---

### TASK `3.6` — UI Pack Runtime (পর্যায় A, D29)

- **নির্ভর করে:** `3.5`  ·  **Release:** R1
- **কী পড়বেন:** `docs/UI-PACKS.md`, `docs/THEMING.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** UI Pack runtime Phase A only (classic pack). Kept because pages written without PageSlot are expensive to retrofit.


**পরীক্ষা:** `PackContractTest`, `PackRegistryTest`, `ThemePackCompatTest`

**Done When:** `classic` pack-এ সব পাতা আগের মতো চলে; অজানা `ui_pack` মানে `classic` (ফাঁকা পাতা নয়); একটি পরীক্ষামূলক pack (`test-fixture`, শুধু test-এ) একটি view ও একটি variant override করে এবং `PackContractTest` তার `data-action` অসম্পূর্ণ হলে ব্যর্থ হয়; `layout`-অসঙ্গত pack বাছলে 422।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=PackContractTest|PackRegistryTest|ThemePackCompatTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `ui/UIProvider`, `useUI`, `PageSlot`, `ui/variants/{Tabs,Modal,StatCard,List}` (প্রতিটির সব variant-এর *default* সহ — কারণ variant-গুলো ছোট), `ui/packs.js` registry, `classic` pack manifest, `config/ui_packs.php`, `ThemeService::packFor/assertCompatible`, `PUT /admin/theme/pack`, `ThemeEditor`-এ "UI Pack" বাছাই, `PackContractTest` harness (ফিক্সচার-সহ), `lint:theme`-এ `pack-leak`। এরপর প্রতিটি নতুন পাতা `hook + PageSlot` আকারে (`docs/UI-PACKS.md` §৪)।
> **Spec Reference:** `docs/UI-PACKS.md` (সম্পূর্ণ), `docs/THEMING.md`
> **Tests:** `PackContractTest`, `PackRegistryTest`, `ThemePackCompatTest`
> **Done When:** `classic` pack-এ সব পাতা আগের মতো চলে; অজানা `ui_pack` মানে `classic` (ফাঁকা পাতা নয়); একটি পরীক্ষামূলক pack (`test-fixture`, শুধু test-এ) একটি view ও একটি variant override করে এবং `PackContractTest` তার `data-action` অসম্পূর্ণ হলে ব্যর্থ হয়; `layout`-অসঙ্গত pack বাছলে 422।
</details>

---

### TASK `3.7` — Languages & RTL Foundation (D30)

- **নির্ভর করে:** `3.6`  ·  **Release:** R1
- **কী পড়বেন:** `docs/I18N.md`, `docs/THEMING.md`, `docs/UI-PACKS.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** i18n infrastructure (bn + en) only. No Arabic content, no RTL snapshots (logical Tailwind classes are still mandatory).


**পরীক্ষা:** `I18nParityTest`, `TermsFallbackTest`, `LocaleResolutionTest`, `ApiMessageLocaleTest`, `SmsSegmentsTest`, `SmsLocaleTest`, `LanguageSettingsTest`, `RtlComponentTest`, `I18nProviderTest`

**Done When:** `docs/I18N.md` §১৪ "Done When (Step 3.7)": বাংলা↔ইংরেজি reload ছাড়া বদলায়, `lang/dir` ঠিক, `Accept-Language` যায়, `users.locale` সংরক্ষিত; মাদ্রাসা demo tenant-এ আরবি চালু করলে তিন থিমে `AppShell` আয়না হয় ও `lint:theme` ০ লঙ্ঘন।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=I18nParityTest|TermsFallbackTest|LocaleResolutionTest|ApiMessageLocaleTest|SmsSegmentsTest|SmsLocaleTest|LanguageSettingsTest|RtlComponentTest
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `i18n/{index,locales,format}.js`, `bn.json`/`en.json` (+ ফাঁকা `ar.json` কাঠামো), `I18nProvider` (`<html lang dir data-locale>`), `LanguageSwitcher` (layout `parts/`), `DirIcon`, `components/bidi/{PlainText,Ltr}`, `tokens.css`-এর `--font-body-chosen`/`--font-ar` ও `[data-locale='ar']`; backend: `config/i18n.php`, `SetLocale` middleware, `lang/{bn,en,ar}/`, `users.locale`, `PUT /auth/locale`, `/bootstrap`-এ `locales`, `institutions.settings.locales/default_locale`, `Settings → ভাষা`; SMS: `SmsSegments`, segment-ভিত্তিক charge, `sms_logs.segments/encoding`; `lint:theme`-এর `physical-direction` ও `directional-icon`। **আরবি UI-লেখা এই ধাপে ফাঁকা থাকতে পারে (fallback চলে)** — কাঠামো ও RTL আয়না এখনই।
> **Spec Reference:** `docs/I18N.md` (সম্পূর্ণ), `docs/THEMING.md` (Layout Contract), `docs/UI-PACKS.md`
> **Tests:** `I18nParityTest`, `TermsFallbackTest`, `LocaleResolutionTest`, `ApiMessageLocaleTest`, `SmsSegmentsTest`, `SmsLocaleTest`, `LanguageSettingsTest`, `RtlComponentTest`, `I18nProviderTest`
> **Done When:** `docs/I18N.md` §১৪ "Done When (Step 3.7)": বাংলা↔ইংরেজি reload ছাড়া বদলায়, `lang/dir` ঠিক, `Accept-Language` যায়, `users.locale` সংরক্ষিত; মাদ্রাসা demo tenant-এ আরবি চালু করলে তিন থিমে `AppShell` আয়না হয় ও `lint:theme` ০ লঙ্ঘন।
</details>

---

### TASK `3.8` — E2E, Visual & a11y Harness (Playwright)

- **নির্ভর করে:** `3.7`  ·  **Release:** R1
- **কী পড়বেন:** `docs/E2E-TESTING.md`, `docs/THEMING.md`, `docs/UI-PACKS.md`, `docs/I18N.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Smoke subset: F1 login, F2 enrol->fee->receipt->parent, F5 language toggle. Not the 12-combination matrix.


**Done When:** `docs/E2E-TESTING.md` §৭ — ১২-কম্বিনেশনে লগইন-পাতা baseline সবুজ; axe serious/critical ০; ইচ্ছাকৃত RTL-ভাঙা ও কনট্রাস্ট-ভাঙায় পরীক্ষা ব্যর্থ।
**পর্যায় C (Step 6.5) এই ধাপের পরে।**

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `playwright.config.js`, তিন tenant × `bn`/`ar` × মোবাইল/ডেস্কটপ = ১২ প্রজেক্ট, `e2e:reset` কমান্ড (শুধু testing), `data-testid` চুক্তি (`app-nav`, `app-topbar`, `language-switcher`, `page-header`), axe, স্ক্রিনশট-baseline-নীতি, CI job; Smoke F1, F2, F5, F12।
> **Spec Reference:** `docs/E2E-TESTING.md` (সম্পূর্ণ), `docs/THEMING.md`, `docs/UI-PACKS.md`, `docs/I18N.md`
> **Done When:** `docs/E2E-TESTING.md` §৭ — ১২-কম্বিনেশনে লগইন-পাতা baseline সবুজ; axe serious/critical ০; ইচ্ছাকৃত RTL-ভাঙা ও কনট্রাস্ট-ভাঙায় পরীক্ষা ব্যর্থ।
> **পর্যায় C (Step 6.5) এই ধাপের পরে।**
</details>

---

### TASK `4.1` — Programs & Batches UI

- **নির্ভর করে:** `3.8`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/academic-structure.md`, `docs/modules/panels-and-features.md`

**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `teachers`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE teachers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED,
    employee_id VARCHAR(20) NOT NULL,
    designation VARCHAR(50),
    department VARCHAR(50),
    joining_date DATE,
    qualification TEXT,
    salary DECIMAL(10,2),
    house_rent DECIMAL(8,2) DEFAULT 0,           -- R6.5: used by SalaryService (hr-payroll-module.md); were only in the module doc
    medical_allowance DECIMAL(8,2) DEFAULT 0,
    transport_allowance DECIMAL(8,2) DEFAULT 0,
    status ENUM('active','inactive','on_leave') DEFAULT 'active',
    deleted_at TIMESTAMP NULL,                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
    UNIQUE KEY unique_employee_code (institution_id, employee_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
ALTER TABLE teachers ADD COLUMN leaving_date DATE NULL;
ALTER TABLE teachers ADD COLUMN show_public TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN public_bio TEXT NULL;
ALTER TABLE teachers ADD COLUMN mpo_index_no VARCHAR(30) NULL;
ALTER TABLE teachers ADD COLUMN qb_monthly_cap DECIMAL(10,2) NULL;
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /programs -> ProgramController@index
GET /batches -> BatchController@index
GET /teachers -> TeacherController@index [role:admin]
POST /teachers -> TeacherController@store [role:admin]
GET /teachers/{id} -> TeacherController@show [role:admin]
PUT /teachers/{id} -> TeacherController@update [role:admin]
DELETE /teachers/{id} -> TeacherController@destroy [role:admin]
POST /programs -> ProgramController@store [role:admin]
GET /programs/{id} -> ProgramController@show [role:admin]
PUT /programs/{id} -> ProgramController@update [role:admin]
DELETE /programs/{id} -> ProgramController@destroy [role:admin]
POST /batches -> BatchController@store [role:admin]
GET /batches/{id} -> BatchController@show [role:admin]
PUT /batches/{id} -> BatchController@update [role:admin]
DELETE /batches/{id} -> BatchController@destroy [role:admin]
GET /batches/{id}/students -> BatchController@students [role:admin]
GET /subjects -> SubjectController@index [role:admin]
POST /subjects -> SubjectController@store [role:admin]
GET /subjects/{id} -> SubjectController@show [role:admin]
PUT /subjects/{id} -> SubjectController@update [role:admin]
DELETE /subjects/{id} -> SubjectController@destroy [role:admin]
GET /teacher/batches -> BatchController@mine [role:teacher]
```

**Done When:** school-এ শ্রেণি (program) ও শাখা (batch) তৈরি/সম্পাদনা; শাখায় শ্রেণিশিক্ষক ও বিষয়-শিক্ষক নিয়োগ; শাখা-ভিত্তিক ছাত্র-তালিকা; terminology-প্রিসেটে 'শ্রেণি/শাখা' শব্দ দেখায় (`GET /bootstrap`)।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> `/admin/academic/programs`, `/admin/batches`, `/admin/batches/:id`।
> **Spec Reference:** `docs/modules/academic-structure.md`, `docs/modules/panels-and-features.md` (Revision 6)
> **Done When:** private_batch tenant-এ Program field দেখা যায় না, batch তৈরিতে default program বসে; school-এ Class → Section।
</details>

---

### TASK `4.2` — Students & Enrollment

- **নির্ভর করে:** `4.1`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/fees-advanced.md`, `docs/modules/data-migration.md`, `docs/modules/student-import.md`, `docs/modules/coaching-private-batch.md`, `docs/templates/react-page-examples.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Students, enrollment, student-ID, Excel import of students. The import API (/imports) lives in module data_migration, which IS in release.modules for R1 but restricted by config('release.import_kinds') = ['students']; other kinds (teachers, fee_history, results, attendance) are R1.1. The OLD /students/import/* endpoints of student-import.md are SUPERSEDED (that document remains the row-validation and template-column spec).


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `students`, `parent_student`, `consents`, `import_jobs`, `import_rows`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE students (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED,
    student_id VARCHAR(20) NOT NULL,
    -- R6: program_id / batch_id / roll_no are a CACHE of the primary active enrollment.
    --     Written ONLY by EnrollmentService. Source of truth = enrollments table.
    program_id BIGINT UNSIGNED NULL,
    batch_id BIGINT UNSIGNED NULL,
    roll_no INT,
    studying_at VARCHAR(150) NULL,               -- coaching: which school/college the student attends
    board_reg_no VARCHAR(30) NULL,
    board_roll_no VARCHAR(30) NULL,
    date_of_birth DATE,
    gender ENUM('male','female','other'),
    blood_group VARCHAR(5),
    religion VARCHAR(30),
    father_name VARCHAR(100),
    mother_name VARCHAR(100),
    guardian_phone VARCHAR(20) NOT NULL,
    address TEXT,
    photo VARCHAR(255),
    admission_date DATE,
    status ENUM('active','inactive','transferred') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,                  -- R7: soft delete (system-design-patterns.md 'Soft Delete Strategy'); the model uses SoftDeletes
    anonymized_at TIMESTAMP NULL,                -- R7: set by StudentErasureService (personal data removed, fee/exam history kept)
    UNIQUE KEY unique_student_code (institution_id, student_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (program_id) REFERENCES programs(id)
);
CREATE INDEX idx_students_institution ON students(institution_id);
CREATE INDEX idx_students_program ON students(program_id);

CREATE TABLE parent_student (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    parent_user_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    relationship ENUM('father','mother','guardian') DEFAULT 'guardian',
    is_primary TINYINT(1) DEFAULT 0,
    UNIQUE KEY unique_parent_student (parent_user_id, student_id),
    FOREIGN KEY (parent_user_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_parent_student ON parent_student(parent_user_id);

CREATE TABLE consents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(30) NOT NULL,                   -- data_processing | sms | health_data | photo
    status ENUM('granted','revoked') NOT NULL,
    guardian_name VARCHAR(100) NULL,             -- who gave it
    guardian_phone VARCHAR(20) NULL,             -- used to honour an SMS opt-out per phone number
    method ENUM('paper','portal','otp','public_form') NOT NULL,
    recorded_by BIGINT UNSIGNED NULL,            -- staff who recorded a paper consent
    granted_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    note VARCHAR(255) NULL,
    UNIQUE KEY unique_consent (student_id, type),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_consents_phone ON consents(institution_id, guardian_phone, type, status);

CREATE TABLE import_jobs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL,                    -- students | teachers | staff | fee_history | results | attendance
    status ENUM('uploaded','mapped','dry_run','running','done','failed','rolled_back') NOT NULL DEFAULT 'uploaded',
    file_path VARCHAR(255) NOT NULL,
    mapping JSON NULL,
    summary JSON NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_import_jobs_inst_created ON import_jobs(institution_id, created_at);

CREATE TABLE import_rows (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    job_id BIGINT UNSIGNED NOT NULL,
    row_no INT NOT NULL,
    status ENUM('ok','error','skipped') NOT NULL,
    error VARCHAR(255) NULL,
    data JSON NULL,
    created_table VARCHAR(40) NULL,               -- what this row created, so a rollback can remove exactly that
    created_id BIGINT UNSIGNED NULL,
    UNIQUE KEY unique_import_row (job_id, row_no),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (job_id) REFERENCES import_jobs(id)
);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /students/{id}/consents -> ConsentController@index [role:admin]
POST /students/{id}/consents -> ConsentController@store [role:admin]
GET /students/{id}/consent-form.pdf -> ConsentController@form [role:admin]
GET /students -> StudentController@index [role:admin]
POST /students -> StudentController@store [role:admin]
GET /students/{id} -> StudentController@show [role:admin]
PUT /students/{id} -> StudentController@update [role:admin]
DELETE /students/{id} -> StudentController@destroy [role:admin]
GET /students/{id}/enrollments -> EnrollmentController@forStudent [role:admin]
POST /enrollments -> EnrollmentController@store [role:admin]
PUT /enrollments/{id} -> EnrollmentController@update [role:admin]
POST /enrollments/{id}/end -> EnrollmentController@end [role:admin]
POST /enrollments/{id}/transfer -> EnrollmentController@transfer [role:admin]
GET /imports/ -> ImportController@index [role:admin]
POST /imports/ -> ImportController@store [role:admin]
GET /imports/templates/{kind}.xlsx -> ImportController@template [role:admin]
GET /imports/{id} -> ImportController@show [role:admin]
PUT /imports/{id}/mapping -> ImportController@mapping [role:admin]
POST /imports/{id}/{action} -> ImportController@transition [role:admin]
GET /imports/{id}/errors.xlsx -> ImportController@errors [role:admin]
GET /parent/consents -> ConsentController@mine [role:parent]
PUT /parent/consents/{type} -> ConsentController@update [role:parent]
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
GET /students/{id}/card -> StudentController@idCard  (ID card, TC/transfer and promotion are later modules)
POST /students/{id}/transfer -> StudentController@issueTC  (ID card, TC/transfer and promotion are later modules)
POST /students/promote -> StudentController@promote  (ID card, TC/transfer and promotion are later modules)
```

**পরীক্ষা:** `StudentImportTest`, `PerInstitutionUniqueTest`, `ConsentTest`, `FilePathPrefixTest`, `FileCollisionTest`, `ImportKindsTest`

**Done When:** school-এ ছাত্র ভর্তি (CRUD, ছাত্র-ID স্বয়ংক্রিয়, অভিভাবকের ফোন থেকে parent অ্যাকাউন্ট); দ্বিতীয় সক্রিয় enrollment চাইলে 422 error; plan-এর `max_students` পূর্ণ হলে 403 `student_limit_reached`; Excel (`kind=students`) আমদানি: ফাইল → dry-run → চালান, ৩০০ ছাত্রে ত্রুটিপূর্ণ সারি আলাদা রিপোর্টে, আবার চালালে দ্বিতীয়বার সব skipped; `kind=teachers` অনুরোধে 422 `kind_not_available`; ছাত্র মুছলে/বেনামি করলে ছবি-সহ সব ফাইল মোছে। **D47:** ছাত্র-সংখ্যার সীমা (`student_limit_reached` 403, `max_students`) **বানাবেন না — এই শেষ-শর্ত বাতিল**; ছাত্র বা শাখার সংখ্যার কোনো সীমা নেই।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=StudentImportTest|PerInstitutionUniqueTest|ConsentTest|FilePathPrefixTest|FileCollisionTest|ImportKindsTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> **সম্মতি (D27):** ভর্তির ফর্মে অভিভাবকের সম্মতি অংশ, Student profile "সম্মতি" ট্যাব, `ConsentService`, `GET /students/{id}/consent-form.pdf` (`docs/legal/privacy-and-consent.md` §3)।
> Student CRUD, profile (Enrollments tab), student ID auto-generation, দ্রুত ভর্তি form, Excel bulk import (import-ও `EnrollmentService` দিয়ে)।
> **Spec Reference:** `docs/modules/fees-advanced.md` (ID generation), `docs/modules/data-migration.md` (R1: `kind=students` — endpoint, dry-run, rollback), `docs/modules/student-import.md` (শুধু সারি-যাচাই ও টেমপ্লেট; তার endpoint বাতিল), `docs/modules/coaching-private-batch.md` (Multi-Batch UX), `docs/templates/react-page-examples.md` (`StudentList.jsx`)
> **Tests:** `StudentImportTest`, `PerInstitutionUniqueTest`, `ConsentTest`
> **Done When:** coaching-এ এক student দুই batch-এ ভর্তি; school-এ দ্বিতীয় ভর্তিতে স্পষ্ট error; plan-এর `max_students` পেরোলে 403 `student_limit_reached`।
</details>

---

### TASK `4.3` — Attendance

- **নির্ভর করে:** `4.2`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/academic-structure.md`, `docs/templates/laravel-core-files.md`, `docs/templates/react-page-examples.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Daily attendance, holidays, absence SMS. Parents read via /parent/children/{id}/attendance.


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `attendances`, `holidays`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE attendances (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,           -- R6: attendance is taken per batch
    date DATE NOT NULL,
    status ENUM('present','absent','late','leave') NOT NULL,
    note VARCHAR(255),
    taken_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (institution_id, student_id, batch_id, date),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_attendance_date ON attendances(institution_id, date);
CREATE INDEX idx_attendance_batch_date ON attendances(institution_id, batch_id, date);

CREATE TABLE holidays (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    date DATE NOT NULL,
    type ENUM('public','institution','optional') DEFAULT 'public',
    description VARCHAR(255),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
CREATE INDEX idx_holidays_date ON holidays(institution_id, date);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /attendance/summary/{id} -> AttendanceController@summary
GET /attendance -> AttendanceController@index [role:admin,teacher]
POST /attendance -> AttendanceController@store [role:admin,teacher]
PUT /attendance/{id} -> AttendanceController@update [role:admin,teacher]
GET /attendance/report -> AttendanceController@report [role:admin,teacher]
GET /parent/children/{id}/attendance -> AttendanceController@forParent [role:parent]
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
GET /student/attendance -> AttendanceController@forStudent  (student login is R1.1)
```

**পরীক্ষা:** `BatchAttendanceTest`, `AttendanceServiceTest`, `AttendanceBulkQueryCountTest`, `BatchReportQueryCountTest`, `ParentAttendanceAccessTest`

**Done When:** school-এ শিক্ষক নিজের শাখার হাজিরা তোলে ('সবাই উপস্থিত' বোতামসহ, মোবাইলে কার্ড-ধরন); ছুটির দিনে 422 `holiday_date`; অনুপস্থিত ছাত্রের অভিভাবকের জন্য SMS queue-তে যায়; অভিভাবক `/parent/children/{id}/attendance`-এ সন্তানের হাজিরা দেখে, অন্যের সন্তান নয়; ৪০ ছাত্রের সংরক্ষণ ≤ ৬টি কোয়েরি।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=BatchAttendanceTest|AttendanceServiceTest|AttendanceBulkQueryCountTest|BatchReportQueryCountTest|ParentAttendanceAccessTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Batch + date ভিত্তিক attendance, absent SMS, মাসিক report।
> **Spec Reference:** `docs/modules/academic-structure.md` (Attendance), `docs/templates/laravel-core-files.md` (`AttendanceService`), `docs/templates/react-page-examples.md` (`Attendance.jsx`)
> **Tests:** `BatchAttendanceTest`, `AttendanceServiceTest`
> **Done When:** coaching student একই দিনে দুই batch-এ আলাদা status পায়।
</details>

---

### TASK `4.4` — Fees

- **নির্ভর করে:** `4.3`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/academic-structure.md`, `docs/modules/fees-advanced.md`, `docs/templates/laravel-core-files.md`, `docs/modules/extended-features.md`, `docs/templates/react-page-examples.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Fee categories, structures, collection, receipts, dues. NOT: expenses, installments, waivers, online payment, refunds, cash book.


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `fee_categories`, `fee_structures`, `fee_payments`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE fee_categories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    frequency ENUM('monthly','yearly','once') DEFAULT 'monthly',
    applicable_to ENUM('all','program_specific') DEFAULT 'all',
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE fee_structures (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL DEFAULT 0, -- R6: 0 = program-level amount; >0 = batch-specific override (0, not NULL: UNIQUE ignores NULLs)
    fee_category_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    academic_year_id BIGINT UNSIGNED NOT NULL DEFAULT 0,   -- 0 = not tied to a year (coaching)
    UNIQUE KEY unique_fee_structure (program_id, batch_id, fee_category_id, academic_year_id),
    FOREIGN KEY (program_id) REFERENCES programs(id),
    FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id)
);
CREATE INDEX idx_fee_structures_batch ON fee_structures(batch_id, fee_category_id, academic_year_id);   -- fee_structure_by_batch: THE hottest fee query (FeeService::resolveAmount);

CREATE TABLE fee_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    enrollment_id BIGINT UNSIGNED NULL,          -- R6: which enrollment this fee belongs to
    online_payment_id BIGINT UNSIGNED NULL,      -- R6.2: set when paid online by a parent (online_payments.id)
    batch_id BIGINT UNSIGNED NULL,               -- R6: denormalised from enrollment for reports
    fee_category_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    paid_amount DECIMAL(10,2) NOT NULL,
    month VARCHAR(7),
    payment_method VARCHAR(30) DEFAULT 'cash',   -- R6.4: cash | bkash | nagad | card | banglaqr | ... (VARCHAR: new gateways add values without a migration)
    receipt_no VARCHAR(50) NOT NULL,             -- one receipt can have several lines (several dues paid together)
    line_no TINYINT UNSIGNED NOT NULL DEFAULT 1, -- R6.2: 1..n inside one receipt
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    collected_by BIGINT UNSIGNED,
    status ENUM('paid','partial','waived','reversed') DEFAULT 'paid',   -- R10: 'reversed' = a reversing line (negative paid_amount, reverses_id set); original rows are never edited (D32)
    UNIQUE KEY unique_receipt_line (institution_id, receipt_no, line_no),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_fee_payments_student ON fee_payments(student_id, month);
CREATE INDEX idx_fee_payments_enrollment ON fee_payments(enrollment_id, month);
ALTER TABLE fee_payments ADD COLUMN reverses_id BIGINT UNSIGNED NULL;
CREATE INDEX idx_fee_payments_inst_paid ON fee_payments(institution_id, paid_at);
CREATE INDEX idx_fee_payments_student_paid ON fee_payments(student_id, paid_at);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /fees/payments/student/{id} -> FeeController@studentPayments
GET /fees/categories -> FeeController@categories [role:admin]
POST /fees/categories -> FeeController@storeCategory [role:admin]
PUT /fees/categories/{id} -> FeeController@updateCategory [role:admin]
GET /fees/report -> FeeController@report [role:admin]
GET /fees/payments -> FeeController@payments [role:admin,accountant]
POST /fees/collect -> FeeController@collect [role:admin,accountant]
GET /fees/dues -> FeeController@dues [role:admin,accountant]
GET /fees/receipt/{id} -> FeeController@receipt [role:admin,accountant]
GET /parent/fees -> FeeController@dues [role:parent]
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
GET /fees/waivers -> FeeController@waivers  (waivers are R2)
PATCH /fees/waivers/{id}/approve -> FeeController@approveWaiver  (waivers are R2)
PATCH /fees/waivers/{id}/reject -> FeeController@rejectWaiver  (waivers are R2)
```

**পরীক্ষা:** `FeeServiceTest`, `FeeResolutionTest`, `FeeCollectionTest`

**Done When:** দুই batch-এর student-এর এক receipt-এ দুই line; `fee_override` কার্যকর; receipt PDF-এ প্রতিষ্ঠানের লোগো ও রঙ, QR-এ `primaryUrl()`।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=FeeServiceTest|FeeResolutionTest|FeeCollectionTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Fee category, fee structure, due generation (enrollment প্রতি), collection, receipt PDF + QR, due list, reminder SMS, waiver/discount/late fee, expense।
> **Spec Reference:** `docs/modules/academic-structure.md` (Fee Resolution), `docs/modules/fees-advanced.md`, `docs/templates/laravel-core-files.md` (`FeeService` — **"Revision 6.2 FeeService Methods" authoritative**: due গণনা, এক receipt একাধিক line), `docs/modules/extended-features.md` #10 (QR), `docs/templates/react-page-examples.md` (`FeeCollection.jsx`)
> **Tests:** `FeeServiceTest`, `FeeResolutionTest`, `FeeCollectionTest`
> **Done When:** দুই batch-এর student-এর এক receipt-এ দুই line; `fee_override` কার্যকর; receipt PDF-এ প্রতিষ্ঠানের লোগো ও রঙ, QR-এ `primaryUrl()`।
</details>

---

### TASK `4.5` — Exams & Results

- **নির্ভর করে:** `4.4`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/grading.md`, `docs/modules/extended-features.md`, `docs/modules/report-cards.md`, `docs/modules/academic-structure.md`, `docs/modules/coaching-private-batch.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Exams, marks entry, grading, marksheet PDF. NOT: admit card, merit list, weighted result sheets, due-blocking. Parents read results via /parent/children/{id}/results and the marksheet via /results/marksheet/{studentId} (admin, teacher, parent of the child, student) - published exams only.


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `exams`, `exam_subjects`, `results`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE exams (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    program_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,               -- R6: NULL = whole program; set = single batch test
    exam_type ENUM('term','class_test','weekly','model_test','admission') DEFAULT 'term',
    academic_year YEAR NOT NULL,
    start_date DATE,
    end_date DATE,
    status ENUM('upcoming','ongoing','completed','published') DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
ALTER TABLE exams ADD COLUMN admit_card_available TINYINT(1) DEFAULT 0;
ALTER TABLE exams ADD COLUMN admit_card_from DATE NULL;
ALTER TABLE exams ADD COLUMN exam_center VARCHAR(150) NULL;
ALTER TABLE exams ADD COLUMN admit_card_instructions TEXT NULL;

CREATE TABLE exam_subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    full_marks DECIMAL(6,2) NOT NULL,            -- copied from subjects.full_marks at creation, editable per exam
    pass_marks DECIMAL(6,2) NOT NULL,
    exam_date DATE NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    room VARCHAR(50) NULL,
    components JSON NULL,                        -- optional split, e.g. [{"key":"written","label":"সৃজনশীল","full":70,"pass":23},{"key":"mcq","label":"MCQ","full":30,"pass":10}]
    sort_order INT DEFAULT 0,
    UNIQUE KEY unique_exam_subject (exam_id, subject_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
ALTER TABLE exam_subjects ADD COLUMN entry_deadline DATETIME NULL;
ALTER TABLE exam_subjects ADD COLUMN locked_at TIMESTAMP NULL;
ALTER TABLE exam_subjects ADD COLUMN locked_by BIGINT UNSIGNED NULL;

CREATE TABLE results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    marks_obtained DECIMAL(6,2),                 -- total for this subject in this exam (= sum of component_marks when components are used)
    component_marks JSON NULL,                   -- R6.3: {"written":52,"mcq":18,"practical":25} when exam_subjects.components is set
    percentage DECIMAL(5,2) NULL,                -- marks_obtained / exam_subjects.full_marks * 100 (server-computed)
    grade VARCHAR(5),
    grade_point DECIMAL(3,2),
    is_absent TINYINT(1) DEFAULT 0,
    is_pass TINYINT(1) NULL,                     -- R6.3: total pass AND every component pass rule (server-computed)
    teacher_remarks VARCHAR(255) NULL,           -- R6.5: per-subject remark shown on the report card (progress-report.md)
    UNIQUE KEY unique_result (exam_id, student_id, subject_id),
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_results_exam ON results(exam_id, student_id);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /exams -> ExamController@index [role:admin]
POST /exams -> ExamController@store [role:admin]
GET /exams/{id} -> ExamController@show [role:admin]
PUT /exams/{id} -> ExamController@update [role:admin]
DELETE /exams/{id} -> ExamController@destroy [role:admin]
POST /exams/{id}/publish -> ExamController@publish [role:admin]
GET /exams/{id}/subjects -> ExamController@subjects [role:admin]
PUT /exams/{id}/subjects -> ExamController@updateSubjects [role:admin]
GET /results -> ResultController@index [role:admin,teacher]
GET /exams/{id}/subjects/{subjectId}/entry -> ResultController@entrySheet [role:admin,teacher]
POST /results/bulk -> ResultController@bulkStore [role:admin,teacher]
PUT /results/{id} -> ResultController@update [role:admin,teacher]
GET /results/marksheet/{studentId} -> ResultController@marksheet [role:admin,teacher,parent]
GET /parent/children/{id}/results -> ResultController@forParent [role:parent]
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
POST /exams/{id}/seat-plan/generate -> ExamController@generateSeatPlan  (seat plan and merit list are R1.1+)
GET /exams/{id}/seat-plan -> ExamController@seatPlan  (seat plan and merit list are R1.1+)
PUT /exams/{id}/seat-plan/{studentId} -> ExamController@adjustSeat  (seat plan and merit list are R1.1+)
GET /exams/{id}/seat-plan/print -> ExamController@printSeatPlan  (seat plan and merit list are R1.1+)
GET /exams/{id}/merit-list -> ExamController@meritList  (seat plan and merit list are R1.1+)
GET /student/results -> ResultController@forStudent  (student login is R1.1)
```

**পরীক্ষা:** `ResultScoringTest`, `ExamSubjectsTest`, `ParentResultAccessTest`, `MarksheetAccessTest`

**Done When:** school-এ নম্বর-এন্ট্রি (শিক্ষক শুধু নিজের বিষয়ে); GPA marksheet PDF (শতকরা + component-ভিত্তিক পাস নিয়ম অনুযায়ী, বাংলা যুক্তাক্ষর ঠিক) `GET /results/marksheet/{studentId}`: admin/শিক্ষক যেকোনো ছাত্রের, অভিভাবক শুধু নিজের সন্তানের, শুধু প্রকাশিত পরীক্ষার (অপ্রকাশিতে 403); ফল প্রকাশ → অভিভাবক-পোর্টালে দৃশ্যমান; একই (exam, student, subject) দুবার নয়।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=ResultScoringTest|ExamSubjectsTest|ParentResultAccessTest|MarksheetAccessTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Exam (program বা batch) + **`exam_subjects`** (বিষয়ভিত্তিক তারিখ-সময়, পূর্ণমান/পাসমান, ঐচ্ছিক component), mark entry (শতকরা-ভিত্তিক গ্রেড, backend-only), bulk Excel upload, GPA marksheet (শুধু `use_gpa`), merit list, result publish + SMS।
> **Spec Reference:** `docs/modules/grading.md` (**"Revision 6.3 ResultService" authoritative**), `docs/modules/extended-features.md` #1, `docs/modules/report-cards.md`, `docs/modules/academic-structure.md` (Exams), `docs/modules/coaching-private-batch.md` (Merit List)
> **Tests:** `ResultScoringTest` (২৫ নম্বরের টেস্টে ২০ = ৮০% → A+; component-এ একটির পাসমান না পেলে মোট যতই হোক F; absent; পূর্ণমানের বেশি → 422; একই (exam, student, subject) দুবার সেভ → একটি row), `ExamSubjectsTest` (exam তৈরিতে সব subject স্বয়ংক্রিয়; admit card সময়সূচি ছাড়া 422)
> **Done When:** school-এ GPA marksheet PDF (৭০+৩০ component-সহ একটি বিষয়ে); coaching-এ ২৫ নম্বরের সাপ্তাহিক টেস্টের rank সহ merit list; admit card-এ বিষয়ভিত্তিক তারিখ-সময়।
</details>

---

### TASK `4.6` — Notifications & SMS

- **নির্ভর করে:** `4.5`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/notifications.md`, `docs/templates/laravel-core-files.md`, `docs/modules/coaching-private-batch.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** SMS (absence alert after attendance is saved, receipt SMS after a payment), credits, SMS log + balance view (GET /sms-logs, GET /subscription/sms-credits), platform sender with institution suffix. NOT: notices, bulk fee-due reminders (R1.1), templates/campaigns/emergency (R2), the institution's own sender-ID approval flow (R2).


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `sms_logs`, `sms_credit_transactions`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE sms_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    to_phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('sent','failed') DEFAULT 'sent',
    segments TINYINT UNSIGNED NOT NULL DEFAULT 1, -- R9: SMS parts billed (Unicode = 70/67 chars, GSM-7 = 160/153) - docs/I18N.md section 7
    encoding VARCHAR(10) NOT NULL DEFAULT 'gsm',  -- gsm | unicode
    sender_id VARCHAR(20) NULL,                  -- R6.2: the sender ID actually used
    fallback_used TINYINT(1) DEFAULT 0,          -- R6.2: institution sender failed, platform sender used instead
    error VARCHAR(255) NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_by BIGINT UNSIGNED
);
ALTER TABLE sms_logs ADD COLUMN campaign_id BIGINT UNSIGNED NULL;
ALTER TABLE sms_logs ADD COLUMN gateway_msg_id VARCHAR(60) NULL;
ALTER TABLE sms_logs ADD COLUMN delivery_status VARCHAR(12) NULL;
ALTER TABLE sms_logs ADD COLUMN delivered_at TIMESTAMP NULL;
ALTER TABLE sms_logs ADD COLUMN cost DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE sms_logs ADD COLUMN route VARCHAR(10) NOT NULL DEFAULT 'universal';
CREATE INDEX idx_sms_logs_inst_sent ON sms_logs(institution_id, sent_at);
CREATE INDEX idx_sms_logs_campaign ON sms_logs(campaign_id);

CREATE TABLE sms_credit_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    type ENUM('purchase','usage','adjustment','refund','qb_purchase') NOT NULL,   -- qb_purchase: D66 (1), question-bank buys from the same wallet
    quantity INT NOT NULL DEFAULT 0,             -- D56: SMS parts of a `usage` row (negative); 0 for money moves
    balance_after DECIMAL(10,2) NOT NULL,        -- D56: wallet balance in taka after this row
    reference VARCHAR(100) NULL,                 -- payment trx id / sms_logs id
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
ALTER TABLE sms_credit_transactions ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE INDEX idx_sms_credit_inst_created ON sms_credit_transactions(institution_id, created_at);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /sms-logs -> SmsLogController@index [role:admin,accountant]
```

**পরীক্ষা:** `SmsCreditTest`, `SmsSenderResolutionTest`, `SmsLogTest`, `SmsCreditBalanceTest`

**Done When:** sandbox/log driver-এ SMS queue হয়ে `sms_logs`-এ যায়; quota ও credit কাটে (বাংলা বার্তার অংশ-গণনা সঠিক, `sms_logs.segments`); platform default sender + প্রতিষ্ঠানের নামের suffix যুক্ত হয়; gateway ব্যর্থ হলে retry ও `fallback_used`; admin `GET /sms-logs` (cursor-pagination) ও `GET /subscription/sms-credits` (ব্যালেন্স + লেনদেন) দেখে।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=SmsCreditTest|SmsSenderResolutionTest|SmsLogTest|SmsCreditBalanceTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> In-app notification, SMS (SSL Wireless) queue-তে, template (terminology সহ), SMS log, quota + credit নিয়ম, notice board। **Sender ID:** `SmsService::senderFor()/compose()` (নিজস্ব approved ID, নইলে platform default + নামের suffix), একবার-fallback, `/admin/settings/sms` পেজ। Template-এ হাতে লেখা `-{institution}` suffix নেই।
> **Spec Reference:** `docs/modules/notifications.md` (Sender ID সহ), `docs/templates/laravel-core-files.md` (`NotificationService`), `docs/modules/coaching-private-batch.md` (SMS Credits)
> **Tests:** `SmsCreditTest`, `SmsSenderResolutionTest`
> **Done When:** sandbox/log driver-এ SMS queue হয়ে `sms_logs`-এ যায়; quota শেষে credit থেকে কাটে; প্রতিষ্ঠানের `approved` sender থাকলে `sms_logs.sender_id` সেটি ও message-এ নামের suffix নেই, না থাকলে default sender ও suffix আছে; নিজস্ব sender-এ gateway ব্যর্থ হলে default দিয়ে একবার retry (`fallback_used=1`)।
</details>

---

### TASK `4.7` — Dashboards & Role Panels

- **নির্ভর করে:** `4.6`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/panels-and-features.md`, `docs/design/user-journeys.md`, `docs/templates/react-page-examples.md`, `docs/modules/coaching-private-batch.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Admin, teacher, accountant, PARENT panels. NOT: student login.


**R1-এ যে route বানাবেন:**
```
GET /super/dashboard -> DashboardController@superAdmin [role:super_admin]
GET /admin/dashboard -> DashboardController@admin [role:admin]
GET /accountant/dashboard -> DashboardController@accountant [role:accountant]
GET /teacher/dashboard -> DashboardController@teacher [role:teacher]
GET /parent/children -> DashboardController@parentChildren [role:parent]
GET /parent/dashboard -> DashboardController@parent [role:parent]
```

**এই controller-এর যে route R1-এ নয় (বানাবেন না):**
```
GET /student/dashboard -> DashboardController@student  (student login is R1.1)
```

**Done When:** প্রতিটি role দিয়ে login করে প্রতিটি menu item খোলে (কোনো 404 নয়); tutor demo-তে ৫-tab bottom bar।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Admin, Teacher, Accountant, Student, Parent dashboard ও তাদের core page (নিজের routine/attendance/result/fee দেখা)। private_batch-এর Home tab।
> **Spec Reference:** `docs/modules/panels-and-features.md`, `docs/design/user-journeys.md`, `docs/templates/react-page-examples.md` (`Dashboard.jsx`), `docs/modules/coaching-private-batch.md` (Lite Mode)
> **Done When:** প্রতিটি role দিয়ে login করে প্রতিটি menu item খোলে (কোনো 404 নয়); tutor demo-তে ৫-tab bottom bar।
</details>

---

### TASK `4.8` — Core PDF & Reports

- **নির্ভর করে:** `4.7`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/pdf-reports.md`, `docs/modules/extended-features.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Receipt, marksheet, due list, attendance report, class list. NOT: ID cards, certificates.


**R1-এ যে route বানাবেন:**
```
GET /admin/reports/{type} -> ReportController@generate [role:admin]
GET /accountant/reports/{type} -> ReportController@financial [role:accountant]
```

**Done When:** প্রতিটি PDF endpoint আসল PDF দেয়; label terminology অনুযায়ী।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Receipt, marksheet, ID card (bulk), student list Excel, collection report, due report।
> **Spec Reference:** `docs/modules/pdf-reports.md`, `docs/modules/extended-features.md` #13
> **Done When:** প্রতিটি PDF endpoint আসল PDF দেয়; label terminology অনুযায়ী।
>
> **MVP Checkpoint:** তিনটি demo tenant-এ ভর্তি → attendance → fee collection → exam → result SMS পুরো পথ হাতে চালান। `TenantIsolationTest` পাস। এখানে থেমে পর্যালোচনার জন্য জানান।
</details>

---

### TASK `5.3` — Super Admin Panel

- **নির্ভর করে:** `4.8`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/panels-and-features.md`, `docs/business/saas-metrics.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** D55-D60 (owner, 2026-10-10): Super Admin opens institutions (no plans), suspends/activates, adds or corrects SMS money; the universal BulkSMSBD API (platform key and sender, the rate per SMS part); the institution's SMS wallet in taka (0.40 per part: 150 GSM / 70 Unicode chars), online recharge with bKash (sandbox until credentials); its own BulkSMSBD key + masking sender with the universal/own on-off toggles (replaces the R2 sender-ID approval). NOT: plans, subscription billing (D55), coupons, support tickets, impersonation.


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `platform_settings`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE platform_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(80) NOT NULL,
    value JSON NOT NULL,
    updated_by BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_setting_key (setting_key)
);
```
</details>

**R1-এ যে route বানাবেন:**
```
GET /billing/bkash/callback -> SmsRechargeCallbackController@bkash
GET /super/institutions -> InstitutionController@index [role:super_admin]
POST /super/institutions -> InstitutionController@store [role:super_admin]
GET /super/institutions/{id} -> InstitutionController@show [role:super_admin]
PUT /super/institutions/{id} -> InstitutionController@update [role:super_admin]
DELETE /super/institutions/{id} -> InstitutionController@destroy [role:super_admin]
PATCH /super/institutions/{id}/toggle -> InstitutionController@toggleStatus [role:super_admin]
POST /super/institutions/{id}/sms-credits -> SmsCreditController@adjust [role:super_admin]
GET /super/sms-settings -> UniversalSmsController@show [role:super_admin]
PUT /super/sms-settings -> UniversalSmsController@update [role:super_admin]
POST /subscription/sms-credits -> SmsCreditController@purchase [role:admin]
GET /admin/settings/sms-sender -> SmsSenderController@show [role:admin]
PUT /admin/settings/sms-sender -> SmsSenderController@update [role:admin]
DELETE /admin/settings/sms-sender -> SmsSenderController@destroy [role:admin]
GET /subscription/sms-credits -> SmsCreditController@balance [role:admin]
```

**পরীক্ষা:** `SmsWalletTest`, `SmsRouteTest`, `SmsRechargeTest`, `SuperInstitutionTest`

**Done When:** `admin.lvh.me`-এ শুধু super_admin; প্রতিষ্ঠান খোলা/বন্ধ; SMS-অংশপ্রতি ওয়ালেট থেকে টাকা কাটে (D56), ব্যালেন্স না থাকলে 402; নিজস্ব API চালু থাকলে ইউনিভার্সাল ব্যবহার হয় না ও টাকা কাটে না (D59); bKash sandbox রিচার্জে ওয়ালেট বাড়ে, লেজারে সারি; module override দিলে সেই tenant-এর menu সঙ্গে সঙ্গে বদলায়।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=SmsWalletTest|SmsRouteTest|SmsRechargeTest|SuperInstitutionTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Dashboard, Institutions (type filter, type বদল, module override, suspend/extend, SMS credit, platform-collect toggle ও fee %), Plans, Billing, Reports, Settings, **SMS sender ID approval queue**, **payout-account verify**, **settlements**, Dashboard-এর "প্রতিষ্ঠানের পাওনা (unsettled)" ও "Sender ID সমস্যা" কার্ড।
> **Spec Reference:** `docs/modules/panels-and-features.md` (Super Admin detailed pages + Revision 6), `docs/business/saas-metrics.md`
> **Done When:** `admin.lvh.me`-এ শুধু super_admin login করতে পারে; module override দিলে সেই tenant-এর menu সঙ্গে সঙ্গে (cache invalidation) বদলায়।
</details>

---

### TASK `8.1` — Privacy and children's data (D27)

- **নির্ভর করে:** `5.3`  ·  **Release:** R1
- **লক্ষ্য:** Make the product lawful and safe to open to strangers' schools.
- **কী পড়বেন:** `docs/legal/privacy-and-consent.md`, `docs/architecture/file-storage.md`, `docs/SECURITY.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** StudentErasureService (one deleteDirectory under institutions/{id}/students/{sid}/ + rows); tenant:purge; sms:trim and audit:trim retention (NOT leads:purge, tenants:purge-due, devices:prune, risk:prune - those modules are later); /privacy and /terms pages (text supplied by the owner's lawyer); INCIDENT-RUNBOOK.md; the restore drill.


**R1-এ যে route বানাবেন:**
```
GET /super/tenant-purge/candidates -> TenantPurgeController@candidates [role:super_admin]
POST /super/tenant-purge/{institutionId}/dry-run -> TenantPurgeController@dryRun [role:super_admin]
POST /super/tenant-purge/{institutionId}/execute -> TenantPurgeController@execute [role:super_admin]
POST /students/{id}/anonymize -> StudentPrivacyController@anonymize [role:admin]
GET /parent/children/{id}/export -> StudentPrivacyController@export [role:parent]
```

**পরীক্ষা:** `ErasureRemovesAllStudentFilesTest`, `TenantPurgeFilesTest`, `RetentionPurgeTest`

**Done When:** ErasureRemovesAllStudentFilesTest, TenantPurgeFilesTest, RetentionPurgeTest green; privacy/terms pages render from the owner-supplied text.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=Erasure
php artisan test --filter=Retention
```

---

### TASK `8.2` — Security hardening

- **নির্ভর করে:** `8.1`  ·  **Release:** R1
- **লক্ষ্য:** Close the security checklist before strangers use it.
- **কী পড়বেন:** `docs/SECURITY.md`, `docs/ops/security-checklist.md`, `docs/AUTHORIZATION.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Every item of the checklist; permission matrix (SECURITY.md) vs RoleMatrixContractTest; token lifetimes per role (D26); rate limits; cross-tenant tests for EVERY R1 route (CrossTenantRouteTest).


**Done When:** Checklist ticked with evidence in docs/PROGRESS.md; RouteMiddlewareContractTest, CrossTenantRouteTest, RoleMatrixContractTest green.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=Contract
php artisan test --filter=CrossTenant
```

---

### TASK `8.5` — Load and scale test (before SIGNUP_MODE=open)

- **নির্ভর করে:** `8.2`  ·  **Release:** R1
- **লক্ষ্য:** Know the peak-hour behaviour before strangers arrive.
- **কী পড়বেন:** `docs/ops/performance-benchmarks.md`, `infra/loadtest/peak-hour.k6.mjs`

> **R1 পরিসর (এটিই চূড়ান্ত):** perf-check.py at SCALE=1 on target-like hardware; then the k6 peak-hour profile against a disposable database.


**Done When:** No FULLSCAN/SORT/SLOW; p95 within the owner's limit at the measured peak; scaling triggers in performance-benchmarks.md replaced by measured numbers.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
python3 infra/scripts/perf-check.py
k6 run -e INPUT=infra/loadtest/inputs.json infra/loadtest/peak-hour.k6.mjs
```

---

### TASK `9.1` — Deployment, backup, monitoring

- **নির্ভর করে:** `8.5`  ·  **Release:** R1
- **লক্ষ্য:** A production environment that survives a bad day.
- **কী পড়বেন:** `docs/ops/deployment-plan.md`, `docs/ops/docker-setup.md`, `infra/nginx.conf`, `infra/Caddyfile`, `infra/github-actions-cicd.yml`, `docs/ops/performance-benchmarks.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** D64: everything that needs no real server is built and tested NOW - Docker (staging), Nginx internal + Caddy edge config, WILDCARD subdomain only (custom domain is R2: skip custom-domain.md Part C), the CI/CD workflow (its deploy step waits for the server address and secrets), MySQL backup + a restore rehearsed locally, slow-query log (long_query_time 0.5), queue-depth and error monitoring, FILES_DRIVER=s3 if more than one server. Buying the server, DNS, real keys, going live and the load test on the real server wait for the owner's deploy decision.


**Done When:** D64: the CI workflow runs tests and builds on push (deploy step ready, switched off until the server exists); a backup is restored into a clean database locally and mysql-smoke.sh passes against it; alerts fire on a forced error (locally). On the real server, at deploy: push to main deploys, the restore and the alert are repeated.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
bash infra/scripts/mysql-smoke.sh
```

---

### TASK `A` — Release 1 acceptance (local, D63/D64), open signup at deploy

- **নির্ভর করে:** `9.1`  ·  **Release:** R1
- **লক্ষ্য:** Decide, with evidence, that strangers may sign up.
- **কী পড়বেন:** `docs/RELEASE-1.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** D63/D64: tick, with evidence, every box of RELEASE-1.md section 7 that can be proven locally (attendance->SMS, fee->receipt, marksheet, parent view, cross-tenant, erasure, load test, mysql-smoke.sh and perf-check.py on local MySQL, Spike Gate); the signup/subscription box (5.1/5.2, after all modules - D55) and the server boxes are ticked before deploy; SIGNUP_MODE stays closed/invite.


**Done When:** Every locally provable box of section 7 ticked with evidence and the owner's acceptance written in docs/PROGRESS.md; Release 3 may start. SIGNUP_MODE=open only at deploy (an owner decision, never the agent's).

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
python3 infra/spec-verify/verify.py . --deep
```

---

### TASK `QB.0` — Question bank foundation: schema, module keys, roles, catalogue rule

- **নির্ভর করে:** `A`  ·  **Release:** R1
- **লক্ষ্য:** Every later QB task has its tables, its module gate and the platform-catalogue rule in place.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** D65/D66: the qb_* tables of question-bank.md §3 into docs/database/schema.sql and as migrations (append-only); module keys `question_bank`, `quiz` (all four types); platform roles `content_writer`, `content_moderator`; the PlatformCatalogue rule (catalogue models have no institution_id, tenant hosts read only `published`, writes refused) with an architecture test; student login switched on for the question bank (release roles).


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `qb_class_levels`, `qb_subjects`, `qb_class_level_subject`, `qb_chapters`, `qb_chapter_class_level`, `qb_topics`, `qb_question_types`, `qb_questions`, `qb_question_options`, `qb_creative_parts`, `qb_question_stimuli`, `qb_question_items`, `qb_question_class_level`, `qb_question_occurrences`, `qb_question_revisions`, `qb_media`, `qb_media_links`, `qb_concepts`, `qb_resources`, `qb_prices`, `qb_price_rules`, `qb_unlocks`, `qb_student_orders`, `qb_student_unlocks`, `qb_writer_earnings`, `qb_writer_wallets`, `qb_writer_wallet_txns`, `qb_withdrawal_requests`, `qb_papers`, `qb_paper_sections`, `qb_paper_items`, `qb_quiz_packages`, `qb_quizzes`, `qb_quiz_questions`, `qb_student_package_access`, `qb_quiz_attempts`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE qb_class_levels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name_bn VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    education_level ENUM('primary','secondary','higher_secondary','madrasa','technical','admission','other') NOT NULL DEFAULT 'other',
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

CREATE TABLE qb_subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name_bn VARCHAR(150) NOT NULL,
    name_en VARCHAR(150) NOT NULL,
    code VARCHAR(30) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

CREATE TABLE qb_class_level_subject (
    qb_class_level_id BIGINT UNSIGNED NOT NULL,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (qb_class_level_id, qb_subject_id),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);

CREATE TABLE qb_chapters (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    name_bn VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    number SMALLINT UNSIGNED NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);

CREATE TABLE qb_chapter_class_level (
    qb_chapter_id BIGINT UNSIGNED NOT NULL,
    qb_class_level_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (qb_chapter_id, qb_class_level_id),
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id)
);

CREATE TABLE qb_topics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_chapter_id BIGINT UNSIGNED NOT NULL,
    name_bn VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id)
);

CREATE TABLE qb_question_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL,
    name_bn VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    family ENUM('mcq','creative','short','fill_gap','matching','true_false','ordering','writing','other') NOT NULL DEFAULT 'other',
    ui_config JSON NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_question_type_slug (slug)
);

CREATE TABLE qb_questions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_type_id BIGINT UNSIGNED NOT NULL,
    qb_subject_id BIGINT UNSIGNED NOT NULL,
    qb_chapter_id BIGINT UNSIGNED NULL,
    qb_topic_id BIGINT UNSIGNED NULL,
    difficulty TINYINT UNSIGNED NOT NULL DEFAULT 3,      -- 1 (easy) .. 5 (hard)
    marks DECIMAL(5,2) NOT NULL DEFAULT 1,
    language ENUM('bn','en') NOT NULL DEFAULT 'bn',
    content_mode ENUM('plain_text','rich_math','mixed') NOT NULL DEFAULT 'plain_text',
    question_json JSON NULL,
    question_text TEXT NOT NULL,
    answer_json JSON NULL,
    answer_text TEXT NULL,
    explanation_json JSON NULL,
    explanation_text TEXT NULL,
    status ENUM('draft','review','published','rejected') NOT NULL DEFAULT 'draft',
    review_note VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    published_at TIMESTAMP NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_qb_questions_browse (status, qb_subject_id, qb_chapter_id, qb_topic_id),
    INDEX idx_qb_questions_writer (created_by, status),
    FOREIGN KEY (qb_question_type_id) REFERENCES qb_question_types(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id),
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (qb_topic_id) REFERENCES qb_topics(id)
);

CREATE TABLE qb_question_options (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(10) NOT NULL,
    content_json JSON NULL,
    content_text TEXT NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,               -- never sent without an unlock (question-bank.md §2)
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_creative_parts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    part_label VARCHAR(10) NOT NULL,                         -- ক / খ / গ / ঘ
    cognitive_level ENUM('knowledge','understanding','application','higher_order') NOT NULL,
    marks DECIMAL(5,2) NOT NULL,
    question_json JSON NULL,
    question_text TEXT NOT NULL,
    answer_json JSON NULL,
    answer_text TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_question_stimuli (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(50) NULL,                                  -- a passage, a table, a word box (structured types, QB.4)
    content_json JSON NULL,
    content_text TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_question_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    qb_question_stimulus_id BIGINT UNSIGNED NULL,
    item_type VARCHAR(50) NOT NULL,                          -- gap / match_pair / order_step / ... (qbank's structured model)
    prompt_json JSON NULL,
    prompt_text TEXT NULL,
    answer_json JSON NULL,                                   -- never sent without an unlock
    marks DECIMAL(5,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id),
    FOREIGN KEY (qb_question_stimulus_id) REFERENCES qb_question_stimuli(id)
);

CREATE TABLE qb_question_class_level (
    qb_question_id BIGINT UNSIGNED NOT NULL,
    qb_class_level_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (qb_question_id, qb_class_level_id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id),
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id)
);

CREATE TABLE qb_question_occurrences (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    board VARCHAR(50) NULL,
    institution_name VARCHAR(200) NULL,
    exam_type VARCHAR(50) NULL,
    year SMALLINT UNSIGNED NULL,
    note VARCHAR(200) NULL,
    INDEX idx_qb_occurrence_board_year (board, year),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_question_revisions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    snapshot JSON NOT NULL,
    edited_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_media (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    path VARCHAR(500) NOT NULL,                              -- the platform's private disk (platform/qb/...)
    mime VARCHAR(100) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL
);

CREATE TABLE qb_media_links (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_media_id BIGINT UNSIGNED NOT NULL,
    owner_type VARCHAR(50) NOT NULL,                         -- question / option / creative_part / concept / resource
    owner_id BIGINT UNSIGNED NOT NULL,
    INDEX idx_qb_media_owner (owner_type, owner_id),
    FOREIGN KEY (qb_media_id) REFERENCES qb_media(id)
);

CREATE TABLE qb_concepts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_topic_id BIGINT UNSIGNED NOT NULL,
    title_bn VARCHAR(250) NOT NULL,
    title_en VARCHAR(250) NULL,
    body_json JSON NULL,
    body_text MEDIUMTEXT NOT NULL,
    status ENUM('draft','review','published','rejected') NOT NULL DEFAULT 'draft',
    review_note VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_qb_concepts_topic (qb_topic_id, status),
    FOREIGN KEY (qb_topic_id) REFERENCES qb_topics(id)
);

CREATE TABLE qb_resources (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('slide','book','pdf') NOT NULL,
    title_bn VARCHAR(250) NOT NULL,
    title_en VARCHAR(250) NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    qb_chapter_id BIGINT UNSIGNED NULL,
    qb_topic_id BIGINT UNSIGNED NULL,
    qb_media_id BIGINT UNSIGNED NOT NULL,
    page_count INT UNSIGNED NULL,
    status ENUM('draft','review','published','rejected') NOT NULL DEFAULT 'draft',
    review_note VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_qb_resources_scope (status, qb_subject_id, qb_chapter_id, qb_topic_id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id),
    FOREIGN KEY (qb_chapter_id) REFERENCES qb_chapters(id),
    FOREIGN KEY (qb_topic_id) REFERENCES qb_topics(id),
    FOREIGN KEY (qb_media_id) REFERENCES qb_media(id)
);

CREATE TABLE qb_prices (                                     -- a change is a NEW row (effective_from); old purchases keep their price
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    audience ENUM('institution','student') NOT NULL,
    item_kind ENUM('question_answer','concept','resource_slide','resource_book','resource_pdf','quiz_package') NOT NULL,
    qb_question_type_id BIGINT UNSIGNED NULL,                -- question_answer: per question type
    amount DECIMAL(10,2) NOT NULL,
    effective_from TIMESTAMP NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_prices_lookup (audience, item_kind, qb_question_type_id, effective_from),
    FOREIGN KEY (qb_question_type_id) REFERENCES qb_question_types(id)
);

CREATE TABLE qb_price_rules (                                -- question-bank.md §4.3: every free / partly-free / discount method
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_type ENUM('item','question_type','topic','chapter','subject','class_level','resource_kind','quiz_package','all') NOT NULL,
    target_ref VARCHAR(100) NULL,                            -- the id, or item "question:12" / resource kind "pdf"; NULL for all
    audience ENUM('institution','student','both') NOT NULL DEFAULT 'both',
    method ENUM('free','first_n_items_free','first_n_pages_free','percent_off','amount_off','fixed_price','free_for_class_level','free_first_n_per_buyer') NOT NULL,
    value DECIMAL(10,2) NULL,
    priority INT NOT NULL DEFAULT 0,
    starts_at TIMESTAMP NULL,
    ends_at TIMESTAMP NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,                 -- rules are switched off, never deleted
    note VARCHAR(250) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_rules_target (is_active, target_type, target_ref)
);

CREATE TABLE qb_unlocks (                                    -- one purchase per institution opens the answer AND paper use for all its teachers (D66)
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    item_type ENUM('question','concept','resource') NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    unlocked_by BIGINT UNSIGNED NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    reason ENUM('paid','free','partial_free') NOT NULL,
    qb_price_rule_id BIGINT UNSIGNED NULL,
    wallet_txn_ref VARCHAR(100) NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_unlock (institution_id, item_type, item_id),
    INDEX idx_qb_unlocks_spending (institution_id, unlocked_by, created_at),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE qb_student_orders (                             -- bKash to the platform merchant (D58 BkashService); items and amount computed by the server
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    ref VARCHAR(20) NOT NULL,
    items JSON NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_id VARCHAR(100) NULL,
    trx_id VARCHAR(100) NULL,
    status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_student_order_ref (ref),
    INDEX idx_qb_orders_student (institution_id, student_user_id, created_at),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE qb_student_unlocks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    item_type ENUM('question','concept','resource') NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    reason ENUM('paid','free','partial_free') NOT NULL,
    qb_student_order_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_student_unlock (student_user_id, item_type, item_id),
    INDEX idx_qb_student_unlocks_inst (institution_id, student_user_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_student_order_id) REFERENCES qb_student_orders(id)
);

CREATE TABLE qb_writer_earnings (                            -- D66: a share of every sale, written in the sale's transaction; never deleted (D32)
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    source ENUM('institution_unlock','student_unlock','quiz_package') NOT NULL,
    source_id BIGINT UNSIGNED NOT NULL,
    item_type ENUM('question','concept','resource','quiz_package') NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    sale_amount DECIMAL(10,2) NOT NULL,
    share_percent DECIMAL(5,2) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_earnings_writer (writer_user_id, created_at)
);

CREATE TABLE qb_writer_wallets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    held DECIMAL(12,2) NOT NULL DEFAULT 0,                   -- amount of pending withdrawal requests
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_writer_wallet (writer_user_id)
);

CREATE TABLE qb_writer_wallet_txns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    type ENUM('earning','withdrawal','adjustment') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    reference VARCHAR(150) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_writer_txns (writer_user_id, created_at)
);

CREATE TABLE qb_withdrawal_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    writer_user_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payout_method ENUM('bank','bkash') NOT NULL,
    payout_account TEXT NOT NULL,                            -- stored encrypted (D33-like: the writer and the Super Admin only)
    status ENUM('pending','paid','rejected') NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP NULL,
    processed_by BIGINT UNSIGNED NULL,
    processed_at TIMESTAMP NULL,
    bank_transaction_id VARCHAR(100) NULL,
    note VARCHAR(250) NULL,
    INDEX idx_qb_withdrawals_status (status, requested_at),
    INDEX idx_qb_withdrawals_writer (writer_user_id, requested_at)
);

CREATE TABLE qb_papers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    program_id BIGINT UNSIGNED NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    exam_name VARCHAR(200) NULL,
    duration_minutes SMALLINT UNSIGNED NULL,
    total_marks DECIMAL(6,2) NOT NULL DEFAULT 0,
    instructions_json JSON NULL,
    status ENUM('draft','final') NOT NULL DEFAULT 'draft',
    sets_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_papers_owner (institution_id, created_by),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);

CREATE TABLE qb_paper_sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    qb_paper_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    instruction VARCHAR(500) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_paper_id) REFERENCES qb_papers(id)
);

CREATE TABLE qb_paper_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    qb_paper_section_id BIGINT UNSIGNED NOT NULL,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    marks DECIMAL(5,2) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_paper_section_id) REFERENCES qb_paper_sections(id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_quiz_packages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    qb_class_level_id BIGINT UNSIGNED NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    description VARCHAR(1000) NULL,
    validity_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,     -- D66: a package has a validity period
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (qb_class_level_id) REFERENCES qb_class_levels(id),
    FOREIGN KEY (qb_subject_id) REFERENCES qb_subjects(id)
);

CREATE TABLE qb_quizzes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qb_quiz_package_id BIGINT UNSIGNED NULL,
    access ENUM('package','free','public') NOT NULL DEFAULT 'package',   -- D66: some quizzes free, some public (no login)
    title VARCHAR(200) NOT NULL,
    qb_subject_id BIGINT UNSIGNED NULL,
    qb_chapter_id BIGINT UNSIGNED NULL,
    qb_topic_id BIGINT UNSIGNED NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL,
    question_count SMALLINT UNSIGNED NOT NULL,
    rule ENUM('fixed','random_from_scope') NOT NULL DEFAULT 'fixed',
    pass_mark DECIMAL(5,2) NULL,
    opens_at TIMESTAMP NULL,
    closes_at TIMESTAMP NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_qb_quizzes_access (is_active, access),
    FOREIGN KEY (qb_quiz_package_id) REFERENCES qb_quiz_packages(id)
);

CREATE TABLE qb_quiz_questions (
    qb_quiz_id BIGINT UNSIGNED NOT NULL,
    qb_question_id BIGINT UNSIGNED NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (qb_quiz_id, qb_question_id),
    FOREIGN KEY (qb_quiz_id) REFERENCES qb_quizzes(id),
    FOREIGN KEY (qb_question_id) REFERENCES qb_questions(id)
);

CREATE TABLE qb_student_package_access (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    qb_quiz_package_id BIGINT UNSIGNED NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    qb_student_order_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_package_access (student_user_id, qb_quiz_package_id, expires_at),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_quiz_package_id) REFERENCES qb_quiz_packages(id),
    FOREIGN KEY (qb_student_order_id) REFERENCES qb_student_orders(id)
);

CREATE TABLE qb_quiz_attempts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    student_user_id BIGINT UNSIGNED NOT NULL,
    qb_quiz_id BIGINT UNSIGNED NOT NULL,
    started_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP NULL,
    score DECIMAL(6,2) NULL,
    total DECIMAL(6,2) NULL,
    answers JSON NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_qb_attempts_student (institution_id, student_user_id, qb_quiz_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (qb_quiz_id) REFERENCES qb_quizzes(id)
);
```
</details>

**Done When:** schema-diff.sh and the schema parity check zero; migrations run on MySQL; TenancyArchitectureTest and a PlatformCatalogueTest green; the module gate refuses the routes when the module is off.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test
bash infra/scripts/schema-diff.sh
```

---

### TASK `QB.1` — Curriculum: class → subject → chapter → topic

- **নির্ভর করে:** `QB.0`  ·  **Release:** R1
- **লক্ষ্য:** The Super Admin maintains the curriculum tree every question hangs on.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_class_levels, qb_subjects, qb_chapters, qb_topics (+ pivots): Super Admin CRUD on the central host and its React pages; a seed from qbank's class/subject lists; optional programs.qb_class_level_id link.


**R1-এ যে route বানাবেন:**
```
GET /super/qb/curriculum -> QbCurriculumController@tree [role:super_admin]
POST /super/qb/{kind} -> QbCurriculumController@store [role:super_admin]
PUT /super/qb/{kind}/{id} -> QbCurriculumController@update [role:super_admin]
DELETE /super/qb/{kind}/{id} -> QbCurriculumController@destroy [role:super_admin]
GET /qb/class-levels -> QbCurriculumController@classLevels [role:admin]
```

**Done When:** Super Admin builds a class → subject → chapter → topic tree; other roles 403; tests and e2e smoke.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbCurriculum
npm test && npm run lint:theme
npx playwright test e2e/qb-curriculum.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.2` — Writers' panel: writers, moderators, revisions, review flow

- **নির্ভর করে:** `QB.1`  ·  **Release:** R1
- **লক্ষ্য:** Platform writers and moderators can work on the central host.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Super Admin adds/removes content_writer and content_moderator users; login on the central host; draft → review → published/rejected with a reason; every save a qb_question_revisions row; audit log.


**R1-এ যে route বানাবেন:**
```
GET /super/qb/writers -> QbWriterController@index [role:super_admin]
POST /super/qb/writers -> QbWriterController@store [role:super_admin]
PATCH /super/qb/writers/{id} -> QbWriterController@update [role:super_admin]
PATCH /writer/change-password -> QbWriterController@changePassword [role:content_writer,content_moderator,super_admin]
GET /writer/curriculum -> QbQuestionController@curriculum [role:content_writer,content_moderator,super_admin]
GET /writer/question-types -> QbQuestionController@types [role:content_writer,content_moderator,super_admin]
GET /writer/questions -> QbQuestionController@index [role:content_writer,content_moderator,super_admin]
POST /writer/questions -> QbQuestionController@store [role:content_writer,super_admin]
GET /writer/questions/{id} -> QbQuestionController@show [role:content_writer,content_moderator,super_admin]
PUT /writer/questions/{id} -> QbQuestionController@update [role:content_writer,super_admin]
GET /writer/questions/{id}/revisions -> QbQuestionController@revisions [role:content_writer,content_moderator,super_admin]
POST /writer/questions/{id}/submit -> QbQuestionController@submit [role:content_writer,super_admin]
POST /writer/questions/{id}/publish -> QbQuestionController@publish [role:content_moderator,super_admin]
POST /writer/questions/{id}/reject -> QbQuestionController@reject [role:content_moderator,super_admin]
```

**Done When:** A writer cannot publish; a moderator can; a rejected item returns to the writer with the reason; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbReview
npm test && npm run lint:theme
npx playwright test e2e/qb-writer.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.3` — Questions: core types and the editor

- **নির্ভর করে:** `QB.2`  ·  **Release:** R1
- **লক্ষ্য:** Writers create the main question types with text, math and images.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_question_types (qbank's slugs), qb_questions, options, creative parts, occurrences, media: API + React editor for mcq, creative, short, true_false, fill_in_the_blank, one_word_answer; Bengali/English; LaTeX math with `mathlive` (D66); images on the private disk; preview.


**R1-এ যে route বানাবেন:**
```
POST /writer/media -> QbMediaController@store [role:content_writer,super_admin]
```

**Done When:** A writer saves each core type with math and an image and sees the preview; answers never leak in any API response without an unlock (QuestionAnswerNeverLeaksTest).

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter="QbQuestion|QuestionAnswerNeverLeaks"
npm test && npm run lint:theme
npx playwright test e2e/qb-editor.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.4` — Questions: the structured types

- **নির্ভর করে:** `QB.3`  ·  **Release:** R1
- **লক্ষ্য:** The rest of qbank's question types.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_question_items / stimuli for gap/cloze/matching/rearrange/passage-based types, following qbank's structured model.


**Done When:** Each structured type round-trips through the API and renders in the editor and the viewer; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter="QbStructured|QuestionAnswerNeverLeaks"
npm test && npm run lint:theme
npx playwright test e2e/qb-structured.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.5` — Concepts and resources (slides, books, PDFs)

- **নির্ভর করে:** `QB.4`  ·  **Release:** R1
- **লক্ষ্য:** Topic-based concepts and downloadable resources.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_concepts (topic-based, same review flow), qb_resources (slide/book/pdf on the private disk, page count, preview pages); viewer pages.


**R1-এ যে route বানাবেন:**
```
GET /writer/concepts -> QbConceptController@index [role:content_writer,content_moderator,super_admin]
POST /writer/concepts -> QbConceptController@store [role:content_writer,super_admin]
GET /writer/concepts/{id} -> QbConceptController@show [role:content_writer,content_moderator,super_admin]
PUT /writer/concepts/{id} -> QbConceptController@update [role:content_writer,super_admin]
POST /writer/concepts/{id}/submit -> QbConceptController@submit [role:content_writer,super_admin]
POST /writer/concepts/{id}/publish -> QbConceptController@publish [role:content_moderator,super_admin]
POST /writer/concepts/{id}/reject -> QbConceptController@reject [role:content_moderator,super_admin]
POST /writer/resource-files -> QbResourceController@upload [role:content_writer,super_admin]
GET /writer/resources -> QbResourceController@index [role:content_writer,content_moderator,super_admin]
POST /writer/resources -> QbResourceController@store [role:content_writer,super_admin]
GET /writer/resources/{id} -> QbResourceController@show [role:content_writer,content_moderator,super_admin]
PUT /writer/resources/{id} -> QbResourceController@update [role:content_writer,super_admin]
POST /writer/resources/{id}/submit -> QbResourceController@submit [role:content_writer,super_admin]
POST /writer/resources/{id}/publish -> QbResourceController@publish [role:content_moderator,super_admin]
POST /writer/resources/{id}/reject -> QbResourceController@reject [role:content_moderator,super_admin]
GET /question-bank/curriculum -> QbLibraryController@curriculum [role:admin,teacher]
GET /question-bank/concepts -> QbLibraryController@concepts [role:admin,teacher]
GET /question-bank/concepts/{id} -> QbLibraryController@concept [role:admin,teacher]
GET /question-bank/resources -> QbLibraryController@resources [role:admin,teacher]
GET /question-bank/resources/{id} -> QbLibraryController@resource [role:admin,teacher]
```

**Done When:** A concept and a PDF go through review and are viewable within their access rules; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter="QbConcept|QbResource|QbLibrary"
npm test && npm run lint:theme
npx playwright test e2e/qb-concepts.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.6` — Prices and the free / partly-free / discount rule engine

- **নির্ভর করে:** `QB.5`  ·  **Release:** R1
- **লক্ষ্য:** The Super Admin sets every price and every rule.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_prices (audience institution|student, per question type and item kind, new row per change) and qb_price_rules with every method of question-bank.md §4.3 and its precedence; QbPricingService::quote() with the winning rule; the Super Admin's rule pages with a preview.


**R1-এ যে route বানাবেন:**
```
GET /super/qb/prices -> QbPricingController@prices [role:super_admin]
POST /super/qb/prices -> QbPricingController@storePrice [role:super_admin]
GET /super/qb/price-rules -> QbPricingController@rules [role:super_admin]
POST /super/qb/price-rules -> QbPricingController@storeRule [role:super_admin]
PUT /super/qb/price-rules/{id} -> QbPricingController@updateRule [role:super_admin]
POST /super/qb/price-rules/preview -> QbPricingController@preview [role:super_admin]
```

**Done When:** Each method and the precedence order are tested to the paisa; ROUND_HALF_UP; never below 0.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbPricing
npm test && npm run lint:theme
npx playwright test e2e/qb-pricing.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.7` — Teachers: browse, buy with the institution wallet, spending

- **নির্ভর করে:** `QB.6`  ·  **Release:** R1
- **লক্ষ্য:** Teachers use the bank; the institution pays once for all its teachers.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Browse/search/filter (free to view); buying answers+paper use from the institution wallet (the SMS taka wallet, ledger type qb_purchase) in one locked transaction; qb_unlocks unique per institution; a private-batch tenant buys again; monthly cap per teacher; the head teacher's spending report per teacher.


**R1-এ যে route বানাবেন:**
```
GET /question-bank/questions -> QbPurchaseController@questions [role:admin,teacher]
GET /question-bank/questions/{id} -> QbPurchaseController@question [role:admin,teacher]
GET /question-bank/quote -> QbPurchaseController@quote [role:admin,teacher]
POST /question-bank/buy -> QbPurchaseController@buy [role:admin,teacher]
GET /question-bank/spending -> QbPurchaseController@spending [role:admin]
PUT /question-bank/caps -> QbPurchaseController@caps [role:admin]
POST /question-bank/buy-many -> QbPurchaseController@buyMany [role:admin,teacher]
```

**Done When:** Two teachers buying the same item at once are charged once; an empty wallet is 402; the cap is 422; another institution's unlock never helps; tests + e2e.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbPurchase
npm test && npm run lint:theme
npx playwright test e2e/qb-buy.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.8` — Question papers: builder, PDF, the head teacher's view

- **নির্ভর করে:** `QB.7`  ·  **Release:** R1
- **লক্ষ্য:** Teachers build institution question papers.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_papers, sections, items; adding a not-yet-bought question buys it after confirmation; Chromium PDF (D50) with/without answers, sets A/B; teachers see their own papers, the head teacher all of the institution's.


**R1-এ যে route বানাবেন:**
```
GET /question-bank/papers -> QbPaperController@index [role:admin,teacher]
POST /question-bank/papers -> QbPaperController@store [role:admin,teacher]
GET /question-bank/papers/{id} -> QbPaperController@show [role:admin,teacher]
PUT /question-bank/papers/{id} -> QbPaperController@update [role:admin,teacher]
DELETE /question-bank/papers/{id} -> QbPaperController@destroy [role:admin,teacher]
POST /question-bank/papers/{id}/finalize -> QbPaperController@finalize [role:admin,teacher]
GET /question-bank/papers/{id}/pdf -> QbPaperController@pdf [role:admin,teacher]
```

**Done When:** A paper with a creative and an MCQ section prints in Bengali; the head teacher sees every teacher's papers; tests + e2e.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbPaper
npm test && npm run lint:theme
npx playwright test e2e/qb-paper.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.9` — Student login and portal: practice, concepts, bKash purchases

- **নির্ভর করে:** `QB.8`  ·  **Release:** R1
- **লক্ষ্য:** Students prepare from the bank.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Student login on (release roles); the portal: own class's subject → chapter → topic, questions, concepts; answer/concept purchases by bKash to the platform merchant (D58 BkashService, central callback) with qb_student_orders and qb_student_unlocks; student prices.


**R1-এ যে route বানাবেন:**
```
GET /qb/student-orders/bkash/callback -> QbStudentOrderCallbackController@bkash
GET /student/qb/curriculum -> QbStudentController@curriculum [role:student]
GET /student/qb/questions -> QbStudentController@questions [role:student]
GET /student/qb/questions/{id} -> QbStudentController@question [role:student]
GET /student/qb/concepts -> QbStudentController@concepts [role:student]
GET /student/qb/concepts/{id} -> QbStudentController@concept [role:student]
POST /student/qb/orders -> QbStudentController@order [role:student]
GET /student/qb/orders/{ref} -> QbStudentController@orderStatus [role:student]
```

**Done When:** A student sees questions free, pays to see an answer once, and another student does not get it; a failed or tampered payment unlocks nothing; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbStudent
npm test && npm run lint:theme
npx playwright test e2e/qb-student.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.10` — Quizzes and quiz packages

- **নির্ভর করে:** `QB.9`  ·  **Release:** R1
- **লক্ষ্য:** Online quizzes for students.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_quiz_packages (validity days), qb_quizzes (access package|free|public, scope, timing), attempts scored on the server, auto-submit at time-up, public page for public quizzes.


**R1-এ যে route বানাবেন:**
```
GET /public/qb/quizzes -> QbPublicQuizController@index
GET /public/qb/quizzes/{id} -> QbPublicQuizController@show
POST /public/qb/quizzes/{id}/check -> QbPublicQuizController@check
GET /super/qb/quiz-packages -> QbQuizController@packages [role:super_admin]
POST /super/qb/quiz-packages -> QbQuizController@storePackage [role:super_admin]
PUT /super/qb/quiz-packages/{id} -> QbQuizController@updatePackage [role:super_admin]
GET /super/qb/quizzes -> QbQuizController@index [role:super_admin]
GET /super/qb/quizzes/{id} -> QbQuizController@show [role:super_admin]
POST /super/qb/quizzes -> QbQuizController@store [role:super_admin]
PUT /super/qb/quizzes/{id} -> QbQuizController@update [role:super_admin]
GET /student/qb/quizzes -> QbStudentQuizController@index [role:student]
GET /student/qb/quiz-packages -> QbStudentQuizController@packages [role:student]
POST /student/qb/quiz-packages/{id}/buy -> QbStudentQuizController@buy [role:student]
POST /student/qb/quizzes/{id}/attempts -> QbStudentQuizController@start [role:student]
GET /student/qb/attempts -> QbStudentQuizController@attempts [role:student]
GET /student/qb/attempts/{id} -> QbStudentQuizController@attempt [role:student]
PUT /student/qb/attempts/{id} -> QbStudentQuizController@save [role:student]
POST /student/qb/attempts/{id}/submit -> QbStudentQuizController@submit [role:student]
```

**Done When:** Package expiry closes its quizzes; free and public quizzes work as specified; scoring is server-side; tests + e2e.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbQuiz
npm test && npm run lint:theme
npx playwright test e2e/qb-quiz.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.10b` — Writers' earnings, wallet and withdrawals

- **নির্ভর করে:** `QB.10`  ·  **Release:** R1
- **লক্ষ্য:** Writers earn a share of every sale and withdraw it.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** qb_writer_earnings in the sale's transaction, writer wallets and ledger, withdrawal requests that hold the amount, the Super Admin's paid (with the bank transaction id) / rejected flow, audit log; writer pages.


**R1-এ যে route বানাবেন:**
```
GET /super/qb/writer-settings -> QbWithdrawalController@settings [role:super_admin]
PUT /super/qb/writer-settings -> QbWithdrawalController@updateSettings [role:super_admin]
GET /super/qb/withdrawals -> QbWithdrawalController@index [role:super_admin]
POST /super/qb/withdrawals/{id}/pay -> QbWithdrawalController@pay [role:super_admin]
POST /super/qb/withdrawals/{id}/reject -> QbWithdrawalController@reject [role:super_admin]
GET /writer/earnings -> QbEarningController@summary [role:content_writer]
GET /writer/withdrawals -> QbEarningController@withdrawals [role:content_writer]
POST /writer/withdrawals -> QbEarningController@requestWithdrawal [role:content_writer]
```

**Done When:** Every sale credits the writer's share to the paisa; a pending request holds the money; paid reduces it once; rejected releases it; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbWriter
npm test && npm run lint:theme
npx playwright test e2e/qb-earnings.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.11` — Import from qbank

- **নির্ভর করে:** `QB.10b`  ·  **Release:** R1
- **লক্ষ্য:** The owner's existing questions come over.
- **কী পড়বেন:** `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** `php artisan qb:import-from-qbank` reading qbank's database: curriculum, question types, questions with options/parts/items, occurrences, media; dry run first, idempotent, a report of what was skipped and why.


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `qb_import_map`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE qb_import_map (                                -- D69 (QB.11): which qbank row became which row here, so qb:import-from-qbank runs once per row
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(30) NOT NULL,                             -- 'qbank'
    source_table VARCHAR(60) NOT NULL,
    source_id BIGINT UNSIGNED NOT NULL,
    target_table VARCHAR(60) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY unique_qb_import_map (source, source_table, source_id)
);
```
</details>

**Done When:** A dry run lists counts; a real run imports them once; a second run changes nothing; tests on a fixture.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbImport
php artisan test   # whole suite stays green
```

---

### TASK `QB.12` — qbank-style question editor (D72)

- **নির্ভর করে:** `QB.11`  ·  **Release:** R1
- **লক্ষ্য:** Writers get qbank's editor: the same layout and toolbar, formatting kept.
- **কী পড়বেন:** `docs/LOCKED-DECISIONS.md`, `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** D72: /writer/questions/{id} in qbank's layout (parts list, editor with toolbar, live preview); the toolbar wraps the selection in D72's small HTML vocabulary (math regions get LaTeX); the server keeps only that vocabulary in every *_text field (QbRichText); the browser renders it from an allowlist into elements, never raw HTML; lists and search show the text without tags; the qbank import keeps the vocabulary and --refresh-text brings the formatting back. No new table, column, route or package. Diagram tools, charts and video are a later step.


**Done When:** Formatting written with the toolbar is saved, shown in the preview and the library the same way; anything outside the vocabulary (script, on*, style, links) never reaches the page; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbRichText
npm test && npm run lint:theme
npx playwright test e2e/qb-editor.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.14` — qbank's table builder and picture tool (D72, later step)

- **নির্ভর করে:** `QB.12`  ·  **Release:** R1
- **লক্ষ্য:** Writers build tables and place pictures inside the text as in qbank.
- **কী পড়বেন:** `docs/LOCKED-DECISIONS.md`, `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** D72's later step: a table builder (rows, columns, caption, border, width, alignment, cell spacing, header row / column, striped rows, a cell grid to type in, merge selected cells and split a cell, editing a table already in the text) and a picture tool (drop, paste or choose; place at the cursor, at the start, at the end or after paragraph N; alignment; size in %; rotation; a light background made transparent; undo / redo; the picture is uploaded as the question's media). The vocabulary gains `caption` and an `img` that names only the question's own media by id with its width and alignment - never a URL; the server keeps nothing else. No new table, column, route or package.


**Done When:** A table with a merged cell and a caption, and a rotated picture placed after paragraph 2 at 50% width, are saved, shown in the preview, the library and the paper PDF; an img naming a URL or an unknown attribute never survives; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbRichText
npm test && npm run lint:theme
npx playwright test e2e/qb-editor.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `QB.13` — Smart editor: mixed parts, new item kinds, the new-question form (D73)

- **নির্ভর করে:** `QB.14`  ·  **Release:** R1
- **লক্ষ্য:** Writers can build every board / NCTB question format in one editor.
- **কী পড়বেন:** `docs/LOCKED-DECISIONS.md`, `docs/modules/question-bank.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** D73: any structured question mixes its parts (sub_mcq, sub_question, gap, match_pair, order_step and the new true_false, table_fill, match_triple, multi_field) with marks per part; gaps may carry a base-word hint; the review check and the quiz marker understand the new kinds; answers never leave without an unlock. The new-question page as qbank's: class levels, content mode, exam type, source history (type, full name, short name, year in the existing occurrence fields), a question code shown from type + id, searchable subject / chapter / topic, a draft first and then the editor; the Super Admin may add a subject / chapter / topic from the form (the existing curriculum routes; adding a question type waits for a route of its own). No new table or column.


**Done When:** A seen passage with MCQ + answer questions + a gap fill + true/false is written, saved, previewed, submitted and published; each new kind round-trips and is marked; tests.

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=QbStructured
npm test && npm run lint:theme
npx playwright test e2e/qb-structured.spec.js e2e/qb-editor.spec.js
php artisan test   # whole suite stays green
```

---

### TASK `5.1` — Signup & Onboarding

- **নির্ভর করে:** `QB.13`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/onboarding.md`, `docs/modules/subscription.md`, `docs/architecture/system-design-patterns.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Self-signup + onboarding wizard. SIGNUP_MODE=invite|open (env) so the public switch can be flipped without code.


**R1-এ যে route বানাবেন:**
```
POST /public/signup -> SignupController@store
GET /public/slug-check -> SignupController@slugCheck
GET /public/plans -> SignupController@plans
```

**পরীক্ষা:** `SignupModeTest`

> **⛔ অবরুদ্ধ (BLOCKED) — এই task এখন বানাবেন না:** **D47:** সাইন-আপে plan বাছাই ও plan-ভিত্তিক ট্রায়াল বাতিল হচ্ছে; মডিউল-ভিত্তিক সাবস্ক্রিপশনের স্পেক (`docs/PRICING-MODEL.md` PM-1) লেখা ও মালিক-অনুমোদিত না হওয়া পর্যন্ত **বানানো নিষিদ্ধ**। **D55/D60 (2026-10-10):** সাবস্ক্রিপশন সব মডিউলের পরে; ক্রমে এখন 9.1-এর পরে।

**Done When:** চার type-এর প্রতিটিতে signup → নিজ subdomain-এ login → wizard → dashboard; default Program/Batch ও preset type অনুযায়ী।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=SignupModeTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Central host-এ Landing + Signup (type নির্বাচন, slug check), `OnboardingService`, type-ভিত্তিক wizard, trial শুরু।
> **Release 1 সংযোজন:** `SIGNUP_MODE=invite|open` (`.env`, নতুন টেবিল নয়)। `invite`: signup-এর জন্য `SIGNUP_INVITE_CODES` (কমা-দিয়ে) থেকে কোড লাগে, ভুল কোডে 403 `signup_closed`; `open`: যে কেউ। ডিফল্ট `invite`। বন্ধ-beta থেকে প্রকাশ্য — শুধু `.env` বদল (`docs/RELEASE-1.md` §৬)। পরীক্ষা: `SignupModeTest`।
> **Spec Reference:** `docs/modules/onboarding.md` (Revision 6 সহ), `docs/modules/subscription.md`, `docs/architecture/system-design-patterns.md` (welcome mail)
> **Done When:** চার type-এর প্রতিটিতে signup → নিজ subdomain-এ login → wizard → dashboard; default Program/Batch ও preset type অনুযায়ী।
</details>

---

### TASK `5.2` — Subscription & Billing (প্রতিষ্ঠান → প্ল্যাটফর্ম)

- **নির্ভর করে:** `5.1`  ·  **Release:** R1
- **কী পড়বেন:** `docs/modules/payment-gateways.md`, `docs/modules/subscription.md`

> **R1 পরিসর (এটিই চূড়ান্ত):** Plans, trial, grace, suspend, invoices, SSLCommerz subscription payment, SMS-credit purchase. Tax/VAT parameter fixed at 0 until OD-4.


**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): `subscription_plans`, `payments`, `subscription_invoices`

<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>

```sql
CREATE TABLE subscription_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_days INT NOT NULL,
    max_students INT DEFAULT -1,
    max_teachers INT DEFAULT -1,
    max_sms INT DEFAULT 1000,
    -- R6: NULL = plan is offered to every institution type
    institution_type ENUM('school','college','coaching','private_batch') NULL,
    max_batches INT DEFAULT -1,
    sort_order INT DEFAULT 0,
    features JSON,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method ENUM('bkash','nagad','card','cash','ssl','coupon') NOT NULL,   -- R11: 'coupon' = a free-days coupon redeemed with no money moved
    trx_id VARCHAR(100) UNIQUE,
    status ENUM('pending','completed','failed','refunded') DEFAULT 'pending',
    paid_at TIMESTAMP NULL,
    invoice_no VARCHAR(50) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
ALTER TABLE payments ADD COLUMN refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN refund_note VARCHAR(255) NULL;

CREATE TABLE subscription_invoices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    institution_id BIGINT UNSIGNED NOT NULL,
    payment_id BIGINT UNSIGNED NOT NULL,
    invoice_number VARCHAR(30) UNIQUE NOT NULL,  -- INV-2025-00001
    plan_name VARCHAR(50) NOT NULL,
    billing_period VARCHAR(30),   -- 'Jan 2025 - Jan 2026'
    amount DECIMAL(10,2) NOT NULL,
    tax DECIMAL(8,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (payment_id) REFERENCES payments(id)
);
ALTER TABLE subscription_invoices ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN coupon_id BIGINT UNSIGNED NULL;
ALTER TABLE subscription_invoices ADD COLUMN tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN tax_label VARCHAR(30) NULL;
ALTER TABLE subscription_invoices ADD COLUMN tax_inclusive TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN credit_for_id BIGINT UNSIGNED NULL;
```
</details>

**R1-এ যে route বানাবেন:**
```
POST /billing/ssl/success -> SslCommerzController@success
POST /billing/ssl/fail -> SslCommerzController@fail
POST /billing/ssl/cancel -> SslCommerzController@cancel
POST /billing/ssl/ipn -> SslCommerzController@ipn
GET /super/plans -> PlanController@index [role:super_admin]
POST /super/plans -> PlanController@store [role:super_admin]
GET /super/plans/{id} -> PlanController@show [role:super_admin]
PUT /super/plans/{id} -> PlanController@update [role:super_admin]
DELETE /super/plans/{id} -> PlanController@destroy [role:super_admin]
GET /super/payments -> PaymentController@index [role:super_admin]
GET /subscription -> SubscriptionController@show [role:admin]
POST /subscription/checkout -> SubscriptionController@checkout [role:admin]
```

**পরীক্ষা:** `SubscriptionLimitTest`

> **⛔ অবরুদ্ধ (BLOCKED) — এই task এখন বানাবেন না:** **D47:** plan-ভিত্তিক সাবস্ক্রিপশন ও বিলিং (`subscription_plans`, `max_*`, plan-গেট) বাতিল; মডিউল-ভিত্তিক সাবস্ক্রিপশন-স্পেক (PM-1) লেখার আগে **বানানো নিষিদ্ধ**। **D55/D60 (2026-10-10):** সাবস্ক্রিপশন সব মডিউলের পরে; ক্রমে এখন 9.1-এর পরে।

**Done When:** sandbox-এ subscription payment → মেয়াদ বাড়ে + invoice + status `active`; মেয়াদ শেষ → grace → suspended, কিন্তু suspended admin তখনও login ও পেমেন্ট করে আবার চালু করতে পারে; callback central domain-এ ফিরে tenant-এর primary URL-এ redirect।

**যাচাই (সব সবুজ হলে তবেই পরের task):**
```bash
php artisan test --filter=SubscriptionLimitTest
npm test && npm run lint:theme
php artisan test   # whole suite stays green
```

<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের "R1 পরিসর" জেতে</summary>

> Plan তালিকা (type অনুযায়ী), **SSLCommerz দিয়ে প্ল্যাটফর্মের subscription payment** (প্ল্যাটফর্মের নিজস্ব credential), invoice PDF, lifecycle scheduler (reminder, grace, suspend), upgrade/downgrade, SMS credit কেনা।
> **Spec Reference:** `docs/modules/payment-gateways.md` (শুধু SSLCommerz Subscription অংশ), `docs/modules/subscription.md`
> **Tests:** `SubscriptionLimitTest`
> **Done When:** sandbox-এ subscription payment → মেয়াদ বাড়ে + invoice + status `active`; মেয়াদ শেষ → grace → suspended, কিন্তু suspended admin তখনও login ও পেমেন্ট করে আবার চালু করতে পারে; callback central domain-এ ফিরে tenant-এর primary URL-এ redirect।
</details>

---

## Appendix A — R1 টেবিল ও মালিক-task

| টেবিল | মালিক task |
|---|---|
| `institutions` | `2.1` |
| `users` | `2.3` |
| `otp_tokens` | `2.3` |
| `theme_presets` | `2.4` |
| `academic_years` | `2.5` |
| `programs` | `2.5` |
| `batches` | `2.5` |
| `subjects` | `2.5` |
| `enrollments` | `2.5` |
| `batch_teachers` | `2.5` |
| `teacher_subjects` | `2.5` |
| `audit_logs` | `2.6` |
| `teachers` | `4.1` |
| `students` | `4.2` |
| `parent_student` | `4.2` |
| `consents` | `4.2` |
| `import_jobs` | `4.2` |
| `import_rows` | `4.2` |
| `attendances` | `4.3` |
| `holidays` | `4.3` |
| `fee_categories` | `4.4` |
| `fee_structures` | `4.4` |
| `fee_payments` | `4.4` |
| `exams` | `4.5` |
| `exam_subjects` | `4.5` |
| `results` | `4.5` |
| `sms_logs` | `4.6` |
| `sms_credit_transactions` | `4.6` |
| `subscription_plans` | `5.2` |
| `payments` | `5.2` |
| `subscription_invoices` | `5.2` |
| `platform_settings` | `5.3` |
| `qb_class_levels` | `QB.0` |
| `qb_subjects` | `QB.0` |
| `qb_class_level_subject` | `QB.0` |
| `qb_chapters` | `QB.0` |
| `qb_chapter_class_level` | `QB.0` |
| `qb_topics` | `QB.0` |
| `qb_question_types` | `QB.0` |
| `qb_questions` | `QB.0` |
| `qb_question_options` | `QB.0` |
| `qb_creative_parts` | `QB.0` |
| `qb_question_stimuli` | `QB.0` |
| `qb_question_items` | `QB.0` |
| `qb_question_class_level` | `QB.0` |
| `qb_question_occurrences` | `QB.0` |
| `qb_question_revisions` | `QB.0` |
| `qb_media` | `QB.0` |
| `qb_media_links` | `QB.0` |
| `qb_concepts` | `QB.0` |
| `qb_resources` | `QB.0` |
| `qb_prices` | `QB.0` |
| `qb_price_rules` | `QB.0` |
| `qb_unlocks` | `QB.0` |
| `qb_student_orders` | `QB.0` |
| `qb_student_unlocks` | `QB.0` |
| `qb_writer_earnings` | `QB.0` |
| `qb_writer_wallets` | `QB.0` |
| `qb_writer_wallet_txns` | `QB.0` |
| `qb_withdrawal_requests` | `QB.0` |
| `qb_papers` | `QB.0` |
| `qb_paper_sections` | `QB.0` |
| `qb_paper_items` | `QB.0` |
| `qb_quiz_packages` | `QB.0` |
| `qb_quizzes` | `QB.0` |
| `qb_quiz_questions` | `QB.0` |
| `qb_student_package_access` | `QB.0` |
| `qb_quiz_attempts` | `QB.0` |
| `qb_import_map` | `QB.11` |

## Appendix B — route-সংখ্যা release অনুযায়ী (routes-টেমপ্লেটের সব route)

| Release | route |
|---|---|
| R1 | 245 |
| R1(excluded) | 21 |
| R1.1 | 35 |
| R2 | 150 |
| R2+ | 34 |
| R3 | 129 |
| R4 | 11 |
| R5 | 11 |

## Appendix C — R1-এ **নেই** (বানাবেন না)

**মডিউল-কী (`config/release.php`-এ নেই):** school-এর ৫৪টির মধ্যে ৭টি ছাড়া বাকি সব।

**Controller (release অনুযায়ী):**

- **R1.1:** `ExpenseController`, `ExportController`, `NoticeAckController`, `NoticeController`, `RoutineController`, `SuperBackupController`, `SuperImportController`, `SuperSupportController`, `SupportTicketController`
- **R2:** `AdminOnlinePaymentController`, `AdmissionCycleController`, `AdmissionLeadActionController`, `DomainApprovalController`, `DomainController`, `DueBlockController`, `EmergencyController`, `FeePaymentCallbackController`, `FeePaymentController`, `GalleryController`, `InstitutionThemeController`, `LeadController`, `ManifestController`, `MarksLockController`, `MaterialController`, `MessageController`, `NewsController`, `OnlinePaymentReportController`, `PaymentSettingsController`, `PayoutAccountController`, `PeriodAttendanceController`, `PublicAdmissionController`, `PublicAdmissionPayController`, `PublicAdmissionStatusController`, `PublicEventController`, `PublicSiteController`, `PublicTeacherController`, `PublicThemeController`, `ResultSheetController`, `RoutineBlockController`, `SettlementController`, `SitePageController`, `SmsCampaignController`, `SmsSenderApprovalController`, `SmsTemplateController`, `SmsWebhookController`, `StudentLeaveController`, `SubstitutionController`, `TeacherPayoutController`, `ThemePresetController`, `TlsCheckController`, `WebsiteSettingsController`
- **R2+:** `HifzController`, `HomeworkController`, `LessonPlanController`, `RiskController`, `SyllabusCoverageController`, `SyllabusUnitController`, `VerifyController`
- **R3:** `AccountController`, `AccountingReportController`, `AccountingSettingController`, `BankReconciliationController`, `BonusSchemeController`, `BudgetController`, `CashBookController`, `DonationCampaignController`, `DonationController`, `DonationFundController`, `DonorController`, `FeeRefundController`, `FinalSettlementController`, `IncrementBatchController`, `InventoryItemController`, `InventoryMovementController`, `InventoryReportController`, `LeaveController`, `LeaveTypeController`, `PayAccountController`, `PayrollItemController`, `PayrollReportController`, `PayrollRunController`, `ProvidentFundController`, `SalaryAdjustmentController`, `SalaryAdvanceController`, `SalaryComponentController`, `SalaryRevisionController`, `SalaryStructureController`, `StaffAttendanceController`, `StaffController`, `SuperRefundController`, `TeacherAttendanceController`, `TeacherSalaryController`, `VoucherController`
- **R4:** `AttendanceDeviceController`, `DevicePunchController`, `DevicePunchReviewController`, `PersonCredentialController`, `TransportController`
- **R5:** `CouponController`, `ImpersonationController`, `PlatformSettingController`, `SAReportController`, `SuperCouponController`

**Build step:** `5.2b` (R2), `5.4` (R2), `5.5` (R2), `5.6` (R1.1), `6.1` (R2), `6.2` (R2), `6.3` (R2), `6.4` (R2), `6.5` (R2), `6.6` (R2), `6.7` (R3), `6.8` (R1.1), `6.9` (R2), `8.4` (R1.1)

**পরে কী আসবে:**

- **R1.1:** notices; expenses; support tickets; tenant export / backup (D38); student login; admit card + ID card; routine; data-migration wizard + quick wins; fee due reminders (bulk SMS to parents of students with dues)
- **R2:** online fee payment (OD-1); UI Pack B/C + theme editor; custom domain; public website + admission cycle; advanced academics (weighted results, due-block, substitution); coaching / private-batch / college polish; Arabic + RTL + madrasa pack
- **R3:** payroll + staff; cash book + refund / reversal; inventory; accounting + donations
- **R4:** attendance devices
- **R5:** coupons, VAT, impersonation, saas-metrics
- **R6:** Bangla QR, Nagad, bank disbursement
- **R7:** mobile app, AI, GPS
