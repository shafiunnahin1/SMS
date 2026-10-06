# Spike Readiness — Spike শুরুর আগে মালিকের চেকলিস্ট (Revision 12)

> `docs/spike/walking-skeleton.md` (S0–S8, S5b/S5c/S5d) চালানোর আগে যা **মানুষের** হাতে আছে। কোডের কিছুই এখানে নয়। এই তালিকা সম্পূর্ণ না হলে Spike শুরু করবেন না — আধা-প্রস্তুত Spike-এর মাপ বিশ্বাসযোগ্য হয় না (D28)।

## ক. পরিবেশ (এই স্পেক-পরিবেশে ছিল না, তাই যাচাই হয়নি)
- [ ] PHP ≥ ৮.২, Composer, MySQL ৮ (**MariaDB নয়** — JSON/ENUM/ইনডেক্স-আচরণ আলাদা), Redis, Node ≥ ২০, Chromium (Playwright-এর জন্য)
- [ ] `python3 infra/spec-verify/verify.py` আপনার মেশিনে সবুজ (এটি স্পেক ঠিক আছে কি না বলে; **MySQL-এ `schema.sql` সরাসরি `mysql < schema.sql` চালিয়ে দেখুন** — SQLite-অনুবাদ MySQL-এর সব আচরণ ধরে না)
- [ ] ৩টি ডিভাইস: একটি পুরনো Android (WebView পুরনো), একটি সাধারণ Android, একটি iPhone/ডেস্কটপ — `Intl` (`bn-BD`, `-u-nu-latn`), ফন্ট, হিজরি ক্যালেন্ডার, PDF ডাউনলোড যাচাইয়ের জন্য

## খ. মানুষ ও অ্যাকাউন্ট
- [ ] একজন **মানব রিভিউয়ার** (প্রতিটি Step-এর কোড পড়বে; এজেন্টের নিজের সবুজ-দাবি যথেষ্ট নয়)
- [ ] SMS gateway-র **sandbox/test অ্যাকাউন্ট** ও ডকুমেন্টেশন (Unicode ফ্ল্যাগ, DLR — `TODO(OD-sms-unicode)`, `TODO(OD-sms-dlr)`)
- [ ] পেমেন্ট sandbox: bKash ও SSLCommerz (অথবা অন্তত `FakeQrGateway` দিয়ে শুরু, আসলটি পরে)
- [ ] একজন **মাতৃভাষী আরবি-পাঠক** (UI-লেখা/পরিভাষা দেখতে — S5d-র RTL-স্মোকের জন্য) — না থাকলে আরবি-অংশ Spike-এ "অযাচাইকৃত" থাকবে
- [ ] একজন **হিসাবরক্ষক** (payroll golden সংখ্যা ও accounting চার্ট দেখতে) — না থাকলে সেগুলো "অযাচাইকৃত"

## গ. ডেটা-নমুনা (প্রকৃত, বেনামি করা)
- [ ] একটি প্রকৃত রসিদ ও marksheet-এর স্ক্যান (বাংলা যুক্তাক্ষরসহ) — PDF engine তুলনার (S5c) মানদণ্ড
- [ ] একটি প্রকৃত Excel (ছাত্র-তালিকা) পুরনো সিস্টেম থেকে — আমদানি-উইজার্ডের (`data-migration.md`) বাস্তবতা-পরীক্ষা; **এনকোডিং কেমন (UTF-8 না বিজয়)** জানান
- [ ] (ঐচ্ছিক — শুধু সরকারি/এমপিও প্রতিষ্ঠান লক্ষ্য হলে, D44) একটি প্রকৃত বোর্ড-ফর্ম / সরকারি-রিপোর্ট চেক (P10/P11 আগাম চাইলে)

## ঘ. Gate-মানদণ্ড (আপনি ঠিক করুন; আমার প্রস্তাব সংখ্যা অনুমান)
| মাপ | প্রস্তাবিত Go | Adjust | Stop |
|---|---|---|---|
| Rework (পরে বদলাতে হওয়া কোডের অংশ) | ≤ ২০% | ২০–৪০% | > ৪০% |
| প্ল্যানে ভুল (স্পেক-ত্রুটি, প্রতি Step) | ≤ ১ | ২–৩ | > ৩ |
| প্রথম-দফায় সবুজ টেস্ট | ≥ ৭০% | ৪০–৭০% | < ৪০% |
| তিন tenant-ধরনে slice কাজ করে | সবকটি | ২টি | ≤ ১টি |
| PDF-এ বাংলা+আরবি সঠিক (অন্তত একটি engine) | হ্যাঁ | শুধু বাংলা | কোনোটিই নয় |
**এই সংখ্যাগুলো আমার অনুমান — আপনার ঝুঁকি-সহনশীলতা অনুযায়ী বদলান।** Gate-এর সিদ্ধান্ত `docs/SPIKE-LOG.md`-এ, আপনার স্বাক্ষর ও তারিখসহ; স্বাক্ষর ছাড়া Phase 3 শুরু নয়।

## ঙ. Spike-এ **যা বানাবেন না**
UI-Pack-এর পাতা-সাজ (শুধু `attendance.take`-এর **একটি** বিকল্প view, S5b) · accounting · donations · devices · payroll (golden সংখ্যা ইতিমধ্যে reference-এ আছে) · tenant export/import · coupons · সাপোর্ট-টিকিট · বাকি Phase 7। Spike = ছাত্র→ফি→রসিদ→অভিভাবক slice, তিন tenant-ধরনে, মাপসহ।

## চ. প্রথম দিনের কমান্ড (ক্রম) — বিস্তারিত `docs/spike/SPIKE-RUNBOOK.md`
1. `python3 infra/spec-verify/verify.py . --deep` — সবুজ
2. `docker compose -f infra/docker-compose.dev.yml up -d --wait mysql` তারপর `bash infra/scripts/mysql-smoke.sh` — **exit 2 হলে সব থামান** (স্কিমা MySQL-এ লোডই হয়নি); এটি এখনো কখনো আসল MySQL-এ চালানো হয়নি
3. `docs/BUILD-SEQUENCE.md` Phase 0 থেকে শুরু; প্রতি Step শেষে `docs/PROGRESS.md`, `docs/SPIKE-LOG.md`
