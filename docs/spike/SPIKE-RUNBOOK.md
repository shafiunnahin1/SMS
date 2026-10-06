# Spike Runbook — প্রথম দিন থেকে Gate পর্যন্ত (Revision 13)

> `docs/spike/SPIKE-READY.md` (চেকলিস্ট) পূরণ হলে এই runbook ধরে চলুন। প্রতিটি ধাপে: **কমান্ড → প্রত্যাশিত ফল → ব্যর্থ হলে কী**। কমান্ডগুলোর অধিকাংশ এই স্পেক-পরিবেশে **চালানো হয়নি** (Docker/PHP/MySQL নেই); যেগুলো চালানো হয়েছে তা পাশে লেখা। প্রত্যাশিত-ফলের সাথে মিললে ঠিক; না মিললে স্পেকের ভুল ধরে `docs/DECISIONS.md`-এ লিখুন, নীরবে এগোবেন না (`AGENTS.md` নিয়ম ৩)।

## ধাপ ০ — আসল MySQL-এ স্কিমা (সবার আগে, ~কয়েক মিনিট)
```bash
python3 infra/spec-verify/verify.py . --deep                         # চালানো হয়েছে: সবুজ (স্পেক নিজের সাথে সংগত)
docker compose -f infra/docker-compose.dev.yml up -d --wait mysql     # MySQL 8.0, utf8mb4_unicode_ci, Laravel-strict sql_mode  [চালানো হয়নি]
bash infra/scripts/mysql-smoke.sh                                     # [চালানো হয়নি; SQLite-ড্রাই-রান: ২৪ পাস, ০ ব্যর্থ]
```
| exit | অর্থ | কী করবেন |
|---|---|---|
| **0** | স্কিমা লোড হল, ৩৩টির সব আচরণ-পরীক্ষা পাস (৯টি MySQL-নির্দিষ্টসহ) | এগিয়ে যান; ফল `docs/SPIKE-LOG.md`-এ |
| **2** | **স্কিমা লোডই হয়নি** — এটি সবচেয়ে মূল্যবান ফল | MySQL-এর ত্রুটি-বার্তা দেখে `docs/database/schema.sql` ঠিক করুন; তারপর `python3 infra/spec-verify/tenant_export_ref.py . --write`, `node infra/check-schema-parity.mjs .`, `verify.py`; আবার চালান |
| **1** | কোনো আচরণ-ধারণা ভুল (যেমন সংরক্ষিত ENUM, collation, TIMESTAMP) | ব্যর্থ পরীক্ষার নাম দেখুন: `...MySQL-only` হলে এতদিন কেউ জানত না — সিদ্ধান্ত লিখুন |
| **3** | পরিবেশ-সমস্যা (Docker চলছে না, পোর্ট) | `docker compose ... ps`; পোর্ট ৩৩০৭ খালি আছে কি |
**পরিচিত সম্ভাব্য ফল (আমার অনুমান, প্রমাণ নয়):** `mysql_lint.py` ৯টি সতর্কতা দেয় — ৮টি `TIMESTAMP` ২০৩৮-সীমা (ধারণা: `institutions.subscription_expires_at` সবচেয়ে প্রাসঙ্গিক) ও `theme_presets.key` (সংরক্ষিত শব্দ, backtick-এ আছে)। MySQL ২০৩৮-সীমা সত্যিই ধরলে `invariants.tsv`-এর "TIMESTAMP after 2038" পরীক্ষা সেটি নিশ্চিত করবে।

## ধাপ S0 — Scaffold (`docs/BUILD-SEQUENCE.md` Step 0.1–0.3)
```bash
composer create-project laravel/laravel api && cd api
composer require laravel/sanctum barryvdh/laravel-dompdf maatwebsite/excel endroid/qr-code
php artisan install:api
cd .. && npm create vite@latest frontend -- --template react        # তারপর Step 0.2-এর npm install তালিকা
mkdir -p frontend/scripts && cp infra/check-theme-rules.mjs frontend/scripts/
```
- `.env`: `DB_HOST=127.0.0.1 DB_PORT=3307 DB_DATABASE=lms DB_USERNAME=root DB_PASSWORD=root`; `REDIS_PORT=6380`; বাকি `docs/architecture/environment-variables.md`।
- **`barryvdh/laravel-dompdf` এখানে শুধু শুরুর পছন্দ** — বাংলা/আরবি PDF-এ উপযুক্ত কি না S5c-তে ঠিক হবে (`docs/I18N.md` §৮)।
- `spatie/laravel-permission` **ইনস্টল করবেন না** (D17)।
- **প্রত্যাশিত:** `php artisan serve` চলে; `http://demo.lvh.me:5173` থেকে `/api/v1/health` 200 (Host header `demo.lvh.me`)। **ব্যর্থ হলে:** `TenantMiddleware` mode ও `allowedHosts: ['.lvh.me']` দেখুন।

## ধাপ S1 — Migration = schema.sql
1. `docs/database/migrations.md`-এর ক্রমে `php artisan make:migration create_*_table`; কলাম `schema.sql` থেকে হুবহু (ENUM ও `unsigned` সহ); ALTER-গুলো মূল `create`-এ মেশান।
2. ```bash
   php artisan migrate:fresh                                                    # DB: lms
   bash infra/scripts/mysql-smoke.sh                                            # DB: lms_smoke (schema.sql থেকে)
   bash infra/scripts/schema-diff.sh lms lms_smoke                              # [চালানো হয়নি] তিনটিই "same"
   ```
3. **Done When:** `schema-diff.sh` exit 0 (কলাম-ধরন, nullability, ডিফল্ট, ইনডেক্স, FK একই)। ব্যর্থ হলে "migrated"-এর দিকের পার্থক্য সাধারণত Laravel-এর `->unsigned()`/`->nullable()` ভুল; `schema.sql` বদলানোর আগে নিশ্চিত হোন ভুল কোন দিকে।

## ধাপ S1b — ডেটা বাড়লে ধীর হয় কি? (S1-এর পরে, ১ ঘণ্টার কাজ)
```bash
python3 infra/scripts/perf-check.py --scale 0.1     # ~১০ লাখ হাজিরা-সারি; [চালানো হয়নি — ড্রাই-রান SQLite-এ সবুজ]
python3 infra/scripts/perf-check.py                 # SCALE=1: ১.১ কোটি হাজিরা, ২০ লাখ SMS/audit
```
- **FULLSCAN/SORT/SLOW** আসা মানে একটি কোয়েরি বড় ডেটায় ভাঙছে: `infra/scripts/hot-queries.tsv`-এ কোয়েরি আছে কি দেখুন, `python3 infra/spec-verify/plan_check.py .` চালান, ইনডেক্স যোগ করুন `schema.sql`-এর R14 অংশে, `verify.py`, তারপর migration।
- আউটপুট `docs/SPIKE-LOG.md`-এ রাখুন (হার্ডওয়্যার সহ)। এই সংখ্যাই `docs/ops/performance-benchmarks.md` §৩-এর ট্রিগার বসাবে।

## ধাপ S4b — ট্রাফিক: পিক-ঘণ্টার লোড (S4 শেষে, যখন হাজিরা ও ফি-আদায় চলে)
```bash
cp infra/loadtest/inputs.example.json infra/loadtest/inputs.json     # আপনার সীড-করা tenant-এর আসল শিক্ষক/ব্যাচ/ছাত্র id বসান
k6 run -e BASE_URL=http://demo.lvh.me:8000/api/v1 -e INPUT=infra/loadtest/inputs.json infra/loadtest/peak-hour.k6.mjs     # [চালানো হয়নি]
```
**সাবধান:** এটি হাজিরা ও ফি-রসিদ **লেখে** — নিঃশেষযোগ্য ডেটাবেসে। লগইনের body-ফিল্ডের নাম বাস্তবের সাথে না মিললে `login()` বদলান। ফল (p95, ব্যর্থতা-হার, কোন scenario ধীর) `docs/SPIKE-LOG.md`-এ; থ্রেশহোল্ড-সংখ্যা স্থানধারক, আপনার ভুক্তভোগী-সীমা অনুযায়ী বদলান।

## ধাপ S2–S8 — Walking skeleton
`docs/spike/walking-skeleton.md`-এর সারণি অনুযায়ী (S2 Tenancy · S3 ModuleGate/auth · S4 Enrollment+Fee+রসিদ · S5 Frontend · **S5b** একটি বিকল্প view · **S5c** PDF engine তুলনা · **S5d** RTL-স্মোক · S6 অভিভাবক+সম্মতি · S7 token-নাকি-cookie · S8 retrospective)। প্রতিটি ধাপ শেষে `docs/SPIKE-LOG.md`-এ এক সারি (কর্ম-ঘণ্টা, পরীক্ষা লেখা/পাস, প্ল্যানে ভুল, অস্পষ্টতা, rework)।
**"rework" কী:** পরের কোনো ধাপে যে কোড বদলাতে/ফেলতে হল — আগের ধাপের স্পেক-ভুল বা নিজের ভুল যেকোনোটির কারণে। গুনুন সারি-সংখ্যায় (`git diff --stat`), অনুভূতিতে নয়।

## থামার শর্ত (আগে থেকে ঠিক করা)
- কোনো একটি ধাপ আগের সবচেয়ে ধীর ধাপের **২ গুণ** হলে থামুন, কারণ লিখুন; Gate আগাম ডাকুন।
- একই ধরনের স্পেক-ভুল ৩ বার (যেমন বারবার schema বনাম মডেল অমিল) ⇒ স্পেক-পর্ব, কোড নয়।
- আসল MySQL-এ `mysql-smoke.sh` exit 2 ⇒ **সব কিছু থামান**, স্কিমা আগে।

## Gate
`SPIKE-READY.md` §ঘ-র সারণি; সিদ্ধান্ত `docs/SPIKE-LOG.md`-এ আপনার স্বাক্ষর ও তারিখসহ। Go হলে: Phase 3 থেকে `docs/BUILD-SEQUENCE.md` ক্রমে। Adjust হলে: কোন স্পেক-অংশ বদলাবে, আর কী ছোট হবে (পরিধি কমানো এখানে বৈধ ও প্রত্যাশিত ফল)। Stop হলে: কেন, কী শিখলাম।
