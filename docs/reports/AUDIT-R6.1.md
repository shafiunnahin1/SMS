# Audit Report — Revision 6 → 6.1

## Method
স্ক্রিপ্ট দিয়ে যাচাই: `schema.sql` পার্স (duplicate column, FK ক্রম, index-এর কলাম, tenant scope), migration ↔ table মিল, ফাইল-রেফারেন্স, পুরনো নামের অবশিষ্টাংশ, `module:`/`feature:` key ↔ config মিল, সব PHP code block-এর bracket balance, route name duplicate।
**যাচাই করা যায়নি:** MySQL/PHP/Node/Caddy/Nginx এই পরিবেশে নেই — তাই schema বাস্তব MySQL-এ চালানো হয়নি, PHP/JSX কম্পাইল হয়নি, Nginx/Caddy config বাস্তব binary দিয়ে পরীক্ষা হয়নি। Phase 0–1-এর "Done When" এগুলো ধরবে।

## Fixed in 6.1
| # | Gap | Fix |
|---|---|---|
| 1 | Nginx `proxy_pass http://127.0.0.1:9000` — PHP-FPM FastCGI বোঝে, HTTP নয়; API কখনো চলত না (মূল config-এর পুরনো ত্রুটি, R6-এ বয়ে এসেছিল) | `fastcgi_pass` + `SCRIPT_FILENAME`, `HTTPS on`, `REMOTE_ADDR`; `trustProxies` লাগে না |
| 2 | Central host-এ tenant বাঁধা থাকে না, ফলে tenant-scoped route সেখানে চললে **সব প্রতিষ্ঠানের ডেটা** ফেরত আসত | `TenantMiddleware` তিন mode (`tenant` / `:optional` / `:central`); route group গুলো ঠিক একটি mode-এ |
| 3 | `RoleMiddleware`: super_admin tenant host-এ, tenant user central host-এ ঢুকতে পারত; type-অনুমোদিত নয় এমন role (private_batch-এ teacher) আটকাত না | পুনর্লিখিত + `EnsureUserBelongsToTenant` |
| 4 | `SubscriptionCheck`: bypass route-name দিয়ে, কিন্তু route গুলো named নয় — মেয়াদোত্তীর্ণ প্রতিষ্ঠান login বা পেমেন্টও করতে পারত না। সাথে পুরনো feature map ও সব student গণনা | path-ভিত্তিক bypass, শুধু active student, `max_batches`; feature চেক শুধু `module:`/`feature:` |
| 5 | Suspended প্রতিষ্ঠান পেমেন্ট করে ফিরতে পারত না (TenantMiddleware সব আটকাত) | auth/bootstrap/subscription/billing পথ খোলা |
| 6 | `/health` authenticated group-এর ভেতরে — UptimeRobot ও CI "Done When" ব্যর্থ হতো | `tenant:optional` group-এ, বিনা token-এ |
| 7 | `apiResource('expenses')` দুবার (route:cache ভাঙে), অনেক নতুন R6 route `routes/api.php`-এ ছিল না | পুরো `routes/api.php` পুনর্লিখিত |
| 8 | `/manifest.webmanifest` Laravel-এ পৌঁছায় না (Nginx শুধু `/api` PHP-তে পাঠায়) | `/api/v1/manifest.webmanifest` |
| 9 | Homework, Notice, Material, Online Class, Online Exam-এ `batch_id` নেই — coaching-এ নির্দিষ্ট batch-কে দেওয়া যেত না | `batch_id` যোগ + "Targeting Rule" (একটি scope) |
| 10 | UNIQUE key-তে NULL: `fee_structures`, `batch_teachers`, `teacher_payouts` — MySQL NULL-কে আলাদা ধরে, duplicate ঢুকত | NULL-এর বদলে `0` |
| 11 | `archived_attendances`, `teacher_attendances` — spec/config-এ আছে, table নেই; archive SQL `SELECT *` কলাম-ক্রমে ভঙ্গুর ও সব প্রতিষ্ঠান মুছত | table যোগ (৮২টি), explicit column list, প্রতিষ্ঠানভিত্তিক |
| 12 | `notifications`, `personal_access_tokens`, `jobs` ইত্যাদি Laravel table কোথাও নেই | migration-order-এ artisan নির্দেশ |
| 13 | অভিভাবকের default password = ফোন নম্বর | random + `must_change_password` + OTP; portal বন্ধ থাকলে parent user তৈরিই হয় না |
| 14 | `spatie/laravel-permission` ইনস্টল কিন্তু অব্যবহৃত, table নেই | বাদ; D17 |
| 15 | `ai_assistant`, `analytics`, `gps`, `cpd` কোনো plan-এ gated নয় (AI-এর খরচ আছে) | PlanSeeder-এ gated |
| 16 | `Institution` model/relation নাম অসঙ্গত (`subscriptionPlan` vs `plan`), JSON cast নেই | model code + alias |
| 17 | React router ও Login template পুরনো (৬ role layout, email-only) | AppShell, `login` field |
| 18 | `docs/modules/academic-sessions.md`-এ `ALTER TABLE batches ADD max_capacity` — column আগে থেকেই আছে, duplicate column error | সরানো |

## Open — আপনার সিদ্ধান্ত লাগবে (`PRODUCT.md` → Open Decisions)
OD-1 অনলাইন fee payment-এর টাকা কার অ্যাকাউন্টে; OD-2 SMS sender ID/masking; OD-3 প্রতিষ্ঠানের পাবলিক ওয়েবসাইট ও অনলাইন ভর্তি ফর্ম; OD-4 invoice-এ VAT।

## Known Limits (সচেতন সিদ্ধান্ত)
- `users` unique key-তে `institution_id = NULL` (Super Admin) — MySQL NULL আলাদা ধরে, তাই Super Admin-এর email unique হওয়া service-এ নিশ্চিত করতে হবে।
- Cloudflare proxy (কমলা মেঘ) সমর্থিত নয়; Cloudflare for SaaS পরবর্তী সিদ্ধান্ত।
- Super Admin-এর "impersonate" (ক্লায়েন্টের হিসেবে ঢোকা) নেই — support-এর জন্য উপকারী, কিন্তু অডিট-নিয়ম সহ আলাদা spec লাগবে।

---

# Revision 6.2 — Owner Decisions Applied

## Decisions
| ID | Owner's answer | Where it lives |
|---|---|---|
| OD-1 | প্রতিষ্ঠান নিজের পেমেন্ট সেটআপ করলে টাকা সরাসরি তাদের অ্যাকাউন্টে; না করলে প্ল্যাটফর্মের অ্যাকাউন্টে | `docs/modules/online-fee-payment.md`, `docs/LOCKED-DECISIONS.md` D20 |
| OD-2 | প্রতিষ্ঠানের নিজস্ব Sender/Masking ID থাকলে সেটি থেকে, নইলে প্ল্যাটফর্মের | `docs/modules/notifications.md`, D21 |
| OD-3 | "যা ভালো মনে হয়" → ছোট পাবলিক সাইট + ভর্তি-আবেদন ফর্ম (পূর্ণ CMS নয়) | `docs/modules/public-website.md`, D22 |
| OD-4 | উত্তর আসেনি (VAT) — এখনও open | `AGENTS.md` |

## Added
- ৪টি টেবিল (`institution_payment_gateways`, `institution_payout_accounts`, `online_payments`, `settlements`) → মোট ৮২; `institutions.sms_sender_*`, `sms_logs.sender_id/fallback_used`, `notices.is_public`, `programs.is_public`, `admission_leads`-এর আবেদন-কলাম।
- Payment: `PaymentRouter`, `GatewayInterface`, `OnlinePaymentService` (idempotent `finalize`), reconcile job, settlement flow, liability report, credential নিরাপত্তা, ৯টি test class।
- SMS: `SmsService::senderFor/compose`, approval flow, একবার-fallback, monitoring কার্ড।
- Public site: ৩টি পাতা, আবেদন API (honeypot + rate limit + duplicate-merge), SEO shell, robots/sitemap, bootstrap allow-list।

## Defects found and fixed while doing this (my own earlier work)
| # | Problem | Fix |
|---|---|---|
| 1 | `fee_payments` unique key `(institution_id, receipt_no)` = এক receipt এক row, অথচ কোচিংয়ের "একটি receipt-এ একাধিক line" স্পেক তা ভাঙত | `line_no` + `UNIQUE (institution_id, receipt_no, line_no)` |
| 2 | `FeeService::collect/getDueList/generateReceiptNo` স্কুল-যুগের: student-ভিত্তিক বকেয়া (বহু-ব্যাচে ভুল), receipt নম্বর race-condition-যুক্ত (read-last-then-increment) | "Revision 6.2 FeeService Methods": enrollment-ভিত্তিক due গণনা, key, atomic receipt নম্বর, client amount বর্জন |
| 3 | Nginx `rewrite` + FastCGI-তে `REQUEST_URI` মূল পথই থাকে → Laravel ভুল route করত | rewrite বাদ; exact-match location সরাসরি Laravel `routes/public.php`-এ; FastCGI অংশ `laravel-fastcgi.conf` snippet |
| 4 | `/bootstrap` (পাবলিক) পুরো `institutions.settings` পাঠাত — এখন সেখানে payment/SMS সেটিং থাকে | allow-list (`public-website.md` "Bootstrap Whitelist") |
| 5 | FeeCollection উদাহরণ ও পেমেন্ট UI snippet পুরনো contract (`fee_ids`, client `amount`) ব্যবহার করত | নতুন key-ভিত্তিক contract |
| 6 | `SmsService` message-এ হাতে `-{institution}` suffix ও `$student->name` (student-এর নাম `users`-এ) | `compose()`-এ এক জায়গায়; `$student->user->name` |

## Still open / honest limits
- **আইনি:** প্ল্যাটফর্ম-মোডে অন্যের টাকা সংগ্রহ (`PLATFORM_COLLECT_ENABLED`) — default `false`; চালুর আগে আইনি পরামর্শ। এটি আমি যাচাই করতে পারিনি।
- **Gateway API:** bKash/SSLCommerz-এর endpoint URL, sandbox host, response field — plan-এ যা আছে তা যাচাই করা নয়; sandbox-এ `GatewayContractTest` ও `verifyCredentials` ধরবে। Nagad-এর সরাসরি integration বানানো হয়নি।
- **Masking ID:** SMS gateway-তে নিবন্ধনের নিয়ম/সময় gateway-ভেদে; Super Admin ম্যানুয়ালি করবে। ID ফরম্যাটের সীমা (৩–১১ অক্ষর) ডিফল্ট ধারণা — gateway-র নিয়ম মিলিয়ে `.env` বদলান।
- **Refund:** সিস্টেমের বাইরে (gateway panel থেকে)।
- **OD-4 (VAT)** open।
- আগের মতোই: MySQL/PHP/Node/Nginx/Caddy এই পরিবেশে নেই — schema parse, PHP bracket-balance, route duplicate, module key মিল, ফাইল-রেফারেন্স স্ক্রিপ্টে যাচাই; বাস্তব binary-তে চালানো হয়নি।

---

# Revision 6.4 — Bangla QR Readiness (integration deferred to after the project)

## Decision
Bangla QR ব্যাংকের API পাওয়ার পর, প্রকল্প শেষে যুক্ত হবে (OD-5)। এখন কাঠামো এমনভাবে বসানো হলো যাতে সেই কাজ শুধু `BanglaQrGateway` + registry entry + `.env`।

## What changed now (seams)
| Seam | Before | Now |
|---|---|---|
| Gateway list | `['bkash','sslcommerz']` হার্ডকোড (router, route constraint, enum, validation) | `config/payments.php` registry + `ENABLED_GATEWAYS` |
| DB | `gateway` ও `payment_method` ENUM | VARCHAR(30) — migration ছাড়া নতুন মান |
| Interface | `create()` শুধু `payment_url` | flow-aware (`redirect`/`qr`), `extractRef()` + `authenticate()` + `notifyResponse()`, `capabilities()` |
| Provider notification | প্রতি provider-এ আলাদা route | generic `/fees/payment/{gateway}/notify` |
| Reference | `FEE-{inst}-{ulid}` (≈৩৬ অক্ষর) | ২০ অক্ষর `[A-Z0-9]` — QR/gateway-র দৈর্ঘ্যসীমায় নিরাপদ |
| QR data | — | `online_payments.flow/channel/qr_payload/expires_at` |
| Settings UI | gateway-ভেদে ফর্ম | registry `credential_fields` থেকে |
| Parent UI | redirect শুধু | `PaymentFlow` + `QrPaymentPanel` |
| Proof | — | `FakeQrGateway` (শুধু non-production) + `QrFlowTest` + `RegistryExtensibilityTest` |

## Defect found and fixed while doing this (my own R6.2 spec)
**টাকা কাটলেও অঙ্ক না মিললে পেমেন্ট `failed` ধরা হতো।** গ্রাহকের টাকা গেছে কিন্তু ফি জমা হয়নি ও কোনো সতর্কতা নেই। QR-এ আরও বিপজ্জনক: মেয়াদ শেষের পর গ্রাহক পেমেন্ট করলে row আগেই `cancelled`। এখন নতুন `review` status (`amount_mismatch` / `late_payment`): কখনো `failed` নয়, ফি জমা হয় না, Super Admin ও প্রতিষ্ঠান সতর্ক হয়, এবং `resolve` (সঠিক অঙ্কে দেরি হলে গ্রহণ, নইলে ফেরত চিহ্নিত)।

## Not verified / still open
- ব্যাংক বা PSP-র কোনো API বৈশিষ্ট্য আমি দেখিনি: `banglaqr-readiness.md`-এর adapter কাঠামো ও registry entry **স্থানধারক** (`TODO`), বাস্তব endpoint/ফিল্ড নয়।
- EMV QR-এর রেফারেন্স ফিল্ডের ≈২৫ অক্ষর সীমা সাধারণ EMV জ্ঞান; ব্যাংকের ডকুমেন্টে মিলিয়ে নিন (Part B, প্রশ্ন ২)।
- Static QR-এর ২০,২০০ টাকা সীমা ২০২১-এর গাইডলাইন; বর্তমান সীমা নিশ্চিত করা হয়নি।
- Bangla QR লোগো প্রদর্শনের নিয়ম ও ব্যাংকের settlement রিপোর্টের ফরম্যাট অজানা।
- আগের মতো: কোড চালানো হয়নি; স্ক্রিপ্টে schema parse, PHP bracket-balance, route duplicate, ফাইল-রেফারেন্স ও stale-নাম যাচাই।
