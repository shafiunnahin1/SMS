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
- [ ] 1.1 — Migrations
- [ ] 1.2 — Models
- [ ] 1.3 — Seeders
- [ ] 2.1 — Tenancy
- [ ] 2.2 — Institution Types, Module Gate, Terminology
- [ ] 2.3 — Authentication
- [ ] 2.4 — Theme Service + Bootstrap Endpoint
- [ ] 2.5 — Programs, Batches, Enrollment
- [ ] 2.6 — Shared Services
- [ ] 2.7 — Routes Skeleton
- [ ] S — Walking-skeleton Spike and Gate (D28)
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
