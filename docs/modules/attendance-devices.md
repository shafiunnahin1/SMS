# Attendance Devices — RFID / কার্ড / QR / বায়োমেট্রিক-ID (Revision 11)

> ছাত্র, শিক্ষক ও কর্মচারীর উপস্থিতি device থেকে স্বয়ংক্রিয়ভাবে আসে। **কোনো নির্দিষ্ট বিক্রেতার প্রোটোকল আমি যাচাই করিনি** (ZKTeco, Hikvision, ইত্যাদি) — তাই এখানে একটি **সাধারণ, স্বাক্ষরিত JSON endpoint** ও বিক্রেতা-adapter-এর জায়গা (`DeviceDriver`) নির্দিষ্ট; প্রকৃত বিক্রেতার ডকুমেন্ট হাতে এলে তবেই adapter (`TODO(OD-device-vendor)`)। সংখ্যা ও স্বাক্ষর-vector `infra/spec-verify/refs_r11.py`-এ যাচাইকৃত।
> Module key: `attendance_devices` — **প্ল্যান-নিয়ন্ত্রিত** (ডিফল্টে Pro+); ধরন: school · college · coaching। সিদ্ধান্ত **D35**।

## ১. নীতি (D35)
1. **বায়োমেট্রিক টেমপ্লেট (আঙুলের ছাপ/মুখ) প্ল্যাটফর্মে কখনো আসে না, সংরক্ষিতও হয় না।** device নিজের ভেতরে টেমপ্লেট রাখে; সিস্টেম পায় শুধু একটি ID (কার্ড UID বা device-user-ID)। `person_credentials.kind` ∈ `rfid | device_user | qr`।
2. প্রতিটি punch **স্বাক্ষরিত** (HMAC) ও **idempotent**; সইহীন/বাসি/পুনরাবৃত্ত punch উপস্থিতি বদলাতে পারে না।
3. **অমিলযুক্ত (unmatched) punch কখনো অনুমানে কারো নামে বসে না** — তালিকায় রেখে মানুষ নির্ধারণ করে।
4. **হাতে-নেওয়া হাজিরা সবসময় জেতে** (device শুধু ফাঁকা জায়গা ভরে)।
5. বায়োমেট্রিক device ব্যবহারে `consents`-এ `biometric` ধরন (VARCHAR, নতুন migration নয়) — **শিশুর বায়োমেট্রিকের আইনি অবস্থা আমি যাচাই করিনি**; `docs/legal/` আইনজীবীর যাচাই আবশ্যক।

## ২. Device নিবন্ধন
`attendance_devices`: `name`, `kind` (`generic|rfid|fingerprint|face|qr`), `location`, `key_id` (সর্বজনীন, গ্লোবাল unique), `secret` (**`encrypted` cast; তৈরির সময় একবারই দেখানো হয়**), `utc_offset_minutes` (বাংলাদেশ = +৩৬০), `status`, `last_seen_at`।
- Admin "device যোগ করুন" → `key_id` + `secret` + ডেটা-পাঠানোর URL ও নমুনা কোড। **secret ঘোরানো (rotate)** ও নিষ্ক্রিয় করা যায়।
- `person_credentials`: `(institution_id, kind, value)` অনন্য; ছাত্র/শিক্ষক/কর্মচারীর সাথে কার্ড বাঁধা (একজনের একাধিক কার্ড চলে, একটি কার্ড একজনেরই)। কার্ড বিতরণ-পাতায় bulk (Excel থেকে UID → ছাত্র-ID)।

## ৩. Ingest endpoint
```
POST /api/v1/device/punches          (tenant host; কোনো Sanctum নয়; middleware: tenant, device.auth, throttle:device)
Headers:  X-Device-Key: <key_id>   X-Timestamp: <epoch seconds, UTC>   X-Signature: hex( HMAC_SHA256( secret, "<timestamp>.<raw body>" ) )
Body:     {"punches":[{"c":"04A1B2C3","t":"2027-01-01T08:02:11","d":"in"}]}      ≤ ৫০০ punch, ≤ ২৫৬ KB
Reply:    200 {"results":[{"c":"04A1B2C3","t":"…","status":"accepted|duplicate|stale|invalid"}]}
```
- **যাচাই:** (ক) `key_id` চেনা ও **এই tenant-এর** (অন্য tenant-host-এ পাঠালে 401, অস্তিত্ব ফাঁস নয়); (খ) `|now − timestamp| ≤ ৩০০ সেকেন্ড` (replay-জানালা); (গ) সই **constant-time** তুলনায়; (ঘ) device `active`।
- **Test vector:** secret `s3cr3t`, timestamp `1798761600`, body `{"punches":[{"c":"04A1B2C3","t":"2027-01-01T08:02:11+06:00"}]}` ⇒ সই `a0d7f256868ccd69e5fc9a34c8dd07f96232c77fed90ad5477f339e1117507a4`। (reference-এ যাচাইকৃত: ঠিক সই ✔; ১২০ সেকেন্ড পরে ✔; ১ বাইট বদলালে ✘; ৩০১ সেকেন্ড পরে ✘; ভুল secret ✘।)
- **Idempotent:** `UNIQUE (device_id, credential_value, punched_at)`। একই punch আবার এলে `duplicate`, ভুল নয়। device offline থাকলে জমানো punch পরে পাঠাতে পারে; **৭ দিনের বেশি পুরনো** `stale` (Admin ফাইল-আপলোডে backfill করতে পারে)।
- **সময়:** `t` device-এর স্থানীয় ঘড়ি; সার্ভার `UTC = t − utc_offset` সংরক্ষণ করে (যাচাইকৃত: `08:02:11` @ +৩৬০ → `02:02:11` UTC)। দিনের সীমা `Asia/Dhaka` তারিখে।
- প্রতিক্রিয়া দ্রুত: punch সংরক্ষণ করে সারি `pending`; প্রক্রিয়াকরণ queue-তে (`ProcessDevicePunches`, `TenantAwareJob`)।

## ৪. প্রক্রিয়াকরণ
1. **সদৃশ-দমন (debounce):** একই credential-এর আগের punch থেকে ৬০ সেকেন্ডের মধ্যে → `duplicate` (দুইবার কার্ড ঠেকানো)।
2. **চেনা:** `credential_value` → `person_credentials` (সক্রিয়) → ব্যক্তি; না মিললে `unmatched`।
3. **ছাত্র:** ওই তারিখে তার সক্রিয় `enrollments`-এর batch-গুলোর সময়সূচি (`batches.schedule`, শিফট `batches.shift`) থেকে প্রত্যাশিত শুরু-সময়; punch-সময়ের সাথে **শ্রেণীবিন্যাস (গ্রেস `settings.devices.grace_minutes` = ১০, পর্যালোচনা-সীমা ৬০):**
   | punch (শুরু ০৮:০০) | ফল |
   |---|---|
   | ০৮:০২, ০৮:১০ | **present** |
   | ০৮:১১, ০৯:০০ | **late** |
   | ০৯:০৫ | **review** — অনুমানে নয়, মানুষ ঠিক করে |
   একাধিক batch ওভারল্যাপ করলে বা সময়সূচি না থাকলে → `review`। প্রথম punch = "in"; পরের punch (`d=out`) শুধু রেকর্ড (ঐচ্ছিক অভিভাবক-SMS "স্কুল থেকে বের হয়েছে")।
4. **ফল লেখা:** `attendances` সারি **শুধু যদি ওই (ছাত্র, batch, তারিখ)-এ হাতে-নেওয়া সারি না থাকে**; `taken_by = NULL`, `note = 'device'`। অনুমোদিত ছুটি (`student_leave`) থাকলে `leave` জেতে।
5. **শিক্ষক/কর্মচারী:** `teacher_attendances`/`staff_attendances`-এ `check_in` = প্রথম punch, `check_out` = শেষ punch; `late` = `settings.devices.staff_start` + গ্রেসের পর। (payroll এই সারি দেখে — `staff-payroll.md` §৭.৩।)
6. **অনুপস্থিত-SMS** device থেকে স্বয়ংক্রিয় নয়: দিনের শেষে বিদ্যমান "অনুপস্থিত" প্রবাহ (`AttendanceService`) যে সারি নেই তাদের জন্য চলে; বিদ্যমান সম্মতি-নিয়ম প্রযোজ্য।
7. **আগমন-SMS** (`settings.devices.notify_arrival`, ডিফল্ট **বন্ধ**): প্রতিটি SMS-এর খরচ আছে (অংশ-গণনা `docs/I18N.md` §৭)।

## ৫. অমিলযুক্ত punch ও পর্যবেক্ষণ
- `/admin/attendance/devices/unmatched`: অচেনা কার্ড UID-তালিকা → "কে এটি?" → ছাত্র/শিক্ষক/কর্মচারী বাছাই → credential তৈরি → পুরনো `unmatched` punch পুনঃপ্রক্রিয়া।
- **Device স্বাস্থ্য:** `last_seen_at`; স্কুল-সময়ে ১৫ মিনিট punch/heartbeat না এলে Admin-কে in-app সতর্কতা; `device_punches` পুরনো সারি `processed` হলে ৯০ দিন পর `devices:prune` (raw JSON মুছে ফেলে, সারাংশ রাখে) — `docs/legal/privacy-and-consent.md` retention-তালিকায় যোগ।
- **নিরাপত্তা:** secret `encrypted`, API-তে কখনো ফেরত নয়; IP-allowlist ঐচ্ছিক; `throttle:device` (৬০/মিনিট/device); body-সীমা; লগে credential মাস্ক (`04A1****`); device-সম্পর্কিত audit (যোগ, rotate, নিষ্ক্রিয়)।

## ৬. Adapter (বিক্রেতা-নির্দিষ্ট)
```php
interface DeviceDriver { public function parse(Request $r): array;   /** @return list<Punch{credential,time,direction}> */ }
// GenericJsonDriver (default, above). A vendor driver (e.g. a device that pushes its own format) is added ONLY when the vendor's protocol document
// is in hand: TODO(OD-device-vendor). Never guess a vendor's wire format.
```

## ৭. Endpoint ও মেনু
```
POST /device/punches                                         (device; স্বাক্ষরিত)
GET|POST|PUT /attendance-devices   POST /attendance-devices/{id}/rotate-secret | disable
GET|POST /person-credentials      POST /person-credentials/import (Excel)
GET  /device-punches?status=      POST /device-punches/{id}/assign { person_type, person_id }   POST /device-punches/reprocess
```
মেনু: ক্যাম্পাস → "উপস্থিতি device" (`module: attendance_devices`)।

## ৮. পরীক্ষা
| Test | Asserts |
|---|---|
| `DeviceSignatureTest` | উপরের vector; ১ বাইট বদলে/ভুল secret/৩০১ সেকেন্ড পরে → 401; ঠিক সই ও ১২০ সেকেন্ড → 200 |
| `DevicePunchIdempotencyTest` | একই punch ২ বার → দ্বিতীয়টি `duplicate`; একই ব্যাচ ২ বার পাঠালে উপস্থিতি অপরিবর্তিত |
| `PunchClassificationTest` | ০৮:০২/০৮:১০ present; ০৮:১১/০৯:০০ late; ০৯:০৫ review; একাধিক batch → review |
| `PunchTimezoneTest` | +৩৬০ device-ঘড়ি → UTC; মধ্যরাতের কাছাকাছি punch Dhaka-তারিখে |
| `ManualWinsTest` | হাতে-নেওয়া সারি থাকলে device বদলায় না; অনুমোদিত ছুটি জেতে |
| `UnmatchedQueueTest` | অচেনা UID কারো নামে বসে না; assign করে reprocess → সারি তৈরি |
| `DebounceTest` | ৬০ সেকেন্ডের মধ্যে ২য় punch `duplicate` |
| `StaffPunchTest` | check_in/out; late-সীমা; payroll-এর `AttendanceSummary` এটি পায় |
| `DeviceTenancyTest` | অন্য tenant-host-এ key → 401; `Tenancy::as` job; credential প্রতিষ্ঠান-ভিত্তিক unique |
| `DeviceSecretTest` | secret একবারই দেখায়; rotate-পরে পুরনো সই ব্যর্থ; API-তে ফেরত নেই; লগে নেই |
| `DeviceGateTest` | Basic প্ল্যানে 403; private_batch-এ `module_disabled` |

## ৯. Done When
- [ ] একটি জেনেরিক device (বা curl-স্ক্রিপ্ট) স্বাক্ষরিত ব্যাচ পাঠালে ছাত্রের হাজিরা present/late আসে, হাতে-নেওয়া সারি অক্ষত
- [ ] অচেনা কার্ড তালিকায় আসে ও assign করার পর ঠিক সারি তৈরি হয়
- [ ] বিকৃত/বাসি/ভুল-tenant অনুরোধ সবই 401 ও কিছু লেখে না
- [ ] শিক্ষকের check_in/out payroll-এর উপস্থিতি-সারাংশে দেখা যায়

## ১০. সীমা
বিক্রেতার প্রোটোকল, device-এর firmware-সীমা, নেটওয়ার্ক-বিচ্ছিন্ন অবস্থায় device-এর জমা-ক্ষমতা, বায়োমেট্রিকের আইনি অবস্থা — সবই অযাচাইকৃত। মুখ/আঙুল শনাক্তকরণের নির্ভুলতা device-এর দায়, সিস্টেমের নয়।
