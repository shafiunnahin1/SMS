# Panel & Feature Planning

## 6 Panels Overview

### 1. Super Admin Panel (SaaS Owner)
- Dashboard: মোট স্কুল, রেভিনিউ, গ্রোথ চার্ট
- Institutions: স্কুল CRUD, সাসপেন্ড, ডোমেইন সেটআপ
- Subscription & Plans: Basic/Pro/Enterprise প্ল্যান
- Billing & Payments: ইনভয়েস, পেমেন্ট হিস্ট্রি
- Settings: SMS/Email গেটওয়ে, মেইনটেন্যান্স মোড
- Reports: রেভিনিউ রিপোর্ট, চার্ন রেট

### 2. Institution Admin Panel (Principal / Manager)
- Dashboard: ছাত্র/শিক্ষক সংখ্যা, বকেয়া ফি সারসংক্ষেপ
- Student Management: ভর্তি, প্রোফাইল, TC, প্রমোশন
- Teacher Management: প্রোফাইল, বিষয় অ্যাসাইন
- Academic Setup: ক্লাস, সেকশন, বিষয়, রুটিন
- Exam & Result: পরীক্ষা, মার্ক এন্ট্রি, পাবলিশ
- Fee Management: ক্যাটাগরি, কালেকশন, বকেয়া
- Attendance: ছাত্র ও শিক্ষক উপস্থিতি
- HR & Staff: বেতন, ছুটি, স্টাফ ম্যানেজমেন্ট
- Notice & Communication: নোটিশ, SMS, ইভেন্ট
- Reports: সব মডিউলের রিপোর্ট PDF/Excel
- Settings: স্কুল তথ্য, গ্রেডিং, SMS টেমপ্লেট

### 3. Teacher Panel (Class Teacher)
- Dashboard: আজকের রুটিন, পেন্ডিং কাজ
- Attendance: ক্লাসভিত্তিক উপস্থিতি নেওয়া
- Mark Entry: বিষয়ভিত্তিক মার্ক, বাল্ক আপলোড
- Homework: তৈরি, অ্যাসাইন, সাবমিশন ট্র্যাক
- Study Material: নোট, PDF, ভিডিও আপলোড
- Online Class: Zoom/Meet লিংক শেয়ার
- Communication: অভিভাবককে মেসেজ

### 4. Student Panel (Learner)
- Dashboard: রুটিন, হোমওয়ার্ক, বকেয়া ফি
- Routine & Schedule: ক্লাস রুটিন, পরীক্ষার সময়সূচি
- Attendance: মাসিক উপস্থিতির রেকর্ড
- Results: পরীক্ষার ফলাফল, মার্কশিট ডাউনলোড
- Homework: পেন্ডিং হোমওয়ার্ক, সাবমিশন
- Study Materials: নোট ও ভিডিও ডাউনলোড
- Fee & Payment: বকেয়া দেখা, অনলাইন পেমেন্ট
- Notices: স্কুলের নোটিশ ও ইভেন্ট

### 5. Parent Panel (Guardian)
- Dashboard: সন্তানের উপস্থিতি, রেজাল্ট, বকেয়া
- Child Monitoring: উপস্থিতি, পারফরম্যান্স চার্ট
- Fee Payment: বকেয়া ফি অনলাইনে পরিশোধ
- Communication: শিক্ষকের সাথে মেসেজ
- Notices: স্কুলের নোটিশ, ইভেন্ট
- Transport: বাসের রুট, সময়সূচি

### 6. Accountant Panel (Finance Staff)
- Dashboard: আজকের কালেকশন, বকেয়া সারসংক্ষেপ
- Fee Collection: ছাত্রভিত্তিক কালেকশন, রসিদ প্রিন্ট
- Due Management: বকেয়া লিস্ট, SMS রিমাইন্ডার
- Expense: খরচের এন্ট্রি, রসিদ আপলোড

D81 / R3.1: expense entries are immutable. Manual creation records a positive decimal amount; correction appends a negative reversal plus positive replacement in one transaction, cancellation appends only a reversal. Original entries and receipts remain intact. Only admin/accountant within the same tenant may act; repeated correction/cancellation and direct mutation of system-generated expenses are rejected. Monthly totals sum signed amounts. Schema links and nullable uniqueness are defined in `docs/database/schema.sql`; no soft deletion is used.
- Staff Salary: বেতন প্রসেস, স্লিপ প্রিন্ট
- Financial Reports: আয়-ব্যয়, ব্যালেন্স শিট

## Technology Stack
- Frontend: React (Vite) + Tailwind CSS + shadcn/ui
- Backend: Laravel 11 + Sanctum
- Database: MySQL 8.0
- State: Zustand + TanStack React Query
- Mobile: React Native (Phase 4)

---

## Super Admin Panel — Detailed Pages

### Dashboard
- মোট স্কুল: Active / Trial / Expired / Suspended কার্ড
- মাসিক রেভিনিউ বার চার্ট (recharts)
- নতুন সাইনআপ ট্রেন্ড লাইন চার্ট
- Subscription মেয়াদ শেষের তালিকা (পরের ৭ দিনে)
- সর্বশেষ ১০টি পেমেন্ট লগ
- Plan অনুযায়ী স্কুল বিতরণ donut chart

### Institutions Management
- সার্চ (নাম, slug, domain), Status ফিল্টার, Plan ফিল্টার
- প্রতিটি স্কুলের: ছাত্র সংখ্যা, শিক্ষক সংখ্যা, মেয়াদ, Plan
- Quick Actions: Suspend, Activate, Extend, View Details, **Theme** (per-institution branding)
- Institution Detail: সব স্ট্যাট, payment history, domain info
- New Institution: manual onboarding form (institution + admin user একসাথে)
- **Per-Institution Theme**: প্রতিটি স্কুলের জন্য আলাদা primary/secondary/accent color, logo, favicon, light/dark mode — live preview সহ (বিস্তারিত: `docs/modules/institution-branding.md`)

### Subscription Plans
- Plan তৈরি ও সম্পাদনা: নাম, মূল্য, মেয়াদ, limits, features JSON
- Plan-এ স্কুলের সংখ্যা দেখা
- Plan মুছে ফেলা (যদি কোনো institution ব্যবহার না করে)

### Billing & Payments
- সব পেমেন্টের লিস্ট: স্কুল, পরিমাণ, মেথড, তারিখ, TrxID
- ফিল্টার: তারিখ পরিসীমা, Plan, Status (success/failed/refunded)
- Invoice PDF ডাউনলোড
- Manual payment mark (ব্যাংক ট্রান্সফারের ক্ষেত্রে)
- Refund প্রসেস বাটন

### Settings
- SMS Gateway: SSL Wireless credentials test + save
- Email SMTP: host, port, credentials, test email
- Payment Gateway: bKash, Nagad, SSLCommerz credentials
- App Config: নাম, লোগো, favicon, primary color
- Maintenance Mode: toggle + custom message
- Global Notice: সব স্কুলকে broadcast

### Reports & Analytics
- Revenue Report: মাসিক/বার্ষিক, plan অনুযায়ী breakdown
- Growth Report: নতুন স্কুল, churn rate, retention
- SMS Usage Report: কোন স্কুল কত SMS ব্যবহার করছে
- Export: Excel/PDF

---

## Updated Panel Features (Revision 4)

### Institution Admin Panel — New Pages
- `/admin/students/import` — Excel bulk student import
- `/admin/students/:id/health` — Student health record
- `/admin/students/:id/behavior` — Behavior log
- `/admin/students/:id/documents` — Document management
- `/admin/certificates` — Certificate generate & list
- `/admin/visitors` — Visitor check-in/out management
- `/admin/alumni` — Alumni directory
- `/admin/online-exams` — Online exam/quiz management
- `/admin/fees/installments` — Fee installment plans
- `/admin/meetings` — Parent meeting schedules
- `/admin/transport/qr-codes` — Student QR codes bulk print

### Teacher Panel — New Pages
- `/teacher/homework/:id/submissions` — View & grade submissions
- `/teacher/online-exams` — Create quizzes for class
- `/teacher/meetings` — Parent meeting requests
- `/teacher/behavior` — Log student behavior

### Student Panel — New Pages
- `/student/homework/:id/submit` — Submit homework file/text
- `/student/online-exams` — Take online quiz
- `/student/online-exams/:id/result` — Quiz result + leaderboard
- `/student/health` — View own health record
- `/student/certificates` — Own certificates

### Parent Panel — New Pages
- `/parent/meetings` — Schedule/confirm meetings
- `/parent/child/:id/behavior` — Child behavior log
- `/parent/child/:id/health` — Child health info
- `/parent/fees/installments` — Installment payment plan

### Accountant Panel — New Pages
- `/accountant/fees/installments` — Installment management
- `/accountant/fees/reminder` — Bulk fee reminder SMS
- `/accountant/fees/qr-scan` — QR code fee collection

---

## Revision 6 — Four Institution Types, Themes, Domains

প্যানেল এখনো ৬টি, কিন্তু প্রতিটি tenant-এ কোন প্যানেল ও কোন মেনু দেখাবে তা `institution_type` + plan + Super Admin override থেকে আসে (`docs/modules/institution-types.md`)। এই ফাইলে যেখানে "স্কুল", "Class", "Section" লেখা — UI-তে তা terminology অনুযায়ী বদলায়।

### Panel Availability
| Panel | school | college | coaching | private_batch |
|---|---|---|---|---|
| Institution Admin | ✅ | ✅ | ✅ | ✅ (Lite mode) |
| Teacher | ✅ | ✅ | ✅ | — |
| Accountant | ✅ | ✅ | ✅ | — |
| Student | ✅ | ✅ | ✅ | ঐচ্ছিক |
| Parent | ✅ | ✅ | ✅ | ঐচ্ছিক |

### Institution Admin Panel — New Pages
- `/admin/academic/programs` — Program (Class / Course) CRUD
- `/admin/batches`, `/admin/batches/:id` — Batch list, schedule, monthly fee, enrolled students, "Add student"
- `/admin/students/:id` → "Enrollments" tab — সব batch, ইতিহাস, transfer/end
- `/admin/leads` — ভর্তি-ইচ্ছুক তালিকা ও follow-up (coaching)
- `/admin/teacher-payouts` — মাসিক শিক্ষক পেমেন্ট (coaching)
- `/admin/exams/:id/merit-list` — merit list + SMS (coaching, private_batch)
- `/admin/settings/appearance` — preset, layout, color, style, logo (`docs/THEMING.md`)
- `/admin/settings/domain` — subdomain, custom domain, DNS নির্দেশনা (`docs/modules/custom-domain.md`)
- `/admin/settings/terminology` — label override
- `/admin/subscription/sms-credits` — SMS credit কেনা
- `/admin/more` — `mobile-compact` layout-এর "More" পেজ

### Super Admin Panel — New Pages
- `/super-admin/institutions` — filter: প্রতিষ্ঠানের ধরন; detail-এ type পরিবর্তন, module override toggle, SMS credit সমন্বয়, domain তালিকা
- `/super-admin/theme-presets` — preset CRUD
- `/super-admin/domains` — custom domain approval queue
- `/super-admin/plans` — plan-এ `institution_type`, `max_batches`
- Dashboard: type অনুযায়ী প্রতিষ্ঠান সংখ্যা ও revenue breakdown

### Private Batch — Lite Mode
৫-ট্যাবের মোবাইল-প্রথম অভিজ্ঞতা: Home, Batches, Students, Fees, More — `docs/modules/coaching-private-batch.md`।

---

## Revision 6.2 — Payments, SMS Sender, Public Website

### Institution Admin Panel — New Pages
- `/admin/settings/payments` — নিজস্ব bKash/SSLCommerz credential (মাস্ক করা, Test connection, Callback URL copy), payout account, "অনলাইন ফি এখন কোথায় যাচ্ছে" সারাংশ
- `/admin/payments`, `/admin/payments/settlements` — অনলাইন পেমেন্টের তালিকা ও settlement ইতিহাস (Accountant শুধু দেখতে পারে)
- `/admin/settings/sms` — Sender/Masking ID জমা, status, কোন ID থেকে SMS যাচ্ছে
- `/admin/settings/website` — পাবলিক সাইট (headline, পরিচিতি, যোগাযোগ, ভর্তি খোলা/বন্ধ, SEO)
- `/admin/leads` — source ফিল্টারে "website" আবেদন; Student-এ convert

### Parent Panel — Changes
- `/parent/fees` — বকেয়া তালিকা (সন্তান ও enrollment অনুযায়ী), একাধিক বকেয়া বেছে "পরিশোধ করুন"; পেমেন্ট কোথায় যাবে তার স্পষ্ট নোট; ফেরার পর স্ট্যাটাস ও রসিদ

### Super Admin Panel — New Pages
- `/super-admin/payout-accounts` — প্রতিষ্ঠানের payout account যাচাই
- `/super-admin/settlements` — generate → approve → pay; `/super-admin/online-payments` — সব অনলাইন পেমেন্ট
- `/super-admin/sms-senders` — Sender ID অনুমোদন queue
- Dashboard: "প্রতিষ্ঠানের পাওনা (unsettled)" ও "Sender ID সমস্যা" কার্ড
- Institution detail: platform-collect টগল ও fee %

### Public (প্রতিষ্ঠানের নিজের ঠিকানায়, লগইন ছাড়া)
`/` Home, `/notices`, `/admission` — `docs/modules/public-website.md`
