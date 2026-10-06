# Agent Build Sequence — Education Management SaaS (Revision 6)

> **এখন কী বানানো হচ্ছে: Release 1 (`docs/RELEASE-1.md`, `docs/release/r1-scope.json`).** নিচের প্রতিটি Step-এ `Release:` চিহ্ন আছে — `R1` নয় এমন Step এখন **বানাবেন না** (স্পেক থাকে, কোড নয়)। `config/release.php` ও `ModuleGate` ধাপ 0 এটি কোডে বাধ্য করে। Phase 8 (নিরাপত্তা/গোপনীয়তা) ও Phase 9 (deployment) R1-এর অংশ।

এটি execution playbook। আগে `AGENTS.md` পড়ুন (নিয়ম ও Locked Decisions), তারপর এই ফাইল উপর থেকে নিচে অনুসরণ করুন। প্রতিটি Step-এ আছে: কী বানাতে হবে, **Spec Reference** (বিস্তারিত কোন ফাইলে), এবং **Done When** (যাচাইযোগ্য শর্ত)।

## How to Use This Document
1. **ক্রম ভাঙবেন না।** প্রতিটি Step আগের Step-এর উপর দাঁড়ায়।
2. Spec Reference-এর ফাইল খুলে পড়ুন; এই ফাইলে implementation detail নেই — শুধু ক্রম ও নির্দেশনা।
3. Done When পূরণ + test সবুজ → `docs/PROGRESS.md`-এ `[x]` → commit → পরের Step।
4. ফাঁক বা অস্পষ্টতা → `AGENTS.md` Working Rule 3 (`docs/DECISIONS.md`)।

## Why the Order Is What It Is
পরে সংশোধন এড়াতে চারটি জিনিস **প্রথমেই** বসে, কারণ এগুলো পরে বদলালে প্রতিটি module আবার খুলতে হয়: (১) tenancy ও host resolution, (২) institution type + module gate + terminology, (৩) Program/Batch/Enrollment, (৪) theme token + layout shell। এরপর প্রতিটি module **backend ও frontend একসাথে** (vertical slice) বানানো হয় এবং চার ধরনের demo tenant-এ যাচাই করা হয়।

| Phase | What | Outcome |
|---|---|---|
| 0 | Scaffold | দুটি project চলে |
| 1 | Database | ১৪৩ টেবিল + seed (৩টি demo tenant) |
| 2 | Backend foundation | tenancy, type, gate, auth, bootstrap, enrollment |
| **S** | **Spike (গেট)** | `docs/spike/walking-skeleton.md` — একটি vertical slice, তিন tenant, মাপ-ছক, Go/Adjust/Stop |
| 3 | Frontend foundation | theme, ৪ layout, nav, shared component, login |
| 4 | Core modules (MVP) | Student, Attendance, Fee, Exam, SMS, Dashboard — চার type-এ |
| 5 | SaaS layer | signup, onboarding, subscription, online fee payment & settlement, Super Admin, theme editor, custom domain |
| 6 | Type-specific | coaching, private batch lite mode, college, public website & admission form |
| 7 | Extended modules | HR, routine, library, transport, hostel, quiz … |
| 8 | Security | checklist |
| 9 | Deployment | Caddy + Nginx + CI/CD |
| 10 | Later | mobile app, AI, GPS, PWA |

Phase 4 শেষে পণ্যটি চার ধরনের প্রতিষ্ঠানে হাতে-চালানো demo-র উপযুক্ত; Phase 5 শেষে বিক্রির উপযুক্ত।

---

## Pre-Flight Checklist
- [ ] `AGENTS.md`, `docs/STYLE-GUIDE.md`, `docs/modules/` (৪টি), `docs/THEMING.md`, `docs/modules/custom-domain.md` (Part A–B) পড়া হয়েছে (`docs/modules/online-fee-payment.md` ও `docs/modules/public-website.md` তাদের Step-এর আগে)
- [ ] Monorepo: `api/` (Laravel) ও `frontend/` (React), সাথে `docs/PROGRESS.md` ও `docs/DECISIONS.md` (খালি)
- [ ] PHP 8.2+, Composer, Node 20+, MySQL 8.0+, Redis 7+
- [ ] Dev host: `lvh.me` ব্যবহার হবে (`*.lvh.me` → 127.0.0.1) — `docs/modules/custom-domain.md` "Local Development"

---

## PHASE 0 — Scaffold

### Step 0.1 — Laravel
> **Release: R1**
```bash
composer create-project laravel/laravel api && cd api
composer require laravel/sanctum barryvdh/laravel-dompdf maatwebsite/excel endroid/qr-code
php artisan install:api
composer require league/flysystem-aws-s3-v3 "^3.0"      # only when FILES_DRIVER=s3 (docs/architecture/file-storage.md)
```
`config/tenancy.php` ও `config/institution_types.php` এখনই বানান (code: `docs/templates/laravel-core-files.md`, `docs/modules/institution-types.md`)।
**Spec Reference:** `docs/architecture/folder-structure.md` (+ Revision 6 additions), `docs/architecture/environment-variables.md`
`spatie/laravel-permission` ইনস্টল করবেন না (`docs/LOCKED-DECISIONS.md` D17)।
**Done When:** `php artisan serve` চলে; `config('tenancy.base_domain')` ও `config('institution_types.coaching.terms.batch.bn')` tinker-এ মান দেয়।

### Step 0.2 — React
> **Release: R1**
```bash
npm create vite@latest frontend -- --template react && cd frontend
npm install tailwindcss @tanstack/react-query zustand axios react-router-dom react-hook-form zod @hookform/resolvers
npm install recharts lucide-react qrcode.react date-fns react-i18next i18next
```
`vite.config.js`: `/api` proxy → `http://127.0.0.1:8000`, `changeOrigin: false`, `allowedHosts: ['.lvh.me']`। `.env`: `VITE_API_URL=/api/v1`।
**Done When:** `http://demo.lvh.me:5173` খোলে এবং `fetch('/api/v1/health')` Laravel-এ পৌঁছায় (Host header `demo.lvh.me` অক্ষত)।

### Step 0.3 — .env, Folders, CI Skeleton
> **Release: R1**
`infra/check-theme-rules.mjs` → `frontend/scripts/check-theme-rules.mjs`; `package.json`: `"lint:theme": "node scripts/check-theme-rules.mjs"`; CI-তে `npm run lint:theme` (লঙ্ঘন = build ব্যর্থ) এবং `node infra/check-schema-parity.mjs` (module-ডকের নকল DDL `schema.sql` থেকে সরলে ব্যর্থ — D13)। এটি `no-hardcoded-colors`/`no-hardcoded-terms` grep-এর জায়গায় — রঙ-class, hex, `rounded-lg/xl`, হার্ডকোড Class/Section/Batch/Course শব্দ ও `dangerouslySetInnerHTML` ধরে।
**Spec Reference:** `docs/architecture/environment-variables.md` (Revision 5 ও 6), `docs/architecture/folder-structure.md`, `docs/ops/git-workflow.md`
**Done When:** দুই project-এর `.env.example` সম্পূর্ণ; CI-তে `php artisan test`, `npm test` (খালি হলেও) ও `npm run lint:theme` চলে।

---

## PHASE 1 — Database

### Step 1.1 — Migrations
> **Release: R1**
`docs/database/schema.sql`-এর প্রতিটি `CREATE TABLE`-এর জন্য একটি migration, `docs/database/migrations.md`-এর ক্রমে। `schema.sql`-এর পরবর্তী `ALTER TABLE … ADD COLUMN` গুলো মূল table-এর migration-এই মিশিয়ে দিন (একটি table = একটি `create_*` migration); ব্যতিক্রম শুধু `docs/database/migrations.md` Revision 6-এ নাম ধরে দেওয়া `add_*` migration। JSON কলামে model-এ `array` cast।
Laravel-এর নিজস্ব table (`personal_access_tokens`, `notifications`, `jobs`, `failed_jobs`) `docs/database/migrations.md`-এর "Laravel Framework Tables" অংশ অনুযায়ী artisan দিয়ে বানান।
**Done When:** `php artisan migrate:fresh` ত্রুটিহীন; database-এ ১৪৩টি table (+ Laravel-এর নিজস্ব); `users`-এ `(institution_id, email)`, `(institution_id, phone)`, `(institution_id, username)` unique index আছে।

### Step 1.2 — Models
> **Release: R1**
প্রতিটি table-এর Eloquent model; tenant-scoped গুলোতে `BelongsToInstitution`। `Student` model-এ enrollment relation ও scope (`docs/modules/academic-structure.md`)।
**Spec Reference:** `docs/templates/laravel-core-files.md` (trait, `Student.php`), `docs/architecture/system-design-patterns.md` (soft delete)
**Done When:** ১৪৩টি model; `BelongsToInstitution` নেই শুধু `Institution`, `SubscriptionPlan`, `ThemePreset`, `OtpToken`, `Coupon`, `PlatformSetting`-এ।

### Step 1.3 — Seeders
> **Release: R1**
ক্রম: Plan → ThemePreset → SuperAdmin → DemoInstitution (school) → DemoData → DemoCoaching → DemoTutor। Demo seeder গুলো `EnrollmentService` ও `ThemeService::applyPreset()` ব্যবহার করে, তাই এই Step সম্পূর্ণ সবুজ হবে Step 2.5 ও 2.6-এর পরে — এখন Plan, ThemePreset, SuperAdmin চালান; বাকি তিনটি Step 2.6-এর Done When-এ।
**Spec Reference:** `docs/database/seeders.md` (Revision 6 section সহ)
**Done When:** ৫টি plan, ৬টি theme preset, ১টি super admin DB-তে।

---

## PHASE 2 — Backend Foundation

### Step 2.1 — Tenancy
> **Release: R1**
`Tenancy` (+ `InstitutionScope`, `BelongsToInstitution`, `TenantAwareJob`/`BindTenant`, `PlatformScope`), `TenantResolver`, `TenantMiddleware`, central host, reserved slug; `bootstrap/app.php`-এ middleware alias (`tenant`, `tenant.optional`, `central`)।
**Spec Reference:** `docs/templates/laravel-core-files.md` (Revision 6 code), `docs/architecture/tenancy.md`, `docs/modules/custom-domain.md` Part A
**Tests:** `TenantResolverTest`, `TenantModeTest`, `TenantFailClosedTest`, `QueueTenantLeakTest`, `TenancyArchitectureTest`
**Done When:** (Fail-closed, D25) tenant ছাড়া `Student::count()` `TenantNotBoundException` দেয়; `Tenancy::withoutTenancy()` ভেতরে চলে, বাইরে নয়; একটি job-এর পরে অন্য প্রতিষ্ঠানের job চালালে আগেরটির tenant জমে থাকে না; `TenancyArchitectureTest` অনুমোদিত তালিকার বাইরে কোনো `withoutGlobalScope(s)`/`app()->instance('currentInstitution'`/raw `DB::table` ধরে। এবং: অজানা host → 404 `institution_not_found`; reserved slug resolve হয় না; `tenant` route central host-এ 404, `tenant:central` route tenant host-এ 404; Super Admin token tenant host-এ 403 `forbidden_host`, tenant user-এর token central host-এ বা অন্য tenant-এর host-এ 403 `institution_mismatch`; suspended institution শুধু auth/bootstrap/subscription/billing পথে ঢুকতে পারে।

### Step 2.2 — Institution Types, Module Gate, Terminology
> **Release: R1**
`ModuleGate`, `ModuleMiddleware` (`module:x`), `FeatureMiddleware` (`feature:x`), `term()` helper, `SubscriptionCheck` (মেয়াদ + `max_students` + `max_batches`), `AcademicYearMiddleware`, `RoleMiddleware`।
**Spec Reference:** `docs/modules/institution-types.md`, `docs/modules/subscription.md`, `docs/templates/laravel-core-files.md`
**Tests:** `ModuleGateTest`, `TerminologyTest`
**Done When:** একটি test route-এ `module:hostel` — coaching tenant-এ 403 `module_disabled`, Basic-plan school-এ 403 `feature_not_available`, Enterprise school-এ 200, override দিলে উল্টো।

### Step 2.3 — Authentication
> **Release: R1**
Login (email / phone / student ID), lockout, must-change-password, password reset (email ও OTP), 2FA (ঐচ্ছিক), logout। Tenant host ও central host-এর বিভাজন।
**Spec Reference:** `docs/AUTHORIZATION.md` (Token Strategy, Password Policy, Lockout — Revision 7), `docs/API-ERRORS.md`
**Tests:** `LoginIdentifierTest`, `CrossTenantHostTest`, `TokenLifetimeTest`, `PasswordPolicyTest`, `LockoutTest`
**Done When:** তিন ধরনের identifier-এ login হয়; অন্য tenant-এর token অন্য host-এ 403। এবং (D26): মেয়াদ-উত্তীর্ণ token 401; idle-সীমা পার হলে 401 (Sanctum callback-এ — middleware-এ নয়); ৬ষ্ঠ লগইনে সবচেয়ে পুরনো token বাতিল; পাসওয়ার্ড বদলালে/ব্যবহারকারী নিষ্ক্রিয় হলে সব token বাতিল; লক হওয়া ও ভুল-পাসওয়ার্ডের উত্তর হুবহু এক; `/auth/sessions`, `/auth/logout-all`, Admin `force-logout`/`unlock`।

### Step 2.4 — Theme Service + Bootstrap Endpoint
> **Release: R1**
`ThemeService` (Layer 1 code + Revision 6-এর `getTheme`, `applyPreset`, `updateTokens`, `updateLayout`), `ThemeTokensRule`, `GET /bootstrap`, `GET /theme/public`, `GET /api/v1/manifest.webmanifest`।
**Spec Reference:** `docs/modules/institution-branding.md` (Layer 1), `docs/THEMING.md`, `docs/modules/institution-types.md` ("Bootstrap Endpoint")
**Tests:** `ThemeResolutionTest`
**Done When:** `curl -H "Host: <slug>.lvh.me" /api/v1/bootstrap` — `terms`, `modules`, `theme` (৮টি token সহ) ফেরত দেয়; central host-এ `is_central: true`।

### Step 2.5 — Programs, Batches, Enrollment
> **Release: R1**
`ProgramController`, `BatchController`, `EnrollmentController`, `EnrollmentService`, `OnboardingService::applyDefaults()`।
**Spec Reference:** `docs/modules/academic-structure.md`, `docs/modules/institution-types.md` ("Onboarding Defaults")
**Tests:** `EnrollmentServiceTest`, `EnrollmentCacheSyncTest`
**Done When:** test পাস; এবং Step 1.3-এর বাকি তিনটি demo seeder চলে — `php artisan migrate:fresh --seed` ত্রুটিহীন, তিনটি demo tenant তৈরি।

### Step 2.6 — Shared Services
> **Release: R1**
ক্রম: `StudentService` → `AttendanceService` → `ResultService` → `FeeService` (`resolveMonthlyAmount` সহ) → `NotificationService` → `SmsService` (quota + credit) → `PdfService`। `AppServiceProvider`-এ bind।
**Spec Reference:** `docs/templates/laravel-core-files.md`, `docs/modules/academic-structure.md` (Fee Resolution, Attendance), `docs/modules/grading.md`, `docs/modules/notifications.md`, `docs/modules/pdf-reports.md`, `docs/architecture/backend-pattern.md`
**Done When:** প্রতিটি service class আছে ও resolve হয়; `FeeResolutionTest` পাস।

### Step 2.7 — Routes Skeleton
> **Release: R1**
`routes/api.php`: `v1` prefix; group: public (tenant), public (central), authenticated role group, `super` (central host only), `internal`। প্রতিটি module route-এ `module:` middleware।
**Spec Reference:** `docs/templates/laravel-core-files.md` (`routes/api.php`), `docs/API.md` (Revision 6 section সহ), `docs/SECURITY.md` (permission matrix)
**Done When:** `php artisan route:list` ত্রুটিহীন এবং `php artisan route:cache` সফল (duplicate route name নেই); `GET /api/v1/health` বিনা token-এ 200; `TenantIsolationTest`-এর কাঠামো (চার type-এর দুটি করে tenant) চালু।

---

## PHASE S — Walking Skeleton Spike (Gate, Revision 7)
Phase 0–2 শেষ করে **এবং একটি vertical slice** (ছাত্র ভর্তি → enrollment → বকেয়া → ফি আদায় → রসিদ → অভিভাবক দেখে) `school`/`coaching`/`private_batch`-এ চালিয়ে দেখা; প্রতিটি ধাপের মাপ `docs/SPIKE-LOG.md`-এ।
**Spec Reference:** `docs/spike/walking-skeleton.md` (সম্পূর্ণ — ধাপ S0–S8, মাপ-ছক, আটটি নির্দিষ্ট প্রশ্ন, Gate)
**Done When (Gate):** SPIKE-LOG পূর্ণ; Go/Adjust/Stop সিদ্ধান্ত লিখিত; **মালিকের স্বাক্ষর** — তার আগে Phase 3 শুরু নয়। Spike-এ যে প্ল্যান-ত্রুটি মিলবে তা `DECISIONS.md`-এ লিখে spec সংশোধন (Adjust হলে আগে Revision 8)।

## PHASE 3 — Frontend Foundation

### Step 3.1 — Core Infrastructure
> **Release: R1**
> ভাষা-অবকাঠামো (i18n init, `I18nProvider`, RTL) এই ধাপ ছুঁয়ে Step 3.7-এ পূর্ণ হয়; তার আগে কোনো page-এ literal বাংলা/ইংরেজি লেখা নয়।
`api/axios.js`, `store/authStore.js`, `store/institutionStore.js` (`loadBootstrap`), `store/uiStore.js`, `hooks/useTerms.js`, `hooks/useModules.js`, i18n (`bn`, `en`), router (central host route: Landing, Signup, Super Admin; tenant host route: login + role group), `ProtectedRoute`।
**Spec Reference:** `docs/templates/react-core-files.md`, `docs/architecture/zustand-stores.md`, `docs/architecture/redis-cache-strategy.md` (React Query অংশ), `docs/architecture/system-design-patterns.md` (i18n)
**Done When:** `http://alokito-coaching.lvh.me:5173` লোড হলে `/bootstrap` একবার call হয় এবং store ভরে; `admin.lvh.me`-এ `isCentral = true`।

### Step 3.2 — Theme System
> **Release: R1**
`theme/ThemeProvider.jsx`, `theme/tokens.css`, `theme/fonts.js`, `tailwind.config.js`।
**Spec Reference:** `docs/THEMING.md`
**Tests:** `ThemeProvider.test.jsx`
**Done When:** তিনটি demo tenant তিনটি ভিন্ন রঙ, font ও radius-এ দেখায়; reload-এ default নীল ঝলকায় না।

### Step 3.3 — Layouts & Navigation
> **Release: R1**
`layouts/registry.js`, `AppShell.jsx`, চারটি layout, `layouts/parts/*`, `nav/menu.js` (সব role-এর পূর্ণ menu — item তালিকা `docs/AUTHORIZATION.md` ও `docs/modules/panels-and-features.md` থেকে)।
**Spec Reference:** `docs/THEMING.md` (Layout Contract), `docs/design/user-journeys.md` (route structure)
**Tests:** `layouts.test.jsx`, `buildNav.test.js`
**Done When:** একটি খালি Dashboard page চারটি layout-এই (DB-তে `layout_key` বদলে) সঠিক দেখায় — desktop ও 360px মোবাইলে; coaching tenant-এ "কোর্সসমূহ/ব্যাচসমূহ", school-এ "শ্রেণিসমূহ/শাখাসমূহ" মেনু।

### Step 3.4 — Shared Components
> **Release: R1**
`DataTable`, `StatCard`, `Card`, `ConfirmModal`, `FileUpload`, `DateRangePicker`, `PrintButton`, `ExportButton`, `Toast`, `EmptyState`, `Loader`, `Can`, `StatusBadge`, `PageHeader`, `NotificationBell`, form field গুলো — সব token class দিয়ে।
**Spec Reference:** `docs/design/component-library.md`, `docs/templates/react-core-files.md`, `docs/THEMING.md` (class রূপান্তর টেবিল)
**Done When:** `/dev/components` (dev-only route)-এ সব component render হয়; theme বদলালে প্রতিটি বদলায়; CI-র দুই grep script খালি।

### Step 3.5 — Auth Pages
> **Release: R1**
`Login` (তিনটি template), `ForgotPassword`, `ResetPassword` (email ও OTP), `ChangePassword`, 2FA ধাপ।
**Spec Reference:** `docs/templates/react-page-examples.md` (`Login.jsx`), `docs/AUTHORIZATION.md`, `docs/THEMING.md` (Login Templates)
**Done When:** তিনটি demo tenant-এ নিজ নিজ identifier দিয়ে login → role অনুযায়ী dashboard; login পেজে প্রতিষ্ঠানের লোগো/রঙ।

### Step 3.6 — UI Pack Runtime (পর্যায় A, D29)
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.3.6
`ui/UIProvider`, `useUI`, `PageSlot`, `ui/variants/{Tabs,Modal,StatCard,List}` (প্রতিটির সব variant-এর *default* সহ — কারণ variant-গুলো ছোট), `ui/packs.js` registry, `classic` pack manifest, `config/ui_packs.php`, `ThemeService::packFor/assertCompatible`, `PUT /admin/theme/pack`, `ThemeEditor`-এ "UI Pack" বাছাই, `PackContractTest` harness (ফিক্সচার-সহ), `lint:theme`-এ `pack-leak`। এরপর প্রতিটি নতুন পাতা `hook + PageSlot` আকারে (`docs/UI-PACKS.md` §৪)।
**Spec Reference:** `docs/UI-PACKS.md` (সম্পূর্ণ), `docs/THEMING.md`
**Tests:** `PackContractTest`, `PackRegistryTest`, `ThemePackCompatTest`
**Done When:** `classic` pack-এ সব পাতা আগের মতো চলে; অজানা `ui_pack` মানে `classic` (ফাঁকা পাতা নয়); একটি পরীক্ষামূলক pack (`test-fixture`, শুধু test-এ) একটি view ও একটি variant override করে এবং `PackContractTest` তার `data-action` অসম্পূর্ণ হলে ব্যর্থ হয়; `layout`-অসঙ্গত pack বাছলে 422।

### Step 3.7 — Languages & RTL Foundation (D30)
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.3.7
`i18n/{index,locales,format}.js`, `bn.json`/`en.json` (+ ফাঁকা `ar.json` কাঠামো), `I18nProvider` (`<html lang dir data-locale>`), `LanguageSwitcher` (layout `parts/`), `DirIcon`, `components/bidi/{PlainText,Ltr}`, `tokens.css`-এর `--font-body-chosen`/`--font-ar` ও `[data-locale='ar']`; backend: `config/i18n.php`, `SetLocale` middleware, `lang/{bn,en,ar}/`, `users.locale`, `PUT /auth/locale`, `/bootstrap`-এ `locales`, `institutions.settings.locales/default_locale`, `Settings → ভাষা`; SMS: `SmsSegments`, segment-ভিত্তিক charge, `sms_logs.segments/encoding`; `lint:theme`-এর `physical-direction` ও `directional-icon`। **আরবি UI-লেখা এই ধাপে ফাঁকা থাকতে পারে (fallback চলে)** — কাঠামো ও RTL আয়না এখনই।
**Spec Reference:** `docs/I18N.md` (সম্পূর্ণ), `docs/THEMING.md` (Layout Contract), `docs/UI-PACKS.md`
**Tests:** `I18nParityTest`, `TermsFallbackTest`, `LocaleResolutionTest`, `ApiMessageLocaleTest`, `SmsSegmentsTest`, `SmsLocaleTest`, `LanguageSettingsTest`, `RtlComponentTest`, `I18nProviderTest`
**Done When:** `docs/I18N.md` §১৪ "Done When (Step 3.7)": বাংলা↔ইংরেজি reload ছাড়া বদলায়, `lang/dir` ঠিক, `Accept-Language` যায়, `users.locale` সংরক্ষিত; মাদ্রাসা demo tenant-এ আরবি চালু করলে তিন থিমে `AppShell` আয়না হয় ও `lint:theme` ০ লঙ্ঘন।

### Step 3.8 — E2E, Visual & a11y Harness (Playwright)
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.3.8
`playwright.config.js`, তিন tenant × `bn`/`ar` × মোবাইল/ডেস্কটপ = ১২ প্রজেক্ট, `e2e:reset` কমান্ড (শুধু testing), `data-testid` চুক্তি (`app-nav`, `app-topbar`, `language-switcher`, `page-header`), axe, স্ক্রিনশট-baseline-নীতি, CI job; Smoke F1, F2, F5, F12।
**Spec Reference:** `docs/E2E-TESTING.md` (সম্পূর্ণ), `docs/THEMING.md`, `docs/UI-PACKS.md`, `docs/I18N.md`
**Done When:** `docs/E2E-TESTING.md` §৭ — ১২-কম্বিনেশনে লগইন-পাতা baseline সবুজ; axe serious/critical ০; ইচ্ছাকৃত RTL-ভাঙা ও কনট্রাস্ট-ভাঙায় পরীক্ষা ব্যর্থ।
**পর্যায় C (Step 6.5) এই ধাপের পরে।**

---

## PHASE 4 — Core Modules (MVP, Vertical Slices)

প্রতিটি Step = backend (Controller + FormRequest + Resource + test) **এবং** frontend page, একসাথে। প্রতিটি Step শেষে school, coaching ও private_batch demo tenant-এ হাতে চালান।

### Step 4.1 — Programs & Batches UI
> **Release: R1**
`/admin/academic/programs`, `/admin/batches`, `/admin/batches/:id`।
**Spec Reference:** `docs/modules/academic-structure.md`, `docs/modules/panels-and-features.md` (Revision 6)
**Done When:** private_batch tenant-এ Program field দেখা যায় না, batch তৈরিতে default program বসে; school-এ Class → Section।

### Step 4.2 — Students & Enrollment
> **Release: R1**
**সম্মতি (D27):** ভর্তির ফর্মে অভিভাবকের সম্মতি অংশ, Student profile "সম্মতি" ট্যাব, `ConsentService`, `GET /students/{id}/consent-form.pdf` (`docs/legal/privacy-and-consent.md` §3)।
Student CRUD, profile (Enrollments tab), student ID auto-generation, দ্রুত ভর্তি form, Excel bulk import (import-ও `EnrollmentService` দিয়ে)।
**Spec Reference:** `docs/modules/fees-advanced.md` (ID generation), `docs/modules/data-migration.md` (R1: `kind=students` — endpoint, dry-run, rollback), `docs/modules/student-import.md` (শুধু সারি-যাচাই ও টেমপ্লেট; তার endpoint বাতিল), `docs/modules/coaching-private-batch.md` (Multi-Batch UX), `docs/templates/react-page-examples.md` (`StudentList.jsx`)
**Tests:** `StudentImportTest`, `PerInstitutionUniqueTest`, `ConsentTest`
**Done When:** coaching-এ এক student দুই batch-এ ভর্তি; school-এ দ্বিতীয় ভর্তিতে স্পষ্ট error; plan-এর `max_students` পেরোলে 403 `student_limit_reached`।

### Step 4.3 — Attendance
> **Release: R1**
Batch + date ভিত্তিক attendance, absent SMS, মাসিক report।
**Spec Reference:** `docs/modules/academic-structure.md` (Attendance), `docs/templates/laravel-core-files.md` (`AttendanceService`), `docs/templates/react-page-examples.md` (`Attendance.jsx`)
**Tests:** `BatchAttendanceTest`, `AttendanceServiceTest`
**Done When:** coaching student একই দিনে দুই batch-এ আলাদা status পায়।

### Step 4.4 — Fees
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.4.4
Fee category, fee structure, due generation (enrollment প্রতি), collection, receipt PDF + QR, due list, reminder SMS, waiver/discount/late fee, expense।
**Spec Reference:** `docs/modules/academic-structure.md` (Fee Resolution), `docs/modules/fees-advanced.md`, `docs/templates/laravel-core-files.md` (`FeeService` — **"Revision 6.2 FeeService Methods" authoritative**: due গণনা, এক receipt একাধিক line), `docs/modules/extended-features.md` #10 (QR), `docs/templates/react-page-examples.md` (`FeeCollection.jsx`)
**Tests:** `FeeServiceTest`, `FeeResolutionTest`, `FeeCollectionTest`
**Done When:** দুই batch-এর student-এর এক receipt-এ দুই line; `fee_override` কার্যকর; receipt PDF-এ প্রতিষ্ঠানের লোগো ও রঙ, QR-এ `primaryUrl()`।

### Step 4.5 — Exams & Results
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.4.5
Exam (program বা batch) + **`exam_subjects`** (বিষয়ভিত্তিক তারিখ-সময়, পূর্ণমান/পাসমান, ঐচ্ছিক component), mark entry (শতকরা-ভিত্তিক গ্রেড, backend-only), bulk Excel upload, GPA marksheet (শুধু `use_gpa`), merit list, result publish + SMS।
**Spec Reference:** `docs/modules/grading.md` (**"Revision 6.3 ResultService" authoritative**), `docs/modules/extended-features.md` #1, `docs/modules/report-cards.md`, `docs/modules/academic-structure.md` (Exams), `docs/modules/coaching-private-batch.md` (Merit List)
**Tests:** `ResultScoringTest` (২৫ নম্বরের টেস্টে ২০ = ৮০% → A+; component-এ একটির পাসমান না পেলে মোট যতই হোক F; absent; পূর্ণমানের বেশি → 422; একই (exam, student, subject) দুবার সেভ → একটি row), `ExamSubjectsTest` (exam তৈরিতে সব subject স্বয়ংক্রিয়; admit card সময়সূচি ছাড়া 422)
**Done When:** school-এ GPA marksheet PDF (৭০+৩০ component-সহ একটি বিষয়ে); coaching-এ ২৫ নম্বরের সাপ্তাহিক টেস্টের rank সহ merit list; admit card-এ বিষয়ভিত্তিক তারিখ-সময়।

### Step 4.6 — Notifications & SMS
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.4.6
In-app notification, SMS (SSL Wireless) queue-তে, template (terminology সহ), SMS log, quota + credit নিয়ম, notice board। **Sender ID:** `SmsService::senderFor()/compose()` (নিজস্ব approved ID, নইলে platform default + নামের suffix), একবার-fallback, `/admin/settings/sms` পেজ। Template-এ হাতে লেখা `-{institution}` suffix নেই।
**Spec Reference:** `docs/modules/notifications.md` (Sender ID সহ), `docs/templates/laravel-core-files.md` (`NotificationService`), `docs/modules/coaching-private-batch.md` (SMS Credits)
**Tests:** `SmsCreditTest`, `SmsSenderResolutionTest`
**Done When:** sandbox/log driver-এ SMS queue হয়ে `sms_logs`-এ যায়; quota শেষে credit থেকে কাটে; প্রতিষ্ঠানের `approved` sender থাকলে `sms_logs.sender_id` সেটি ও message-এ নামের suffix নেই, না থাকলে default sender ও suffix আছে; নিজস্ব sender-এ gateway ব্যর্থ হলে default দিয়ে একবার retry (`fallback_used=1`)।

### Step 4.7 — Dashboards & Role Panels
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.4.7
Admin, Teacher, Accountant, Student, Parent dashboard ও তাদের core page (নিজের routine/attendance/result/fee দেখা)। private_batch-এর Home tab।
**Spec Reference:** `docs/modules/panels-and-features.md`, `docs/design/user-journeys.md`, `docs/templates/react-page-examples.md` (`Dashboard.jsx`), `docs/modules/coaching-private-batch.md` (Lite Mode)
**Done When:** প্রতিটি role দিয়ে login করে প্রতিটি menu item খোলে (কোনো 404 নয়); tutor demo-তে ৫-tab bottom bar।

### Step 4.8 — Core PDF & Reports
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.4.8
Receipt, marksheet, ID card (bulk), student list Excel, collection report, due report।
**Spec Reference:** `docs/modules/pdf-reports.md`, `docs/modules/extended-features.md` #13
**Done When:** প্রতিটি PDF endpoint আসল PDF দেয়; label terminology অনুযায়ী।

**MVP Checkpoint:** তিনটি demo tenant-এ ভর্তি → attendance → fee collection → exam → result SMS পুরো পথ হাতে চালান। `TenantIsolationTest` পাস। এখানে থেমে পর্যালোচনার জন্য জানান।

---

## PHASE 5 — SaaS Layer

### Step 5.1 — Signup & Onboarding
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.5.1
Central host-এ Landing + Signup (type নির্বাচন, slug check), `OnboardingService`, type-ভিত্তিক wizard, trial শুরু।
**Release 1 সংযোজন:** `SIGNUP_MODE=invite|open` (`.env`, নতুন টেবিল নয়)। `invite`: signup-এর জন্য `SIGNUP_INVITE_CODES` (কমা-দিয়ে) থেকে কোড লাগে, ভুল কোডে 403 `signup_closed`; `open`: যে কেউ। ডিফল্ট `invite`। বন্ধ-beta থেকে প্রকাশ্য — শুধু `.env` বদল (`docs/RELEASE-1.md` §৬)। পরীক্ষা: `SignupModeTest`।
**Spec Reference:** `docs/modules/onboarding.md` (Revision 6 সহ), `docs/modules/subscription.md`, `docs/architecture/system-design-patterns.md` (welcome mail)
**Done When:** চার type-এর প্রতিটিতে signup → নিজ subdomain-এ login → wizard → dashboard; default Program/Batch ও preset type অনুযায়ী।

### Step 5.2 — Subscription & Billing (প্রতিষ্ঠান → প্ল্যাটফর্ম)
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.5.2
Plan তালিকা (type অনুযায়ী), **SSLCommerz দিয়ে প্ল্যাটফর্মের subscription payment** (প্ল্যাটফর্মের নিজস্ব credential), invoice PDF, lifecycle scheduler (reminder, grace, suspend), upgrade/downgrade, SMS credit কেনা।
**Spec Reference:** `docs/modules/payment-gateways.md` (শুধু SSLCommerz Subscription অংশ), `docs/modules/subscription.md`
**Tests:** `SubscriptionLimitTest`
**Done When:** sandbox-এ subscription payment → মেয়াদ বাড়ে + invoice + status `active`; মেয়াদ শেষ → grace → suspended, কিন্তু suspended admin তখনও login ও পেমেন্ট করে আবার চালু করতে পারে; callback central domain-এ ফিরে tenant-এর primary URL-এ redirect।

### Step 5.2b — Online Fee Payment, Payout & Settlement (অভিভাবক → প্রতিষ্ঠান)
> **Release: R2**
**Registry-ভিত্তিক (D24):** `config/payments.php` `gateways` registry + `GatewayRegistry`, `PaymentRouter`, flow-aware `GatewayInterface` + `BkashGateway` + `SslCommerzGateway` (credential method argument হিসেবে), `OnlinePaymentService` (`initiate`/`finalize`/`resolveReview`; ২০ অক্ষরের `gateway_ref`; টাকা কাটলে কখনো `failed` নয় → `review`), callback controllers (central host) + generic `/fees/payment/{gateway}/notify`, React `PaymentFlow` + `QrPaymentPanel` ও registry-চালিত Settings ফর্ম, dev/test-only `FakeQrGateway`, `ReconcileOnlinePayments` job, `FeeService`-এর Revision 6.2 methods (যদি Step 4.4-এ না হয়ে থাকে), প্রতিষ্ঠানের `/admin/settings/payments` (gateway credential + test + payout account), Super Admin-এর payout-account verify, settlement (generate/approve/pay) ও liability report, অভিভাবকের Pay UI।
**Spec Reference:** `docs/modules/online-fee-payment.md` (সম্পূর্ণ — mode, code, endpoint, security, test, Done When), `docs/modules/banglaqr-readiness.md` (Part E: এখন যা বানাতে হবে), `docs/modules/payment-gateways.md` (bKash/SSLCommerz API আচরণ), `docs/templates/laravel-core-files.md` ("Revision 6.2 FeeService Methods")
**Tests:** `PaymentRouterTest`, `GatewayRegistryTest`, `OnlinePaymentInitiateTest`, `OnlinePaymentFinalizeTest`, `ReviewFlowTest`, `ModeStabilityTest`, `FeeSplitTest`, `NotifyEndpointTest`, `QrFlowTest`, `RegistryExtensibilityTest`, `SettlementTest`, `CredentialSecurityTest`, `ReconcileTest`, `GatewayContractTest`
**Done When:** `online-fee-payment.md`-এর "Done When" তালিকার সব ক'টি। **আসল টাকা নিয়ে কখনো পরীক্ষা নয়** — শুধু gateway sandbox।
**Note:** `PLATFORM_COLLECT_ENABLED` default `false` রাখুন; platform-mode পরীক্ষা `.env.testing`-এ `true` দিয়ে। Production চালুর সিদ্ধান্ত মালিকের (`PRODUCT.md` → Owner Actions)।

### Step 5.3 — Super Admin Panel
> **Release: R1** — scope notes: `docs/release/r1-scope.json` → step_scope_notes.5.3
Dashboard, Institutions (type filter, type বদল, module override, suspend/extend, SMS credit, platform-collect toggle ও fee %), Plans, Billing, Reports, Settings, **SMS sender ID approval queue**, **payout-account verify**, **settlements**, Dashboard-এর "প্রতিষ্ঠানের পাওনা (unsettled)" ও "Sender ID সমস্যা" কার্ড।
**Spec Reference:** `docs/modules/panels-and-features.md` (Super Admin detailed pages + Revision 6), `docs/business/saas-metrics.md`
**Done When:** `admin.lvh.me`-এ শুধু super_admin login করতে পারে; module override দিলে সেই tenant-এর menu সঙ্গে সঙ্গে (cache invalidation) বদলায়।

### Step 5.4 — Theme Editor, Presets & Pack Variants (পর্যায় B)
> **Release: R2**
**UI Pack:** `fresh` (`tabs=pill`, `stat_card=bubble`) ও `mobile` (`modal=sheet`, `stat_card=compact`, `list=cards`) এর *component variant* যাচাই-সহ; `PackContractTest` সবুজ। (page view = পর্যায় C, Step 6.5।)

`ThemeEditor` + live preview, `/admin/settings/appearance`, Super Admin-এর per-institution theme ও `/super-admin/theme-presets`, audit history, plan gating।
**Spec Reference:** `docs/THEMING.md`, `docs/modules/institution-branding.md`
**Tests:** `ThemeGatingTest`
**Done When:** Admin একটি preset প্রয়োগ করলে পুরো app-এর layout ও style বদলায়; Basic plan-এ token বদলাতে গেলে upgrade modal; Super Admin নতুন preset বানালে সেটি tenant-দের তালিকায় আসে।

### Step 5.5 — Custom Domain
> **Release: R2**
`institution_domains` flow, `DomainService`, jobs, `tls-check`, `/admin/settings/domain`, `/super-admin/domains`, Help নির্দেশিকা (Part D)।
**Spec Reference:** `docs/modules/custom-domain.md` (সম্পূর্ণ)
**Tests:** Part G-র সাতটি test class
**Done When:** Part G "Done When" (staging-নির্ভর দুটি বাদে, যেগুলো Phase 9-এ) পূরণ।

### Step 5.6 — Platform Operations
> **Release: R1.1**
Support Ticket (প্রতিষ্ঠান↔প্ল্যাটফর্ম, SLA, রেটিং), কুপন (percent/fixed/free_days, race-নিরাপদ), কর/VAT (প্যারামেট্রিক, ডিফল্ট ০), `platform_settings`, **impersonation** (টিকিট-grant, read-only, code exchange, `sensitive_scope`) — D34।
**Spec Reference:** `docs/modules/platform-ops.md` §১–§৫, §৭–§৯
**Tests:** `TicketLifecycleTest`, `TicketNumberTest`, `SupportVisibilityTest`, `CouponMathTest`, `CouponRaceTest`, `FreeDaysCouponTest`, `InvoiceTaxTest`, `ImpersonationConsentTest`, `ImpersonationExchangeTest`, `ImpersonationGuardTest`, `ImpersonationNoticeTest`
**Done When:** `platform-ops.md` "Done When" (গ্রহণ-ছাড়া ঢোকা অসম্ভব; payroll route 403 `sensitive_scope`; কুপন+কর হিসাব `refs_r11.py` মেলে)।
(export/import = Step 8.4 — স্কিমা স্থির হওয়ার পর।)

---

## PHASE 6 — Type-Specific Features

### Step 6.1 — Coaching
> **Release: R2**
Leads, batch-teacher pay terms, teacher payouts, merit list SMS।
**Spec Reference:** `docs/modules/coaching-private-batch.md` | **Tests:** `TeacherPayoutTest`

### Step 6.2 — Private Batch Lite Mode Polish
> **Release: R2**
৫-tab প্রবাহ, দ্রুত ভর্তি, এক-ট্যাপ "Paid", "সব বকেয়াকে SMS"।
**Spec Reference:** `docs/modules/coaching-private-batch.md` (Lite Mode)
**Done When:** 360px পর্দায় একজন নতুন ব্যবহারকারী ৩ মিনিটের মধ্যে batch তৈরি → student যোগ → attendance → fee নেওয়া সম্পন্ন করতে পারে।

### Step 6.3 — College
> **Release: R2**
Group-ভিত্তিক Program, optional subject (mark entry ও GPA), board তথ্য, সেশন promotion।
**Spec Reference:** `docs/modules/college.md`, `docs/modules/grading.md`

### Step 6.4 — Public Website & Admission Form
> **Release: R2**
`PublicLayout`, `PublicHome`/`PublicNotices`/`PublicAdmission`, `PublicSiteController`, `PublicAdmissionController`, `PublicShellController` + `routes/public.php` + `bootstrap/app.php` `then:`, Nginx exact-match locations, `BootstrapController` allow-list, `/admin/settings/website`, program/notice "পাবলিক" টগল, private_batch-এ চালুর সময় `leads` স্বয়ংক্রিয় চালু।
**Spec Reference:** `docs/modules/public-website.md` (সম্পূর্ণ)
**Tests:** `PublicAdmissionTest`, `PublicSiteDataTest`, `PublicShellTest`, `BootstrapWhitelistTest`, `PublicSiteFrontendTest`
**Done When:** `public-website.md`-এর "Done When" তালিকা।

### Step 6.5 — UI Pack Page Views (পর্যায় C — শুধু মালিকের অনুমোদনে)
> **Release: R2**
`fresh`: `dashboard`, `students.quickAdd`, `leads.board`; `mobile`: `dashboard`, `students.list`, `students.quickAdd`, `attendance.take`, `fees.collect`। প্রতিটি view আগে hook-এর `actions` চুক্তি মানে (`data-action`), তারপর সাজ।
**Spec Reference:** `docs/UI-PACKS.md` §৩, §৫, §৯ · `themes/theme-02`, `theme-03` (DESIGN/COMPONENTS)
**শুরুর শর্ত:** (১) Spike-এর `S5b` মাপ (একটি view-এর প্রকৃত খরচ), (২) Visual regression/Playwright চালু (`docs/UI-PACKS.md` §১১), (৩) মালিকের লিখিত সিদ্ধান্ত।
**Tests:** `PackContractTest` (pack × slot), দৃশ্যমান স্ক্রিনশট (৩৬০ ও ১২৮০)
**Done When:** প্রতিটি view-তে `actions`-এর প্রতিটির জন্য `data-action`; কীবোর্ডে সব ক্রিয়া; `axe` ০ গুরুতর লঙ্ঘন; ৩৬০px-এ ব্যবহারযোগ্য; বেসলাইন view-র সাথে ফলাফল (API-তে যা যায়) হুবহু এক।

---

### Step 6.6 — Advanced Academics (পূর্ণ-পরিধি, ভাগ ১)
> **Release: R2**
`result_sheets`/`final_results` + `FinalResultService` + Tabulation PDF/Excel; বকেয়া-আটকানো (`DueBlockService`) ও ছাড়; `period_attendances`; `RoutineConflictService`, `routine_blocks`, `substitutions`; `student_leave_requests` (হাজিরা `leave` ও SMS-বাদ সংযোগসহ); নম্বর-এন্ট্রির deadline/lock।
**Spec Reference:** `docs/modules/academics-advanced.md` (সম্পূর্ণ), `docs/modules/grading.md`, `docs/modules/academic-structure.md`
**Tests:** `FinalResultComputeTest`, `ResultSheetLifecycleTest`, `DueBlockTest`, `PeriodAttendanceTest`, `RoutineConflictTest`, `SubstitutionTest`, `StudentLeaveTest`, `MarksLockTest`
**Done When:** `academics-advanced.md` §৯ — ৩০/৩০/৪০ demo (compute→publish→Tabulation PDF); বকেয়া-আটকানো ও exemption; সংঘর্ষ 422; ছুটিতে হাজিরা `leave`; marks lock/আনলক audit-সহ।

---

### Step 6.7 — Finance Advanced: Cash Book & Refunds
> **Release: R3**
দৈনিক ক্যাশবুক (close/reopen, lock), ফি-রিফান্ড (reversal লাইন, মান-ভিত্তিক cap), অনলাইন-রিফান্ড settlement-সমন্বয়, subscription-রিফান্ড। `FeeService` ইতিমধ্যে reversal-ready।
**Spec Reference:** `docs/modules/finance-advanced.md`
**Tests:** `CashBookMathTest`, `CashBookLockTest`, `CashBookSourcesTest`, `CashBookTenancyTest`, `RefundCapTest`, `RefundDueRecalcTest`, `RefundImmutabilityTest`, `RefundSettlementTest`, `SubscriptionRefundTest`
**Done When:** `finance-advanced.md` "Done When"; ক্যাশবুক expected closing `refs_r11.py`-এর সাথে মেলে (৫,০০০ + ১৩,৫০০ − ১১,৫০০ = ৭,০০০; গণনা ৬,৯৮০ ⇒ −২০)।

### Step 6.8 — Data Migration Wizard & Quick Wins
> **Release: R1.1**
আমদানি-উইজার্ড (students, teachers, fee_structure, fee_history, results, attendance; dry-run বাধ্যতামূলক, rollback ৭ দিন); EIIN/প্রতিষ্ঠান-পরিচয়; সনদ/TC-তে QR যাচাই; অ্যাক্সেসিবিলিটি মোড; শিফট।
**Spec Reference:** `docs/modules/data-migration.md`, `docs/modules/quick-wins.md`
**Tests:** `ImportDryRunNoWriteTest`, `ImportIdempotentTest`, `ImportRollbackTest`, `ImportSuppressionTest`, `ImportEncodingTest`, `ImportFeeHistoryTest`, `VerifyCodeTest`, `VerifyPageTest`, `VerifyThrottleTest`, `HighContrastPaletteTest`, `UiPreferencesTest`, `ShiftRoutineTest`
**Done When:** দুই `Done When`-ই; হাই-কনট্রাস্ট ≥ ৭:১ (Classic Blue 7.15, Modern Mint 7.10, Tutor Lite 7.11)।

### Step 6.9 — Admission Cycle & Public Website Plus
> **Release: R2**
ভর্তি-চক্র (মেধা/যাচাইযোগ্য লটারি/অপেক্ষমাণ-উত্তরণ), পাবলিক সাইট প্লাস (গ্যালারি, নিউজ/পেজ, শিক্ষক-প্রোফাইল, ইভেন্ট, অনলাইন আবেদন-ফি — `online_payments.purpose`)। D37।
**Spec Reference:** `docs/modules/admission-cycle.md`, `docs/modules/public-website-plus.md`, `docs/modules/online-fee-payment.md`
**Tests:** `CommitmentTest`, `DrawReproducibleTest`, `DrawFairnessTest`, `FreezeTest`, `SeedLossFallbackTest`, `MeritTieBreakTest`, `WaitingPromotionTest`, `CycleStateMachineTest`, `PublicStatusPrivacyTest`, `ApplicationNoTest`, `AdmissionFeeFlowTest`, `AdmissionFeeFinalizeTest`, `AdmissionFeeRateLimitTest`, `GalleryConsentTest`, `MarkdownSanitizeTest`, `PublicNoStudentDataTest`
**Done When:** দুই `Done When`-ই; লটারিতে পাবলিক যাচাই-স্ক্রিপ্ট একই ক্রম দেয়।

---

## PHASE 7 — Extended Modules
প্রতিটি module স্বতন্ত্র; নিচের ক্রমে বানান। প্রতিটির route-এ `module:<key>` middleware, menu item-এ `module`, এবং কোনো student-নির্বাচন থাকলে enrollment scope।

| Order | Module (`module` key) | Spec File |
|---|---|---|
| 1 | Academic Calendar, Holidays, Seat Plan (`academic_calendar`) | `docs/modules/academic-calendar.md` |
| 2 | Routine Builder (`routine`), Teacher-Subject Matrix | `docs/modules/routine.md`, `docs/modules/teacher-subjects.md` |
| 3 | Homework + Submission (`homework`) | `docs/modules/extended-features.md` #3 |
| 4 | Promotion & TC, Session Management (`promotion_tc`) | `docs/modules/promotion-tc.md`, `docs/modules/academic-sessions.md` |
| 5 | Admit Card (`admit_card`), Progress Report | `docs/modules/advanced-features.md` #7, `docs/modules/report-cards.md` |
| 6 | Staff, **Salary & Payroll** (ইনক্রিমেন্ট/ডিক্রিমেন্ট, বোনাস, অগ্রিম, payslip, PF), Leave, Teacher/Staff Attendance (`hr_payroll`) | `docs/modules/staff-payroll.md` (বেতন) · `docs/modules/hr-payroll.md` (শুধু ছুটি) |
| 7 | Fee Installment (`fee_installment`) | `docs/modules/extended-features.md` #2 |
| 8 | Online Exam / Quiz (`online_quiz`) | `docs/modules/extended-features.md` #4 |
| 9 | Online Class (`online_class`) | `docs/modules/online-class.md` |
| 10 | Library, Transport, Hostel | `docs/modules/library.md`, `docs/modules/transport.md`, `docs/modules/hostel.md` |
| 11 | Behavior, Health, Certificates, Visitors, Parent Meeting | `docs/modules/extended-features.md` #5–8, #14 |
| 12 | Scholarships, Events, Alumni, CPD | `docs/modules/advanced-features.md` #8–10, `docs/modules/extended-features.md` #16 |
| 13 | WhatsApp, 2FA, Rate Limiting, Multi-Branch | `docs/modules/extended-features.md` #9, #17–18 |
| 14 | Analytics Dashboard, Full Data Export | `docs/modules/advanced-features.md` #2, #6 |
| 15 | Store / Inventory (`inventory`, plan-gated) | `docs/modules/inventory.md` |
| 16 | Attendance Devices (`attendance_devices`, plan-gated) | `docs/modules/attendance-devices.md` |
| 17 | Accounting (`accounting`, plan-gated) — D36 | `docs/modules/accounting.md` |
| 18 | Donations (`donations`, **opt-in**) — D39 | `docs/modules/donations.md` |
| 19 | Madrasa Pack: Hifz (`hifz`, **opt-in**), Hijri, alt names, digits, grade labels | `docs/modules/madrasa.md` |
| 20 | Syllabus & Lesson Plans (`syllabus`) | `docs/modules/syllabus.md` |
| 21 | Risk Alerts (`risk_alerts`) | `docs/modules/risk-alerts.md` |
| 22 | Communication Plus: SMS templates/campaigns/emergency, notice acknowledgement | `docs/modules/communication-plus.md` |

`docs/modules/advanced-features.md` #5 (Dark Mode / Theme Customization) আলাদা করে বানাবেন না — এটি Step 3.2-এর `ThemeProvider`-এ অন্তর্ভুক্ত।
**Done When (প্রতিটি সারি):** spec-এর endpoint ও page কাজ করে; type-এ module না থাকলে menu ও route দুটোই বন্ধ; সংশ্লিষ্ট test পাস (`docs/TESTING.md`)।

---

## PHASE 8 — Security Hardening & Privacy
**Privacy (D27):** `StudentErasureService`, `tenant:purge` (ম্যানুয়াল অনুমোদনে), অভিভাবকের তথ্য-রপ্তানি, retention scheduler (`leads:purge`, `sms:trim`, `audit:trim`, `tenants:purge-due`), `INCIDENT-RUNBOOK.md`, একটি প্রতিষ্ঠানের restore মহড়া — `docs/legal/privacy-and-consent.md` §4–7। `/privacy`, `/terms` পাতা (আইনজীবীর যাচাইকৃত পাঠ)।
**Step 8.5 — Load & scale test (R14):** *(Release: R1 — before `SIGNUP_MODE=open`)* `python3 infra/scripts/perf-check.py` (SCALE=1) on target-like hardware; then concurrent load (`k6`/`ab`) on `GET /students`, `POST /attendance`, `POST /fees/collect` at the PEAK-hour profile; record in `docs/SPIKE-LOG.md`/`docs/PROGRESS.md`; fill the scaling triggers in `docs/ops/performance-benchmarks.md` §৩ with measured values.
**Spec Reference:** `docs/ops/performance-benchmarks.md` (Revision 14) · **Done When:** no FULLSCAN/SORT/SLOW at SCALE=1; p95 < 500 ms at the measured peak; triggers replaced by measured numbers.

**Step 8.4 — Tenant Export / Import (D38):** *(Release: R1.1)* `tenant:export`, `tenant:import --new-slug`, `tenant_exports`, restore-runbook ও restore-drill; `docs/database/tenant-export-map.json` স্কিমার সাথে তাজা (`python3 infra/spec-verify/tenant_export_ref.py . --check`); round-trip ও backup-এ বেতন-গ্রুপ বাদ।
**Spec Reference:** `docs/modules/platform-ops.md` §৬ · **Tests:** `TenantRoundTripTest`, `ExportMapFreshTest`, `ExportSecretsTest`, `ExportAccessTest`, `ImportSafetyTest`
**Done When:** আসল MySQL-এ একটি demo প্রতিষ্ঠান export → নতুন slug-এ import → সারি-সংখ্যা ও সম্পর্ক মেলে; secrets আসেনি; `backup`-এ payroll নেই।
**Spec Reference:** `docs/SECURITY.md`, `docs/ops/security-checklist.md`
**Done When:** checklist-এর প্রতিটি আইটেম code-এ যাচাই করা; permission matrix-এর প্রতিটি সারির জন্য একটি করে 403 test; `TenantIsolationTest` সব tenant-scoped endpoint ঢাকে।

## PHASE 9 — Deployment
| Step | What | Spec |
|---|---|---|
| 9.1 | Docker (local/staging) | `docs/ops/docker-setup.md` (Revision 6 note সহ) |
| 9.2 | Server: Nginx internal + Caddy edge + platform DNS | `docs/ops/deployment-plan.md`, `infra/nginx.conf`, `infra/Caddyfile`, `docs/modules/custom-domain.md` Part C |
| 9.3 | CI/CD | `infra/github-actions-cicd.yml` |
| 9.4 | Backup, monitoring, performance | `docs/ops/deployment-plan.md`, `docs/ops/performance-benchmarks.md` |

**Done When:** `main`-এ push → test → build → deploy; `docs/modules/custom-domain.md` Part C5-এর পাঁচটি smoke test ও Part G-র সম্পূর্ণ Done When পূরণ; একটি বাস্তব custom domain-এ বৈধ certificate সহ login।

## PHASE 10 — Later (Only When Asked)
**10.0 Bangla QR integration** (ব্যাংকের API পেলে; প্রকল্প শেষে): `docs/modules/banglaqr-readiness.md` Part B (প্রশ্ন) → Part C (adapter + registry entry + `.env` + sandbox পরীক্ষা + pilot rollout)। কোনো migration/route/UI বদল ছাড়া — তা লাগলে 5.2b-র seam অসম্পূর্ণ ছিল।

React Native app (`docs/modules/mobile-app.md`), Firebase push, AI Assistant, Bus GPS, PWA, Zoom auto-create (`docs/modules/advanced-features.md` #1, #3, #4)।

---

## Quick Lookup — "I Want to Build X, Which File Do I Read?"
| I want to build… | Read |
|---|---|
| যেকোনো DB table | `docs/database/schema.sql` |
| যেকোনো endpoint-এর URL | `docs/API.md` |
| কোন type-এ কী চালু, কোন শব্দ | `docs/modules/institution-types.md` |
| Class/Course/Batch/ভর্তি সংক্রান্ত যেকোনো কিছু | `docs/modules/academic-structure.md` |
| রঙ, layout, font, login চেহারা | `docs/THEMING.md` |
| Subdomain, custom domain, SSL | `docs/modules/custom-domain.md` |
| অভিভাবকের অনলাইন ফি, payout, settlement | `docs/modules/online-fee-payment.md` |
| নতুন gateway / Bangla QR যোগ | `docs/modules/banglaqr-readiness.md` |
| SMS sender / masking ID | `docs/modules/notifications.md` |
| পাবলিক সাইট, ভর্তি-আবেদন, SEO | `docs/modules/public-website.md` |
| কোনো page-এ কী ফিচার | `docs/modules/panels-and-features.md` |
| User flow | `docs/design/user-journeys.md` |
| Service-এর ভেতরের logic | `docs/templates/laravel-core-files.md`, তারপর `docs/modules/` |
| React component code | `docs/templates/react-core-files.md`, `react-page-examples.md` |
| PDF | `docs/modules/pdf-reports.md` |
| SMS/Push/WhatsApp | `docs/modules/notifications.md` |
| Payment | `docs/modules/payment-gateways.md` |
| Plan, trial, limit | `docs/modules/subscription.md` |
| Test | `docs/TESTING.md` |
| General pattern | `docs/architecture/backend-pattern.md`, `docs/architecture/system-design-patterns.md` |
