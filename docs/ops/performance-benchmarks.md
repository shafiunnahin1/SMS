# Performance Benchmark Targets

## API Response Time Targets
| Endpoint | Target | Max Allowed |
|---------|--------|-------------|
| GET /students (paginated) | < 200ms | 500ms |
| POST /attendance (bulk 50) | < 500ms | 1000ms |
| POST /results/bulk (30 students) | < 400ms | 800ms |
| GET /dashboard stats | < 300ms | 600ms |
| PDF generate (marksheet) | < 2s | 5s |
| Excel export (500 students) | < 3s | 8s |
| SMS send (Queue dispatch) | < 50ms | 100ms |
| Login | < 300ms | 500ms |

## Database Query Targets
```
- Simple SELECT: < 10ms
- JOIN with 2-3 tables: < 50ms
- Aggregation (SUM, COUNT): < 100ms
- Reports with date range: < 500ms
- No query should do full table scan (indexes check করুন)
```

## Load Testing (Apache Bench)
```bash
# 100 concurrent users, 1000 requests
ab -n 1000 -c 100 -H "Authorization: Bearer TOKEN" \
   https://dhanmondi.schoolapp.com/api/v1/students

# Target: 95th percentile < 500ms
# Zero failed requests
# Requests per second > 50
```

## Monitoring Queries (MySQL)
```sql
-- Slow queries (> 1 second)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
-- Log: /var/log/mysql/slow-query.log

-- Missing indexes check
EXPLAIN SELECT * FROM students
WHERE institution_id = 1 AND program_id = 3;
-- type: ref বা eq_ref হওয়া উচিত, ALL হলে index দরকার

-- Table sizes
SELECT table_name, ROUND(data_length/1024/1024, 2) AS 'MB'
FROM information_schema.tables
WHERE table_schema = 'edu_saas'
ORDER BY data_length DESC;
```

## Frontend Performance (Lighthouse Targets)
```
Performance Score: > 85
First Contentful Paint (FCP): < 1.5s
Largest Contentful Paint (LCP): < 2.5s
Time to Interactive (TTI): < 3s
Total Blocking Time (TBT): < 200ms
Cumulative Layout Shift (CLS): < 0.1

Optimization:
- React lazy() দিয়ে code splitting (done in router)
- Tailwind CSS purge — unused classes remove
- Images: WebP format, lazy loading
- Bundle size < 500KB (gzipped)
```

## Scaling Thresholds (When to Upgrade)
```
CPU > 70% sustained → Server upgrade
RAM > 80% → RAM upgrade বা Redis optimize
DB connections > 80% of max → Connection pooling (PgBouncer)
Queue backlog > 1000 jobs → More workers
Response time P95 > 1s → Cache optimize, query optimize
Disk > 80% → S3 migration, log cleanup
```

---

## New Feature Performance Targets (Revision 5)

### AI Assistant
```
Response time: < 3s (Claude Haiku API call)
Cache: Same question from same institution → Redis cache 1hr
Rate limit: 20 AI requests/hour per institution (Pro), 50 (Enterprise)
```

### Excel Import
```
50 students (sync):  < 5s
500 students (queue): < 60s background
Template download:   < 500ms
```

### Online Exam
```
Exam start: < 200ms
Answer submit: < 100ms per answer
Auto-grade (100 MCQ): < 500ms
Leaderboard: < 300ms (cached 1min)
```

### QR Code Generation
```
Single QR: < 200ms
Bulk class QR PDF: < 5s
```

### GPS Tracking
```
Location update: < 100ms (from tracker)
Parent map load: < 500ms
Location history: < 300ms (last 24 hours)
```

### Data Export
```
Small institution (500 students): < 30s
Large institution (2000 students): < 2min (background job)
File size: < 50MB (compressed ZIP)
```

## Redis Key Strategy (Expanded)
```
institution:{slug}           → Institution info (1hr)
institution:domain:{domain}  → Custom domain lookup (1hr)
dashboard:{institution_id}   → Dashboard stats (5min)
current_year:{institution_id}→ Academic year (1hr)
programs:{institution_id}     → Class list with batches (1hr)
bkash_token             → bKash API token (58min)
zoom_token              → Zoom OAuth token (58min)
ai_response:{hash}      → AI answer cache (1hr)
leaderboard:{exam_id}   → Exam leaderboard (1min)
rate_limit:institution:{id}  → Per-institution API rate (1min TTL)
notifications:{user_id} → Unread count (30s)
```

---

# Revision 14 — ডেটা ও ট্রাফিক বাড়লে: বৃদ্ধির হিসাব, কোয়েরির নিয়ম, scaling-ধাপ

> **এই অংশের সংখ্যাগুলোর মধ্যে কোনটি মাপা, কোনটি অনুমান — স্পষ্ট করা আছে।** এখনো কোনো আসল MySQL-এ কিছু মাপা হয়নি। মাপার টুল তৈরি: `infra/scripts/perf-check.py` (নিচে §৬)। আগে মাপুন, তারপর scaling-এর সিদ্ধান্ত নিন।

## ১. কোন টেবিল সবচেয়ে দ্রুত বাড়ে (অনুমান-ভিত্তিক হিসাব)
ধরণা (আমার অনুমান, প্রকৃত নয়): প্রতি ছাত্র বছরে ~২২০ কর্মদিন; ২০টি ফি-লাইন; ৪০টি SMS; ৪০টি audit-ঘটনা; ২০টি বার্তা।
| টেবিল | ৫০,০০০ ছাত্র (~২৫০ প্রতিষ্ঠান) | ৫,০০,০০০ ছাত্র | বৃদ্ধির বাঁধ |
|---|---|---|---|
| `attendances` | ১.১ কোটি / বছর | ১১ কোটি / বছর | বছর-শেষে `archived_attendances` (বিদ্যমান নকশা) |
| `sms_logs` | ২০ লাখ | ২ কোটি | ১৮০ দিনের retention (`privacy-and-consent.md`) |
| `audit_logs` | ২০ লাখ | ২ কোটি | ২ বছরের retention |
| `fee_payments` | ১০ লাখ | ১ কোটি | কখনো মোছা যায় না (D32) — তাই ইনডেক্সই একমাত্র ভরসা |
| `messages` | ১০ লাখ | ১ কোটি | নীতি নেই — retention ঠিক করুন |
বাকি টেবিলগুলো এদের তুলনায় ছোট। **সবচেয়ে বড় ঝুঁকি = `attendances`, তারপর লগ-টেবিল।**

## ২. কোয়েরির নিয়ম (এগুলো ভাঙলে CI লাল হয়)
1. **কোয়েরি-ক্যাটালগই আইন:** প্রতিটি তালিকা/রিপোর্ট-পর্দার প্রধান কোয়েরি `infra/scripts/hot-queries.tsv`-এ থাকতে হবে। `python3 infra/spec-verify/plan_check.py .` তিনটি জিনিস দেখে: (ক) full scan নেই, (খ) WHERE-এর প্রথম সমতা-কলাম (tenant/entity) ইনডেক্সের অংশ, (গ) তারিখ-সীমা ইনডেক্সের **ভেতরে** আর ক্রমযুক্ত তালিকায় sort লাগে না।
2. **ইনডেক্স অনুমানে নয়:** প্রতিটি ইনডেক্স কোনো নাম-ধরা কোয়েরির জন্য (`verify.py` যাচাই করে; ২৭টির ২৭টি এখন প্রমাণিত)। ইনডেক্স লেখা ধীর করে — `sms_logs`/`audit_logs`-এ ঠিক ২টি, `fee_payments`-এ ৬টি। নতুন কোয়েরি যোগ → ক্যাটালগে যোগ → লাল হলে ইনডেক্স।
3. **কোনো tenant-টেবিল সম্পূর্ণ ইনডেক্সহীন নয়** (লিন্টে ত্রুটি)। InnoDB FK-কলামে নিজে ইনডেক্স বানায়; FK ছাড়া টেবিলে নিজে দিতে হয় — ১৩টি টেবিলে এটাই ছিল না।
4. **N+1 নিষিদ্ধ:** `Model::preventLazyLoading(! app()->isProduction())` — dev/test-এ lazy load exception দেয়, তাই ধরা পড়ে। তালিকায় `with(...)`।
5. **Pagination বাধ্যতামূলক, `per_page ≤ ১০০`** (middleware-এ সীমা)। বড় লগে (`sms_logs`, `audit_logs`, `messages`) `cursorPaginate()` — গভীর `OFFSET` ও মোট-সংখ্যার `COUNT(*)` এড়াতে।
6. **বড় কাজ `chunkById`**, queue-তে, `TenantAwareJob` (D25)। কোনো job সব সারি মেমরিতে আনে না।
7. **ভারী রিপোর্ট asynchronous** (PDF/Excel → queue `reports` → ডাউনলোড-লিঙ্ক)। ওয়েব-রিকোয়েস্ট ৫০০ms-এর নিচে।
8. **ড্যাশবোর্ড-সংখ্যা cache:** `inst:{id}:dash:...`, ৬০ সেকেন্ড, ঘটনায় বাতিল (`docs/architecture/redis-cache-strategy.md`)।

## ৩. Scaling-ধাপ — এক ধাপ, মেপে, ট্রিগার দেখে
**ট্রিগারের সংখ্যাগুলো আমার প্রস্তাব (জনপ্রিয় নিয়ম), আপনার মাপা মান নয় — মাপার পর বদলান।**
| ধাপ | কী | কখন (ট্রিগার) | সাবধানতা |
|---|---|---|---|
| ০ | এক সার্ভার: app + MySQL + Redis | শুরু | slow-query log ও queue-দৈর্ঘ্য প্রথম দিন থেকে |
| ১ | **DB আলাদা সার্ভারে, বড় RAM** (`innodb_buffer_pool_size` ≈ DB-RAM-এর ৬০–৭০%) | DB-CPU পিক-সময়ে ৬০%+ অথবা buffer-pool hit ৯৯%-এর নিচে | সহজতম ও সবচেয়ে কার্যকর ধাপ |
| ২ | **২+ app-সার্ভার** লোড-ব্যালেন্সারের পিছনে; static ফাইল CDN-এ | app-CPU বা p95 > ৫০০ms ধারাবাহিক | token-ভিত্তিক auth stateless (✓); Redis শেয়ার্ড হতে হবে; **ফাইলের জন্য শুধু `FILES_DRIVER=s3` — কোড/ডেটাবেস বদলায় না (D40, `docs/architecture/file-storage.md`)**; লোকাল ডিস্কে কোনো স্থায়ী অবস্থা নেই |
| ৩ | **MySQL read-replica**, রিপোর্ট সেখানে | রিপোর্ট প্রাইমারি ধীর করছে | replica lag: "এইমাত্র পেমেন্ট" পর্দা প্রাইমারি থেকে পড়ুক |
| ৪ | লগ-টেবিল partition; হাজিরা archive | একটি টেবিল ~৫ কোটি সারি পেরোলে **এবং মাপে সমস্যা** অথবা retention-`DELETE` বড় হয়ে গেলে | **D41:** সব প্রার্থীর PK `id` একা — partition-কলামসহ PK `(id, তারিখ)` লাগবে; FK-যুক্ত টেবিলে (`attendances`) partition চলে না; **`fee_payments` কখনো নয়**। শুধু লগ-টেবিল (`sms_logs`, `audit_logs`, `vehicle_locations`) যুক্তিসঙ্গত: `DROP PARTITION` তাৎক্ষণিক retention। হাজিরার জন্য প্রথমে বছর-শেষ archive |
| ৫ | ~~বড় প্রতিষ্ঠান আলাদা ডেটাবেসে~~ **বাতিল (D42)** | — | `users`/`audit_logs` প্ল্যাটফর্ম ও tenant মেশায়; বড় পুনর্নকশা। প্রতিকার: প্রতিষ্ঠান-ভিত্তিক rate limit + আলাদা queue, তারপর পুরো প্ল্যাটফর্ম বড় সার্ভারে |
**"৫ লাখ ছাত্র" এই স্থাপত্যে ধাপ ১–৩ দিয়ে সম্ভবত চলবে, কিন্তু সেটি আমার অনুমান — মাপার আগে নিশ্চিত নয়।** (ধাপ ২-এর ফাইল-বাধা ও ধাপ ৪–৫-এর নকশাগত সীমা Revision 15-এ মীমাংসিত: D40–D42।)

### মাপা ফল (Step 8.5, D62 — 2026-10-11)
মাপা হয়েছে ৪-কোর / ১৫ GB টেস্ট-মেশিনে (app + MySQL 8 + Redis একই মেশিনে; Laravel 12, `php artisan serve` ৪ worker) — **আসল সার্ভার নয়; 9.1-এ deploy-এর পর একই দুই পরীক্ষা আবার, তখন এই সারণি হালনাগাদ।**
| মাপ | ফল | সীমা (D62) |
|---|---|---|
| `perf-check.py` SCALE=1 (৫০,০০০ ছাত্র, ১.১ কোটি হাজিরা, ২০ লাখ SMS/audit) | ৭১ কোয়েরি, ০ সমস্যা; সব ইনডেক্সে; সবচেয়ে ধীর `retention_sms_trim` ৫১ ms | ৫০০ ms |
| k6 পিক-ঘণ্টা (১৮ মিনিট, ৬৯,৬৩১ অনুরোধ, ~৫৯/সেকেন্ড; ৩০ শিক্ষক, ৩০০ অভিভাবক) | ব্যর্থ ০%; p95 সব মিলিয়ে ৩৯.৭ ms | ব্যর্থ < ১% |
| হাজিরা-সংরক্ষণ (GET + POST ৪০ জন) | p95 ৩৮ ms | ১০০০ ms |
| অভিভাবক (হাজিরা + বকেয়া) | p95 ৩৮ ms | ৫০০ ms |
| ফি-কাউন্টার (বকেয়া + আদায়) | p95 ৫৭ ms | ৮০০ ms |
| Admin ছাত্র-তালিকা | p95 ৪৬ ms | ৫০০ ms |
**ট্রিগার, মাপা ভিত্তি থেকে:** পিক-ঘণ্টার p95 এখন ~৪০ ms, সীমা ৫০০ ms — অর্থাৎ ১০ গুণের বেশি জায়গা। ধাপ ২-এর ট্রিগার "পিক-ঘণ্টার p95 ধারাবাহিকভাবে ২০০ ms-এর বেশি (মাপা ভিত্তির ৫ গুণ) **অথবা** কোনো অংশ D62-সীমার ৫০%-এর বেশি" — সীমা ছোঁয়ার আগেই ব্যবস্থা। কোয়েরি-স্তরে: SCALE=1-এ সবচেয়ে ধীর কোয়েরি ৫১ ms — কোনো hot-query ২৫০ ms পেরোলে (সীমার অর্ধেক) ধাপ ১ (DB আলাদা) বিবেচনা। CPU/RAM/buffer-pool ট্রিগার (ধাপ ০–১) এখনো প্রস্তাবিত মান — আসল সার্ভারের monitoring (9.1) থেকে মাপা হবে।

## ৪. পিক-সময় ও এক-প্রতিষ্ঠানের প্রভাব
- মাপের লক্ষ্য **পিকের এক ঘণ্টা** — সকালে সব স্কুল একসাথে হাজিরা তোলে; মাসের শুরুতে ফি; ফল-প্রকাশের দিন পোর্টাল। গড় ট্রাফিক নয়।
- **noisy tenant:** প্রতিষ্ঠান-ভিত্তিক rate limit (`throttle` কী = institution_id); রিপোর্ট ও import আলাদা queue/worker (`reports`, `default`); import ২০,০০০ সারি/জব সীমা (`data-migration.md`)।
- পোর্টাল-ফল-প্রকাশ: ফল প্রকাশের মুহূর্তে অভিভাবকেরা একসাথে ঢোকে — প্রকাশিত ফলাফল cache করুন (প্রকাশের পর অপরিবর্তনীয়, D32 — তাই নিরাপদ)।

## ৫. ফ্রন্টএন্ড
Vite route-ভিত্তিক code splitting, ছবি আকার ও lazy-load, gzip/brotli (Caddy), static CDN, React Query cache, দীর্ঘ তালিকা virtualization (হাজিরা-গ্রিড ছাড়া)। বাজেট (JS বান্ডেল kB) **Spike-এর মাপ থেকে** — অনুমানে নয়।

## ৬. কীভাবে মাপবেন (আপনার মেশিনে — এখানে চালানো যায়নি)
```bash
docker compose -f infra/docker-compose.dev.yml up -d --wait mysql
python3 infra/scripts/perf-check.py --scale 0.1        # ~১০ লাখ হাজিরা — কয়েক মিনিট; ফল দেখে স্কেল ১ (১.১ কোটি) চালান
python3 infra/scripts/perf-check.py                    # SCALE=1: ৫০,০০০ ছাত্র, ১.১ কোটি হাজিরা, ২০ লাখ SMS/audit
```
আউটপুট: প্রতি কোয়েরির ব্যবহৃত ইনডেক্স, সময় (ms), ও FULLSCAN/SORT/SLOW চিহ্ন; exit 1 হলে সমস্যা। **সীমা:** সময়ে docker-exec ও ক্লায়েন্ট-খরচ মেশে (একটি `SELECT 1` ভিত্তি বাদ দেওয়া হয়, তবু ±দশ-বিশ ms ভুল); ল্যাপটপ প্রোডাকশন-সার্ভার নয়; ৫০০ms বাজেট একটি স্থানধারক। সত্যিকারের ক্ষমতা-পরীক্ষা (একসাথে বহু ব্যবহারকারী) এখনো বাকি: `ab`/`k6` দিয়ে `GET /students`, `POST /attendance` (BUILD-SEQUENCE Step 8.5)।

---

## Revision 15 — ট্রাফিক-দিক: কোড-স্তরের সংশোধন, লোড-টেস্ট, retention-মোছা

**১. হাজিরা-সংরক্ষণ এক `upsert`-এ।** আগে প্রতিটি ছাত্রের জন্য `updateOrCreate` (SELECT + INSERT/UPDATE) — ৪০ জনের ব্যাচে ~৮০ কোয়েরি, আর সব শিক্ষক সকালের একই ১৫ মিনিটে সংরক্ষণ করেন। এখন একটি `upsert` (conflict = `unique_attendance`)। **সাবধানতা:** `upsert` Eloquent event চালায় না, ফলে `BelongsToInstitution`-এর cross-tenant রক্ষা এড়িয়ে যায় — তাই bulk লেখার একমাত্র পথ `TenantBulk::upsert/insert`, যা প্রতিটি সারির `institution_id` মেলায়। `TenancyArchitectureTest` অন্য কোথাও `::upsert(`/`::insert(` ধরলে ব্যর্থ। (`created_at` update-তালিকায় নেই, তাই প্রথম মান টিকে থাকে; `upsert`-এর timestamp-আচরণ আপনার Laravel সংস্করণে মিলিয়ে নিন — অযাচাইকৃত।)
**২. `LIKE` তারিখ-কলামে নিষিদ্ধ।** `where('date','like','2027-03%')` তারিখকে স্ট্রিং বানায়, ইনডেক্স অচল। এখন `whereBetween`। মাসিক ব্যাচ-রিপোর্ট ৪০টি কোয়েরির বদলে ১টি `GROUP BY`। (`verify.py` কোড-নমুনায় `like` + তারিখ-কলাম ধরে।)
**৩. retention-মোছা ইনডেক্স-চালিত ও প্রতিষ্ঠান-ভিত্তিক।** `sms:trim`, `audit:trim`, `leads:purge`, `devices:prune`, `risk:prune`, `imports:prune` প্রতিটি `Tenancy::each`-এ চলে; ধাঁচ: `SELECT id … WHERE institution_id=? AND <তারিখ> < ? LIMIT 5000` → `DELETE … WHERE id IN (…)`, ফাঁকা না হওয়া পর্যন্ত, চাপ কমাতে ঘুম সহ। এই নির্বাচনী কোয়েরিগুলো `hot-queries.tsv`-এ (`retention_*`) — তাই ইনডেক্স ছাড়া purge পুরো টেবিল পড়ে না। আরও দুটি ইনডেক্স লাগল (`admission_leads`, `import_jobs`)।
**৪. লোড-টেস্ট:** `infra/loadtest/peak-hour.k6.mjs` — সকালের পিক-ঘণ্টা: শিক্ষক হাজিরা সংরক্ষণ (GET + POST), অভিভাবক দেখা, ফি-কাউন্টার, Admin-তালিকা; থ্রেশহোল্ড p95 ও ব্যর্থতা-হার। `inputs.example.json` পূরণ করে `k6 run …`। **এটি লেখা হয়েছে কিন্তু কোথাও চালানো হয়নি** (k6 ও অ্যাপ নেই); লগইনের body-ফিল্ডের নাম সবচেয়ে অনিশ্চিত অংশ। এটি **লেখে** — শুধু নিঃশেষযোগ্য ডেটাবেসে।
