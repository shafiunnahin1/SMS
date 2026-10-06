# ARCHITECTURE

এক পাতার মানচিত্র। বিস্তারিত নিচের লিঙ্ক করা ফাইলে; সিদ্ধান্তের নম্বর (D5, D25 …) → `docs/LOCKED-DECISIONS.md`।

## ১. স্ট্যাক
Laravel 11 + Sanctum (bearer token) · MySQL 8 (একটি ডেটাবেস, row-level tenant isolation) · Redis (cache, queue) · React 18 + Vite + Tailwind + Zustand + TanStack Query · Caddy (TLS) → Nginx (SPA + FastCGI) → PHP-FPM · SMS: SSL Wireless · পেমেন্ট: bKash/SSLCommerz (registry-ভিত্তিক) (D1, D10)।

## ২. রিপোজিটরির গঠন
```
LMS/
├── AGENTS.md  PRODUCT.md  README.md      ← এজেন্টের প্রবেশদ্বার, পণ্য, সূচি
├── docs/                                  ← সব স্পেক (এই ফোল্ডার)
├── themes/theme-01..03/                   ← প্রতিটি থিমের নকশা (THEME, DESIGN, COMPONENTS, TOKENS)
├── infra/                                 ← কপি-করার কনফিগ: Caddyfile, nginx.conf, CI, lint স্ক্রিপ্ট
├── .cursor/rules/*.mdc                    ← Cursor-এর স্বয়ংক্রিয় নিয়ম
├── api/                                   ← Laravel অ্যাপ (এজেন্ট তৈরি করবে)
└── frontend/                              ← React অ্যাপ (এজেন্ট তৈরি করবে)
```
`api/` ও `frontend/`-এর ভিতরের গঠন: `docs/architecture/folder-structure.md`।

## ৩. Host ও অনুরোধের পথ (D8, D9, D18)
```
ব্রাউজার ──HTTPS──▶ Caddy :443   (wildcard *.base + on-demand TLS, শুধু `active` domain)
                       ▼
                    Nginx 127.0.0.1:8080
                       ├─ /            → React SPA (সব tenant-এর একই build)
                       ├─ /, /notices, /admission, /privacy, /terms, /robots.txt, /sitemap.xml → Laravel (SEO shell)
                       └─ /api         → PHP-FPM (FastCGI) → Laravel
```
| Host | কে | Middleware mode |
|---|---|---|
| `base.com`, `www` | landing, signup, gateway callback | `tenant:central` |
| `admin.base.com` | Super Admin | `tenant:central` + `tenancy.bypass` |
| `{slug}.base.com` বা active custom domain | একটি প্রতিষ্ঠান | `tenant` (Host থেকে resolve; কোনো tenant header নেই) |
| যেকোনো | `/health`, `/bootstrap`, login | `tenant:optional` |
SPA ও API **একই origin** (`VITE_API_URL=/api/v1`) — CORS ও cookie-domain সমস্যা নেই। বিস্তারিত: `docs/architecture/tenancy.md`, `docs/modules/custom-domain.md`।

## ৪. Tenant isolation — fail-closed (D25)
tenant-scoped model-এ tenant বাঁধা না থাকলে query **exception**, চুপচাপ সব ডেটা নয়। সব-tenant কাজ নাম-লেখা API (`Tenancy::withoutTenancy/as/each`, `->anyInstitution()`); Super Admin `/super/*` একটিমাত্র `tenancy.bypass` middleware-এ; queue job `TenantAwareJob` (প্রতিটি job-কে `Tenancy::as()`-এর ভেতরে চালায়); `User`/`AuditLog` NULL-`institution_id`-এর কারণে আলাদা নিয়মে। কোড: `docs/templates/laravel-core-files.md` → "Tenant Isolation, Fail-Closed"।

## ৫. প্রতিষ্ঠানের ধরন ও মডিউল (D3, D6)
`institutions.institution_type` ∈ `school | college | coaching | private_batch`। ধরন ঠিক করে: (১) কোন মডিউল চালু, (২) UI-র শব্দ, (৩) onboarding ডিফল্ট। **একটিই function** মডিউল চালু কি না বলে: `ModuleGate::allows()` = Super Admin override → ধরন → প্ল্যান। Route-এ `module:x`/`feature:x`; frontend-এ `useModules()` (শুধু UX; backend চেক বাধ্যতামূলক)। শব্দ: `useTerms()`/`term()` — "Class/Section/Batch/Course" হার্ডকোড নয় (D5)। বিস্তারিত: `docs/modules/institution-types.md`।

## ৬. একাডেমিক কাঠামো (D4)
`programs → batches → enrollments`। সদস্যপদের সত্য `enrollments`; `students.program_id/batch_id/roll_no` শুধু cache, কেবল `EnrollmentService` লেখে। হাজিরা, ফি, পরীক্ষা সবসময় `batch_id` বহন করে। বিস্তারিত: `docs/modules/academic-structure.md`।

## ৭. Backend স্তর
`Route → Middleware → Controller → FormRequest → Service → Model → Resource`। Business logic **Service**-এ, Controller পাতলা। Money `DECIMAL(10,2)`; server সবসময় অঙ্ক হিসাব করে (client নয়)। `docs/architecture/backend-pattern.md`, `docs/architecture/system-design-patterns.md`।

## ৮. Frontend স্তর
`ThemeProvider` (CSS variable) → `UIProvider` (UI pack) → `AppShell` (layout registry থেকে এক layout) → `nav/menu.js` (একমাত্র মেনু-উৎস) → page = hook + `PageSlot` (layout ও pack জানে না)। থিমের স্তর: রঙ → টোকেন → layout → **UI pack** (`docs/UI-PACKS.md`)। State: Zustand (auth, institution/bootstrap, ui) + TanStack Query (server data)। বিস্তারিত: `docs/THEMING.md`, `docs/DESIGN-SYSTEM.md`, `docs/architecture/zustand-stores.md`।

## ৯. টাকা (D14, D20, D24)
দুই আলাদা প্রবাহ: **subscription** (প্রতিষ্ঠান → প্ল্যাটফর্ম, `payments`) ও **ফি** (অভিভাবক → প্রতিষ্ঠান, `online_payments`)। ফি-র টাকা প্রতিষ্ঠানের নিজস্ব merchant থাকলে সরাসরি তাদের; নইলে (flag চালু থাকলে) প্ল্যাটফর্ম সংগ্রহ করে settle করে। Gateway = registry entry + adapter (Bangla QR পরে শুধু adapter)। টাকা কাটলে row কখনো `failed` নয় → `review`। `docs/modules/online-fee-payment.md`, `docs/modules/banglaqr-readiness.md`।

## ১০. সেশন ও গোপনীয়তা (D26, D27)
token role-ভেদে মেয়াদ + idle; সম্মতি `consents`; শিশুর ছবি/নথি private storage; বেনামিকরণ ও `tenant:purge`। `docs/AUTHORIZATION.md`, `docs/SECURITY.md`, `docs/legal/privacy-and-consent.md`।

## ১১. কী নেই / সীমা
কোড চালানো হয়নি; Spike-ই প্রথম পরীক্ষা (`docs/spike/walking-skeleton.md`, D28)। কোন ঝুঁকি কোথায়: `docs/reports/QUALITY-ANALYSIS.md`।
