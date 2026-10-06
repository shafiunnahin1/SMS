# Education Management Platform — Specification (Revision 17, FINAL)

> **চূড়ান্ত সংস্করণ (Revision 17).** এখান থেকে শুরু করুন: **মালিক** → `docs/owner-guide/Release-1-Plan-bn.pdf` (পুরো পরিকল্পনা, বাংলায়, ৩৮ পৃষ্ঠা) · **কোডিং এজেন্ট** → `AGENTS.md`, তারপর `docs/AGENT-PLAN-R1.md` (৩৮ ধাপ, স্বয়ংক্রিয় তৈরি) · **Release 1-এর স্কোপ** → `docs/RELEASE-1.md` · **সব যাচাই** → `python3 infra/spec-verify/verify.py . --deep`। **নিজস্ব-সার্ভারে স্থাপন সংস্করণের ক্লায়েন্ট-PDF (সাবস্ক্রিপশন নয়; খসড়া) → `docs/pricing/`; অভ্যন্তরীণ নথি `docs/SELF-HOSTED.md`।** **ক্লায়েন্টকে দেওয়ার ফিচার ও মূল্য-তালিকা (বাংলা PDF; দাম নমুনা, আপনার অনুমোদন বাকি)** → `docs/pricing/`। **কোডিং-এজেন্টের নিয়ম ও যন্ত্র-পাহারা** → `docs/ops/agent-guardrails.md`, `infra/guard/` (গার্ড: প্রতিটি commit-এ চলে)। **এখনো কোনো কোড লেখা হয়নি;** পরের ধাপ Spike (`docs/spike/SPIKE-RUNBOOK.md`)। সৎ অবস্থা: `docs/reports/VERIFICATION-R17-FINAL.md`।
> **মূল্য-মডেল (D47): আকার-স্তর নেই, যেকোনো একটি মডিউল (সাবস্ক্রিপশন বা কোড নিজের সার্ভারে), সংখ্যা/স্টোরেজের সীমা নেই** → `docs/PRICING-MODEL.md` (স্পেকের সংঘাত; R1-এর ৫.১–৫.২ অবরুদ্ধ)। **সম্পূর্ণ প্রকাশ (D45) — প্রকাশ্য প্রকাশ হবে সব ৫৬ মডিউল নিয়ে; R1 প্রথম মাইলস্টোন:** `docs/RELEASE-FULL.md` (প্রস্তুতি-নিরীক্ষা, ধাপ, ঝুঁকি), `docs/AGENT-PLAN-FULL-DRAFT.md` (বাকি ৪১ মডিউলের খসড়া কাজ)। **Release 3 (টাকা ও মানুষ: ক্যাশবুক, রিফান্ড, কর্মচারী-বেতন, ইনভেন্টরি, হিসাব-খাত, দান):** `docs/RELEASE-3.md` (স্কোপ ও গ্রহণ-শর্ত) · `docs/AGENT-PLAN-R3.md` (১৬ ধাপ, স্বয়ংক্রিয় তৈরি)। শুরু হবে Release 1 গৃহীত হওয়ার পর; R1.1/R2 লাগে না (শুধু `expenses`)।

বাংলাদেশের **স্কুল, কলেজ, কোচিং সেন্টার ও প্রাইভেট ব্যাচের** জন্য all-in-one, multi-tenant, subscription-ভিত্তিক ওয়েব অ্যাপ। Super Admin → Institution Admin (ক্লায়েন্ট, সাবস্ক্রিপশন দেয়) → Teacher / Accountant / Student / Parent। প্রতিটি প্রতিষ্ঠানের নিজস্ব থিম, লেআউট ও ঠিকানা (subdomain বা নিজস্ব domain)।

> **স্থিতি:** স্পেসিফিকেশন। কোনো কোড লেখা বা চালানো হয়নি। পরের ধাপ: Spike (`docs/spike/walking-skeleton.md`)। পণ্যের সীমা ও খোলা সিদ্ধান্ত: [`PRODUCT.md`](PRODUCT.md)।

## এজেন্ট/ডেভেলপার — এখান থেকে শুরু
1. [`AGENTS.md`](AGENTS.md) — কী পড়বেন কখন; ১২টি কাজের নিয়ম; Definition of Done
2. [`PRODUCT.md`](PRODUCT.md) — পণ্য, চার ধরন, প্ল্যান, সিদ্ধান্ত ও খোলা প্রশ্ন
3. [`docs/LOCKED-DECISIONS.md`](docs/LOCKED-DECISIONS.md) — D1–D47 (নতুন করে ঠিক করা নিষেধ)
4. [`docs/BUILD-SEQUENCE.md`](docs/BUILD-SEQUENCE.md) — Phase 0–10, প্রতিটি Step-এ spec ও "Done When"
5. `.cursor/rules/*.mdc` — Cursor-এ স্বয়ংক্রিয়ভাবে যুক্ত হওয়া সংক্ষিপ্ত নিয়ম

## কাঠামো
```
LMS/
├── AGENTS.md  PRODUCT.md  README.md
├── .cursor/rules/      core · architecture · backend · frontend · database · theming  (.mdc)
├── docs/
│   ├── ARCHITECTURE.md  DESIGN-SYSTEM.md  THEMING.md  UI-PACKS.md  I18N.md  DATABASE.md
│   ├── API.md  API-ERRORS.md  AUTHORIZATION.md  SECURITY.md
│   ├── BUILD-SEQUENCE.md  ROADMAP.md  TESTING.md  E2E-TESTING.md  STYLE-GUIDE.md  LOCKED-DECISIONS.md
│   ├── DECISIONS.md  PROGRESS.md  SPIKE-LOG.md       ← এজেন্ট পূরণ করে
│   ├── architecture/   tenancy · backend-pattern · folder-structure · environment-variables · stores · patterns
│   ├── database/       schema.sql (একমাত্র সত্য) · migrations · seeders
│   ├── modules/        README.md (সূচি) + প্রতিটি মডিউল
│   ├── design/         component-library · user-journeys
│   ├── templates/      Laravel/React নমুনা-কোড
│   ├── ops/            deployment · docker · git · benchmarks · security-checklist
│   ├── legal/          privacy-and-consent (খসড়া — আইনজীবীর যাচাই আবশ্যক)
│   ├── business/       saas-metrics · customer-support
│   ├── spike/          walking-skeleton · SPIKE-READY
│   └── reports/        audit · feature-audit · quality-analysis · verification-r10 · feature-ideas
├── themes/
│   ├── theme-01/  Classic Blue   · sidebar-classic · school, college
│   ├── theme-02/  Modern Mint    · sidebar-mini    · coaching
│   └── theme-03/  Tutor Lite     · mobile-compact  · private batch, coaching
│        (প্রতিটিতে THEME · DESIGN · COMPONENTS · TOKENS)
├── infra/              loadtest/ (peak-hour.k6.mjs) · docker-compose.dev.yml · scripts/ (mysql-smoke.sh, schema-diff.sh, invariants.tsv) · Caddyfile · nginx.conf · laravel-fastcgi.conf · CI · check-theme-rules.mjs · check-schema-parity.mjs · spec-verify/ (verify.py, refs_r11/r12, tenant_export_ref) · postman
├── api/                ← Laravel (এজেন্ট বানাবে)
└── frontend/           ← React (এজেন্ট বানাবে)
```

## কোন প্রশ্নে কোন ফাইল
| প্রশ্ন | ফাইল |
|---|---|
| এটা কী, কার জন্য, কী নেই | `PRODUCT.md` |
| সিস্টেমটা কীভাবে জোড়া | `docs/ARCHITECTURE.md` |
| কোন টেবিল/কলাম | `docs/DATABASE.md` → `docs/database/schema.sql` |
| কোন endpoint | `docs/API.md` |
| কে কী করতে পারে, লগইন, token | `docs/AUTHORIZATION.md`, `docs/SECURITY.md` |
| চেহারা, থিম, লেআউট, UI Pack | `docs/DESIGN-SYSTEM.md`, `docs/THEMING.md`, `docs/UI-PACKS.md`, `themes/` |
| ভাষা, আরবি/RTL, মাদ্রাসা | `docs/I18N.md` |
| কোনো ফিচার/মডিউল | `docs/modules/README.md` |
| কোন ক্রমে বানাব | `docs/BUILD-SEQUENCE.md` |
| কোন ফিচার কোন release-এ, স্পেক হয়েছে কি (খতিয়ান) | `docs/ROADMAP.md` |
| কীভাবে পরীক্ষা | `docs/TESTING.md` |
| কত ভালো এই পরিকল্পনা | `docs/reports/QUALITY-ANALYSIS.md`; যাচাইয়ের ফল ও ত্রুটি: `docs/reports/VERIFICATION-R10.md`; পুনরায় চালান: `python3 infra/spec-verify/verify.py` |
| **এজেন্ট এখান থেকে শুরু করবে** | **`docs/AGENT-PLAN-R1.md`** (একটি ফাইলে ধাপে ধাপে; `docs/release/r1-plan.json`) |
| Release 1-এর সিদ্ধান্ত | `docs/RELEASE-1.md`, `docs/release/r1-scope.json` |
| গ্রাহক-সাক্ষাৎকার | `docs/research/` (প্রধান শিক্ষক, হিসাবরক্ষক, নোট ও সিদ্ধান্ত-নিয়ম) |
| আরও কী যোগ করা যায় | `docs/reports/FEATURE-IDEAS.md` (P1–P40) |

## Demo (seed-এর পর)
| Tenant (ধরন) | Host (dev) | লগইন |
|---|---|---|
| central | `http://admin.lvh.me:5173` | `admin@schoolapp.com` / `Admin@1234` |
| dhanmondi-school (school) | `http://dhanmondi-school.lvh.me:5173` | `principal@dhanmondischool.edu.bd` / `School@1234` |
| alokito-coaching (coaching) | `http://alokito-coaching.lvh.me:5173` | `01811111111` / `Coaching@1234` |
| rahim-sir (private_batch) | `http://rahim-sir.lvh.me:5173` | `01911111111` / `Tutor@1234` |
আরও: `docs/database/seeders.md`। শুধু dev; production-এ কখনো এই password নয়।

## শুরু (dev)
```bash
cd api && composer install && cp .env.example .env && php artisan key:generate && php artisan migrate:fresh --seed && php artisan serve
php artisan queue:work redis --queue=default,sms,notifications
cd ../frontend && npm install && npm run dev
```
বিস্তারিত: `docs/BUILD-SEQUENCE.md` Phase 0; env: `docs/architecture/environment-variables.md`।

## সীমা (সততার সাথে)
কোড চলেনি · আইনি অংশ অযাচাইকৃত · মূল্য/ইউনিট-অর্থনীতি অনুমান · গেটওয়ে/ব্যাংকের API-র বিবরণ অযাচাই (বিশেষত বাংলা QR) · VAT খোলা। বিস্তারিত: `PRODUCT.md`, `docs/reports/QUALITY-ANALYSIS.md`।
