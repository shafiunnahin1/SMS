# Progress (agent-maintained)

Rules (checked by `infra/guard/agent_guard.py`, C9/C10): one task per commit, in plan order; flip ONLY your own task from `[ ]` to `[x]` in the same commit as the code; NEVER delete or un-check a line; 
a task is `[x]` only when EVERY command of its Done When / verify list ran green - write the evidence after the dashes. If you could not run something, leave `[ ]` and say why in `docs/BLOCKED.md`.

Line format:  `- [x] <task-id> — <commit-sha> — <tests added / run> — <evidence: command and result>`


## Milestone acceptance (decision D45 - ALL of these must be [x] before the public launch; the guard checks them for `Release: FULL`)

- [ ] M1.A — ভিত্তি ও চারটি অপরিহার্য ফিচার (release R1): owner-signed acceptance
- [ ] M2.A — প্রথম সংস্করণের পরপর: নোটিশ, খরচ, রুটিন, ID কার্ড, সহায়তা (release R1.1): owner-signed acceptance
- [ ] M3.A — প্রতিষ্ঠান-গভীরতা: ফল, ভর্তি, অনলাইন-পেমেন্ট, ওয়েবসাইট, একাডেমিক-উন্নত (release R2): owner-signed acceptance
- [ ] M4.A — টাকা ও মানুষ: ক্যাশবুক, বেতন, হিসাব-খাত, ইনভেন্টরি, দান (release R3): owner-signed acceptance
- [ ] M5.A — ক্যাম্পাস ও যন্ত্র: লাইব্রেরি, পরিবহন, হোস্টেল, অনলাইন ক্লাস, কার্ড-যন্ত্র (release R4): owner-signed acceptance
- [ ] M6.A — প্ল্যাটফর্ম-ব্যবসা ও বিশ্লেষণ: একাধিক শাখা, অ্যানালিটিক্স (release R5): owner-signed acceptance
- [ ] M7.A — বাহ্যিক সংযোগ: বাংলা QR, Nagad, ব্যাংক-API (বাইরের নথি ছাড়া শুরু করা যায় না) (release R6): owner-signed acceptance
- [ ] M8.A — মোবাইল-অ্যাপ, AI, GPS (release R7): owner-signed acceptance

## Release R1  (`docs/AGENT-PLAN-R1.md`)

- [x] 0.1 — this commit — tests: Laravel default ExampleTests (2) — `php artisan test` 2 passed; `php artisan serve` → GET / 200, GET /up 200; tinker: `config('tenancy.base_domain')` = schoolapp.com, `config('institution_types.coaching.terms.batch.bn')` = ব্যাচ
- [x] 0.2 — this commit — no new tests (scaffold); `php artisan test` 2 passed — Laravel + `vite` running: `curl --resolve demo.lvh.me:5173:127.0.0.1 http://demo.lvh.me:5173/` → 200; `/api/v1/health` through the Vite proxy reached Laravel with Host `demo.lvh.me` (checked with a temporary, uncommitted echo route); a non-`.lvh.me` host → 403
- [x] 0.3 — 76a0801 — no new tests (scaffold) — local: `php artisan test` 2 passed (also with `.env.example` copied to `.env`), `npm test` exit 0 (no tests yet; a throw-away jsdom component test passed), `npm run lint:theme` 0 violations, `npm run build` ok, `node infra/check-schema-parity.mjs` 0 divergences — GitHub CI run #1 (https://github.com/shafiunnahin1/SMS/actions/runs/37514468623, commit c8c9230): jobs "Laravel tests" (PHP 8.2, `php artisan test`), "Frontend tests and theme lint" (`npm test`, `lint:theme`, `build`), "Schema parity" all success
- [x] 1.1 — this commit — no PHP tests (schema verified by scripts) — `php artisan migrate:fresh --seed` ok (MySQL 8.0.46): 31 R1 tables + 5 Laravel tables; `users` has unique (institution_id,email), (institution_id,phone), (institution_id,username); `MYSQL_CMD_STR="mysql -uroot" bash infra/scripts/mysql-smoke.sh` 33 passed 0 failed; `SCHEMA_DIFF_ONLY=docs/release/r1-tables.txt bash infra/scripts/schema-diff.sh edu_saas lms_smoke` → same cols, same idx, same fk; rollback + migrate ok; `php artisan test` 2 passed
- [x] 1.2 — this commit — tests: ModelInventoryTest (62 cases: model per R1 table, tenant trait placement) — `php artisan test` 64 passed; `php artisan migrate:fresh --seed` ok; MySQL smoke script: unbound `Student::count()` throws TenantNotBoundException, cross-tenant create blocked, institution_id immutable, tenant B sees 0 of A's rows, decimal cast "1200.50", every model queries its table
- [x] 1.3 — this commit — no new PHP tests (data seeders) — `php artisan migrate:fresh --seed` ok and `db:seed` again (idempotent): plans=5, theme presets=6, super admins=1, `Hash::check('Admin@1234')` true; plan values compared with docs/database/seeders.md by script: 0 mismatches; `php artisan test` 64 passed
- [x] 2.1 — this commit — tests: TenantResolverTest (6), TenantModeTest (11), TenantFailClosedTest (8), QueueTenantLeakTest (4), TenancyArchitectureTest (5) — `php artisan test --filter=TenantResolverTest|TenantModeTest|TenantFailClosedTest|QueueTenantLeakTest|TenancyArchitectureTest` 34 passed (191 assertions); `php artisan test` 98 passed; a temporary app/LeakProbe.php with `DB::table` made TenancyArchitectureTest fail (then removed); dev DB untouched (tests run on edu_saas_test)
- [x] 2.2 — this commit — tests: ModuleGateTest (8), TerminologyTest (7), ReleaseGateTest (4) — `php artisan test --filter=ModuleGateTest|TerminologyTest|ReleaseGateTest` 19 passed; `php artisan test` 117 passed; mutation checks: removing the type check fails ModuleGateTest, adding a student limit fails the D47 test. Done When adjusted by D47 + release gate (see DECISIONS)
- [x] 2.3 — this commit — tests: LoginIdentifierTest (9), CrossTenantHostTest (2), TokenLifetimeTest (10), PasswordPolicyTest (6), LockoutTest (6), ReleaseRolesTest (3), LocaleTest (3), LoginThrottleTest (1) — `php artisan test --filter=LoginIdentifierTest|CrossTenantHostTest|TokenLifetimeTest|PasswordPolicyTest|LockoutTest|ReleaseRolesTest|LocaleTest` 39 passed (266 assertions); `php artisan test` 157 passed; mutation checks: removing the idle check fails TokenLifetimeTest, skipping the dummy hash fails LockoutTest
- [x] 2.4 — this commit — tests: ThemeResolutionTest (7), BootstrapTest (7), InstitutionSettingsTest (6) — `php artisan test --filter=ThemeResolutionTest` 7 passed; `php artisan test` 177 passed; `php artisan serve` + `curl -H "Host: curlcheck.lvh.me" /api/v1/bootstrap` → is_central false, terms (ব্যাচ), 8 modules, theme with 8 tokens; `Host: admin.lvh.me` → is_central true (temporary institution removed)
- [x] 2.5 — this commit — tests: EnrollmentServiceTest (9), EnrollmentCacheSyncTest (3), OnboardingAndDemoSeedTest (2) — `php artisan test --filter=EnrollmentServiceTest|EnrollmentCacheSyncTest` 12 passed; `php artisan test` 191 passed; `php artisan migrate:fresh --seed` ok: dhanmondi-school (school, Pro, 10 students), alokito-coaching (coaching, 8 students / 11 active enrollments), rahim-sir (private_batch, 5); students↔primary-enrollment cache mismatches = 0 (SQL); demo admin logins work; mutation checks fail both tests
- [x] 2.6 — this commit — tests: SharedServicesTest (9), FeeResolutionTest (9), NotificationAndAuditApiTest (2), TenantBulkGuardTest (4), FileDiskNamesTest (4) — `php artisan test --filter=SharedServicesTest|FeeResolutionTest|NotificationAndAuditApiTest|TenantBulkGuardTest|FileDiskNamesTest` 28 passed; `php artisan test` 219 passed (983 assertions); mutation checks (quota never charges credit, SendSmsJob rethrows quota, notification scope, no proration, no enrollment check, always-pass result) each fail a test
- [x] 2.7 — this commit — tests: RoutesSkeletonTest (4), TenantIsolationTest (3: 8 tenants = 2 of each type; every parameterless tenant GET checked for foreign markers/institution_id; every tenant {id} route must refuse another tenant's row with 404) — `php artisan route:list --path=api/v1` 31 routes, no error; `php artisan route:cache` "Routes cached successfully" (then route:clear); `php artisan serve` + `curl -H "Host: admin.lvh.me" /api/v1/health` and `Host: dhanmondi-school.lvh.me` → 200 {status ok, db ok, redis ok} without a token; `php artisan test` 226 passed (1652 assertions); mutation checks (audit index/show across tenants, an unlisted {id} route, a closure route, force-logout of any user) each fail a test
- [ ] S — Walking-skeleton Spike and Gate (D28)
  - Spike log (draft for `docs/SPIKE-LOG.md`, which only the owner may edit - see DECISIONS 2026-10-06 S). Times UTC, 2026-10-06.
  - S0-S3 — done as Steps 0.1-2.7 before the spike (commits up to dd4d32c); TenantFailClosedTest / TenantModeTest green; demo logins on 3 hosts.
  - Runbook step 0 / S1 / S1b — 20:35-20:45 (0.2 h) — `MYSQL_CMD_STR="mysql -uroot" bash infra/scripts/mysql-smoke.sh` exit 0: 143 tables, 33 passed / 0 failed / 0 skipped (MySQL 8.0.46); `SCHEMA_DIFF_ONLY=docs/release/r1-tables.txt bash infra/scripts/schema-diff.sh edu_saas lms_smoke` exit 0 (cols/idx/fk same, 31 R1 tables); `python3 infra/scripts/perf-check.py --scale 0.1` exit 0: 71 queries, 0 problems, slowest 14.2 ms (retention_sms_trim), 1.1M attendance rows seeded in 24 s (4 vCPU, 15 GB RAM container).
  - S4 — 20:45-21:00 (0.3 h) — tests: WalkingSkeletonSliceTest 4 written / 3 passed on first run (1 test-side expectation wrong: error code name), TenantIsolationTest extended (+3 id routes, students and receipts seeded per tenant); `php artisan test` 230 passed; HTTP on the 3 demo hosts: admit → dues → collect (coaching student in 2 batches: one receipt, 4 lines, 3000.00) → receipt PDF 200 `%PDF`; school parent `01900000001` sees 2 children, own dues/receipts 200, another child 403. Spec defects: 1 (coaching/tutor demo students had no name). Ambiguities: 4 (DECISIONS). Rework: 0 lines of earlier code. Q4: dueLines 8.3 ms and 19 queries per student (IDEAS).
  - S5 — 20:56-21:06 (0.2 h agent time; no human review yet) — frontend: 45 files; `npx vitest run` 11 passed (Loader, menu, layouts, format; first run 10/12 - one test removed as a duplicate of lint:theme, one limit corrected to the spec's 4); `npm run lint:theme` 32 files, 0 violations; `npx vite build` ok; Playwright (Chromium) on the 3 demo hosts at 1280px and 360px: login → dashboard → students → fee collect → receipt: school `sidebar-classic` #185FA5 hind-siliguri radius 0.5rem, coaching #0F766E anek-bangla 0.875rem (sidebar-mini → default until 3.3), tutor `mobile-compact` #7C3AED radius 1.25rem; after reload `--color-primary` is the tenant's at first paint (no blue flash); parent (360px) sees 2 children, dues, English toggle without reload. Spec defects: 1 (menu refunds without since). Ambiguities: 5 (DECISIONS). Rework of earlier code: 0 lines (FeeController +1 field). Q5: no flash on the 3 tenants in Chromium; `color-mix` not yet checked on old WebView (needs a device).
  - S5b — 21:06-21:10 (0.1 h agent time for the frontend part; +backend attendance index/store) — tests: PackContractTest (2 packs × attendance.take × ltr/rtl = 4) + 1 registry test, all green on the first run; WalkingSkeletonSliceTest +1 (attendance); `php artisan test` 232 passed; lint:theme 42 files 0 violations; browser: tutor (preset tutor-lite → pack `mobile`) shows the segmented view at 360px, 5 rows, saved; school (classic) shows the grid, 10 rows, saved. Size: runtime 54 lines, hook 45, default view 46, the alternative view 49, contract test 38. Q8: the hook/view split was natural for this page (the page already had one data source); one alternative view ≈ the size of the default view (~50 lines) and took minutes, but every later change to the hook's actions must touch BOTH views (the contract test catches a missing one). Contract errors caught: 0 (first run green). Rework: 0.
- [ ] 3.1 — Core Infrastructure
- [ ] 3.2 — Theme System
- [ ] 3.3 — Layouts & Navigation
- [ ] 3.4 — Shared Components
- [ ] 3.5 — Auth Pages
- [ ] 3.6 — UI Pack Runtime (পর্যায় A, D29)
- [ ] 3.7 — Languages & RTL Foundation (D30)
- [ ] 3.8 — E2E, Visual & a11y Harness (Playwright)
- [ ] 4.1 — Programs & Batches UI
- [ ] 4.2 — Students & Enrollment
- [ ] 4.3 — Attendance
- [ ] 4.4 — Fees
- [ ] 4.5 — Exams & Results
- [ ] 4.6 — Notifications & SMS
- [ ] 4.7 — Dashboards & Role Panels
- [ ] 4.8 — Core PDF & Reports
- [ ] 5.1 — Signup & Onboarding
- [ ] 5.2 — Subscription & Billing (প্রতিষ্ঠান → প্ল্যাটফর্ম)
- [ ] 5.3 — Super Admin Panel
- [ ] 8.1 — Privacy and children's data (D27)
- [ ] 8.2 — Security hardening
- [ ] 8.5 — Load and scale test (before SIGNUP_MODE=open)
- [ ] 9.1 — Deployment, backup, monitoring
- [ ] A — Release 1 acceptance, then open signup

## Release R3  (`docs/AGENT-PLAN-R3.md`)  — start only after Release 1 is accepted (task `A`)

- [ ] R3.0 — পূর্বশর্ত ও রিলিজ-গেট (R3-এর জন্য)
- [ ] R3.1 — খরচ (expenses) — ক্যাশবুকের পূর্বশর্ত
- [ ] R3.2 — দৈনিক ক্যাশবুক ও day-end close
- [ ] R3.3 — ফি রিফান্ড ও reversal
- [ ] R3.4 — কর্মচারী, উপস্থিতি ও ছুটি
- [ ] R3.5 — বেতন-কাঠামো, ইনক্রিমেন্ট ও বোনাস
- [ ] R3.6 — সমন্বয় (জরিমানা/ওভারটাইম) ও অগ্রিম/ঋণ
- [ ] R3.7 — Payroll run, payslip ও পরিশোধ
- [ ] R3.8 — ভবিষ্য তহবিল (PF), কর ও চূড়ান্ত নিষ্পত্তি
- [ ] R3.9 — স্টোর / ইনভেন্টরি
- [ ] R3.10 — হিসাব-খাত (Accounting) — double-entry
- [ ] R3.11 — দান ও তহবিল (ঐচ্ছিক মডিউল)
- [ ] R3.12 — R3-এর পাতা (ফ্রন্টএন্ড), ভূমিকাভেদে
- [ ] R3.13 — টাকা ও বেতন-তথ্যের নিরাপত্তা — সামগ্রিক যাচাই
- [ ] R3.14 — R3-এর কর্মক্ষমতা (ডেটা বাড়লে)
- [ ] R3.A — R3 গ্রহণ-পরীক্ষা, তারপর চালু
