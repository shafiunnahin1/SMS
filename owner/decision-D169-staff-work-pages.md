# খসড়া সিদ্ধান্ত D169: কর্মীদের চারটি কাজের পাতা (ভর্তি, শিক্ষার্থীর তথ্য, ফি আদায়, হাজিরা)

> এজেন্টের খসড়া — কোনো কোড, guard বা task-scope বদলানো হয়নি। মালিকের উত্তর §৭-এ; উত্তর অনুযায়ী বদলানো নকশা §৮-এ। অনুমোদন করলে `owner\approve-D169.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ STW.1–STW.5; push করে না)।
> ক্রম (মালিক, 2026-10-26): D169 খসড়া → মালিকের অনুমোদন → guard/task scope → অনুমোদিত staff পাতা ও route → চারটি নির্দেশনা যাচাই/অনুমোদন → AI-Q4S সম্পূর্ণ → AI-Q5।

## ০. মূল নিয়ম
- **D91 বহাল:** কর্মীর প্রতিটি আসল অনুরোধে একটি নির্বাচিত বিভাগ (`X-Department-Id`) আর **সেই বিভাগে** দায়িত্বের permission যাচাই। D168-এর "যেকোনো সক্রিয় বিভাগ" শুধু সহায়িকার নির্দেশনা দেখানোর জন্য — পাতা বা API-তে প্রবেশের জন্য নয়।
- **সব student route একসাথে খোলা নয়।** নিচের তালিকার route ছাড়া কিছু খুলবে না; প্রতিটি route `StaffIdentityBoundary`-তে নাম ধরে (method + URI + controller action) যোগ হবে, আর D91-এর বিভাগ-যাচাই (`DepartmentRequestContextService::forRoute`) চলবে।
- নতুন টেবিল, নতুন permission key বা নতুন package নয় — সব key আগে থেকেই D90-এর ১৫০-key তালিকায় আছে।
- মুছে ফেলা, পরিচয় মুছে দেওয়া (anonymize), সম্মতিপত্র, ভর্তি বাতিল/স্থানান্তর, ফি ফেরত, প্রতিবেদন — কর্মীর জন্য বন্ধ থাকবে (আগের মতো)।

## ১. এখনকার অবস্থা (কোড থেকে যাচাই করা; কিছু বদলানো হয়নি)
| বিষয় | অবস্থা |
|---|---|
| কর্মীর মেনু | শুধু "আমার বিভাগ", "আমার তথ্য", "AI সহকারী"; বিভাগের portal শুধু "এই বিভাগটি বাছাই হয়েছে" লেখে (`frontend/src/pages/r3/Staff.jsx`) |
| `X-Department-Id` | ফ্রন্টএন্ডের কোথাও পাঠানো হয় না — তাই কোনো staff পাতা এখন ব্যবসায়িক অনুরোধ করতে পারে না |
| ছাত্র route | catalog-এ `exact_duty_permission`, কিন্তু `StaffIdentityBoundary`-এর তালিকায় নেই → কর্মী 403 |
| হাজিরা | middleware-এ খোলা, কিন্তু `AttendanceService::canTake` শুধু admin ও শিক্ষককে মানে → কর্মী হাজিরা সংরক্ষণ করতে পারে না |
| ফি আদায় | middleware-এ খোলা (D101), বিভাগ-যাচাই সহ; ফি-পাতা ছাত্র খুঁজতে `GET /students` ব্যবহার করে, যা কর্মীর জন্য বন্ধ |
| ভর্তি | `POST /students` ছাত্র, লগইন, অভিভাবক-সংযোগ, প্রথম ভর্তি, ছবি আর **অভিভাবকের কাগজের সম্মতি** (`consent_data`, `consent_sms`) একসাথে রেকর্ড করে; অথচ সম্মতির আলাদা route গুলো principal-only |

## ২. চারটি কাজ
প্রতিটি পাতা `/staff/...`-এ, কর্মীর বাছাই করা বিভাগের permission থাকলে তবেই মেনুতে দেখাবে (key না থাকলে মেনু-আইটেম লুকানো; থাকলেও API নিজে আবার যাচাই করে)।

### ২.১ শিক্ষার্থী ভর্তি — `/staff/students/new`
| API | duty permission |
|---|---|
| `POST api/v1/students` | `staff.student.store` |
| `GET api/v1/batches` (ব্যাচ/শাখা বাছতে; ইতিমধ্যে খোলা) | `staff.batch.index` |
- **লেখা যাবে:** নাম, অভিভাবকের ফোন/ইমেইল, বাবা-মায়ের নাম, লিঙ্গ, জন্মতারিখ, ঠিকানা, যেখানে পড়ে, ভর্তির তারিখ, ব্যাচ/শাখা, রোল, ছবি; আইডি খালি রাখলে সিস্টেম দেবে।
- **লেখা যাবে না (প্রস্তাব):** `fee_override` (ফি-ছাড় টাকার সিদ্ধান্ত — G9; পাঠালে 403)। সম্মতি: §৫ প্রশ্ন ২।
- **ফল:** ছাত্র তৈরি, আইডি দেখায়; audit-এ কর্মী ও বিভাগ।

### ২.২ শিক্ষার্থীর তথ্য দেখা — `/staff/students`, `/staff/students/:id`
| API | duty permission |
|---|---|
| `GET api/v1/students` (খোঁজা ও তালিকা) | `staff.student.index` |
| `GET api/v1/students/{id}` | `staff.student.show` |
| `GET api/v1/students/{id}/enrollments` (কোন ব্যাচে) | `staff.enrollment.for_student` |
- **শুধু দেখা**, সম্পাদনা নয় (`PUT /students/{id}` বন্ধ থাকবে)।
- **দেখা যাবে (প্রস্তাব):** আইডি, নাম, ছবি, ব্যাচ/শাখা, রোল, অবস্থা, অভিভাবকের ফোন, বাবা-মায়ের নাম। **লুকানো:** জন্মতারিখ, ঠিকানা, রক্তের গ্রুপ, ধর্ম, `fee_override` — শিশুর তথ্য কম দেখানো (D-সিদ্ধান্ত, গোপনীয়তা)। §৫ প্রশ্ন ৩।
- সম্মতি, ফাইল, মুছে ফেলা, anonymize, ভর্তি-পরিবর্তনের বোতাম কর্মীর পাতায় থাকবে না।

### ২.৩ ফি আদায় — `/staff/fees/collect`
| API | duty permission |
|---|---|
| `GET api/v1/students` (ছাত্র খোঁজা) | `staff.student.index` |
| `GET api/v1/fees/dues` | `staff.fee.dues` |
| `POST api/v1/fees/collect` | `staff.fee.collect` |
| `GET api/v1/fees/receipt/{id}` (রসিদ) | `staff.fee.receipt` |
- **করা যাবে:** বকেয়া দেখা, টাকা গ্রহণ, রসিদ প্রিন্ট। টাকার অঙ্ক সার্ভার Decimal-এ যাচাই করে (G9), ক্লায়েন্টের অঙ্ক বিশ্বাস নয়।
- **করা যাবে না:** ফেরত, ছাড়, ফি-খাত বা কাঠামো বদল, প্রতিবেদন।

### ২.৪ হাজিরা — `/staff/attendance`
| API | duty permission |
|---|---|
| `GET api/v1/batches` | `staff.batch.index` |
| `GET api/v1/attendance` (সেদিনের তালিকা) | `staff.attendance.index` |
| `POST api/v1/attendance` | `staff.attendance.store` |
| `PUT api/v1/attendance/{id}` (সংশোধন) | `staff.attendance.update` |
- `AttendanceService::canTake`-এ কর্মীর নিয়ম যোগ: বাছাই করা বিভাগে `staff.attendance.store` থাকলে — কোন ব্যাচ? §৫ প্রশ্ন ৪।
- অনুপস্থিতির SMS আগের নিয়মেই যায় (প্রতিষ্ঠানের SMS সেটিং)।

## ৩. বিভাগ বাছাই (সব পাতার পূর্বশর্ত)
- কর্মী "আমার বিভাগ"-এ একটি বিভাগ বাছেন; সেটি সেশনে মনে থাকে (token নয়, localStorage-এ নয় — শুধু বিভাগের id) এবং প্রতিটি staff-API অনুরোধে `X-Department-Id` যায়।
- পাতার উপরে বাছাই করা বিভাগের নাম; বদলানো যায়। বিভাগ না বাছলে পাতা "আগে বিভাগ বাছুন" দেখায়, কোনো অনুরোধ যায় না।

## ৪. গ্রহণের শর্ত (প্রতিটি পাতা)
- বাংলা (ডিফল্ট) ও ইংরেজি — সব লেখা `t()`-এ; মেনুর নাম: "শিক্ষার্থী ভর্তি" / "Student admission", "শিক্ষার্থী" / "Students", "ফি আদায়" / "Fee collection", "হাজিরা" / "Attendance"; "Class/Batch" শব্দ `useTerms()` থেকে।
- loading, empty, error অবস্থা; ৩৬০px ও desktop; RTL-নিরাপদ class; `npm run lint:theme` সবুজ।
- পরীক্ষা (প্রতিটি route): বাছাই করা বিভাগে key আছে → কাজ হয়; key অন্য বিভাগে আছে কিন্তু বাছাই করা বিভাগে নেই → 403; header নেই → D91-এর ত্রুটি; সদস্যপদ/দায়িত্ব নিষ্ক্রিয় → 403; অন্য প্রতিষ্ঠানের ছাত্র → 404; তালিকার বাইরের student route (`PUT`, `DELETE`, consents, anonymize) → 403; `fee_override` পাঠালে → 403।
- route registration: catalog, role matrix, inventory, tenant-isolation, middleware-contract পরীক্ষা।

## ৫. মালিকের কাছে প্রশ্ন
1. চারটি কাজ, §২-এর route ও key — অনুমোদন?
2. **ভর্তির সময় অভিভাবকের কাগজের সম্মতি:** কর্মী কি `consent_data` / `consent_sms` টিক দিয়ে রেকর্ড করতে পারবেন (প্রধানের মতো), নাকি কর্মীর ভর্তিতে সম্মতি "অপেক্ষমাণ" থাকবে আর প্রধান পরে রেকর্ড করবেন? (সুপারিশ: অপেক্ষমাণ — সম্মতির route principal-only, সেটাই রক্ষণশীল)
3. **শিক্ষার্থীর তথ্যে কী দেখাবে:** §২.২-এর কম-তথ্য তালিকা ঠিক? (জন্মতারিখ, ঠিকানা, রক্তের গ্রুপ, ধর্ম লুকানো)
4. **হাজিরা কোন ব্যাচে:** key থাকলে প্রতিষ্ঠানের যেকোনো ব্যাচ, নাকি বিভাগের সাথে যুক্ত ব্যাচ? (বিভাগ–ব্যাচ সংযোগের কোনো টেবিল এখন নেই; সুপারিশ: যেকোনো ব্যাচ, audit-এ কর্মী ও বিভাগ)
5. `fee_override` কর্মীর জন্য বন্ধ — ঠিক?
6. task ভাগ: STW.1 বিভাগ-বাছাই ও `X-Department-Id`; STW.2 ছাত্র দেখা; STW.3 ভর্তি; STW.4 ফি আদায়; STW.5 হাজিরা; তারপর AI-Q4S-এর চারটি নির্দেশনা — ক্রম ঠিক?

## ৬. সিদ্ধান্তের সারি
| D169 | Staff work pages: student admission, student view, fee collection, attendance (follows D90/D91, D27, D168; amendable only by a later owner decision) | Owner approved (2026-10-26). (1) Four staff workflows under /staff/..., each shown only when the selected department holds its key; every real request carries X-Department-Id and is checked against the SELECTED department (D91) - D168's "any active department" stays for help articles only. Routes are opened one by one by method + URI + action in StaffIdentityBoundary, never the student routes as a whole: admission POST api/v1/students (staff.student.store); student view GET api/v1/students (staff.student.index), GET api/v1/students/{id} (staff.student.show), GET api/v1/students/{id}/enrollments (staff.enrollment.for_student); fee collection GET api/v1/students, GET api/v1/fees/dues (staff.fee.dues), POST api/v1/fees/collect (staff.fee.collect), GET api/v1/fees/receipt/{id} (staff.fee.receipt); attendance GET api/v1/batches (staff.batch.index), GET/POST api/v1/attendance (staff.attendance.index/store), PUT api/v1/attendance/{id} (staff.attendance.update). Student edit, delete, anonymize, consents, files, enrollment changes, refunds, fee categories/structures and reports stay closed to staff. (2) Admission: staff admit directly without recording guardian consent (consent fields sent by staff are ignored; consent stays not recorded until the head records it on the existing principal-only routes; D27 unchanged - non-transactional SMS still waits for consent). Staff may not set fee_override (rejected with 403); only the institution head/admin may. (3) Student view is read-only and shows the full student record the head sees (including date of birth, address, blood group, religion), without fee_override and without consent, file, delete, anonymize or enrollment-change actions. (4) Attendance: a staff member may take or correct attendance for a batch only while an active grant exists for that staff member and batch, given by the institution head/admin or by that batch's teacher in charge (class teacher), revocable by either; new tenant table staff_attendance_grants (institution_id, batch_id, user_id, granted_by, revoked_by, revoked_at, timestamps; one active grant per batch and staff member); the key staff.attendance.* in the selected department is still required; audit names staff, department and grant. (5) Pages in Bangla (default) and English via t(), useTerms() for class/batch words, loading/empty/error states, 360px and desktop, lint:theme green; tests per route: key in the selected department works, key only in another department 403, missing header the D91 error, inactive membership/duty 403, another institution 404, unlisted student routes 403, fee_override 403, attendance without a grant 403. (6) Tasks in order STW.1 department selection and X-Department-Id, STW.2 student view, STW.3 admission, STW.4 fee collection, STW.5 attendance grants and staff attendance; then the four staff help articles complete AI-Q4S; then AI-Q5. Scope can be widened later only by a new owner decision. |

## ৭. মালিকের উত্তর (2026-10-26)
1. চারটি কাজ, route ও permission — **অনুমোদিত**।
2. ভর্তিতে অভিভাবকের সম্মতি **লাগবে না**; কর্মী সরাসরি ভর্তি করবেন।
3. শিক্ষার্থীর তথ্য **লুকানো থাকবে না** (জন্মতারিখ, ঠিকানা, রক্তের গ্রুপ, ধর্ম দেখাবে)।
4. হাজিরা: **প্রধান শিক্ষক বা ক্লাস টিচার অনুমতি দিলে** কর্মী সেই ব্যাচের হাজিরা নিতে পারবেন।
5. ফি-ছাড় কর্মীর জন্য **বন্ধ**; প্রতিষ্ঠান-প্রধান বা অ্যাডমিন পারবেন।
6. ক্রম **ঠিক**; পরে আপডেটের সুযোগ রাখতে হবে।

## ৮. উত্তর থেকে নকশা (এজেন্টের ব্যাখ্যা — অনুমোদনের আগে দেখে নিন)
- **সম্মতি (২):** এখনই প্রধানের ভর্তিতে সম্মতি ঐচ্ছিক (`sometimes|boolean`)। কর্মীর ভর্তিতে সম্মতির ঘর থাকবে না, পাঠালেও উপেক্ষিত; সম্মতি "রেকর্ড হয়নি" থাকবে। D27 বদলায় না: সম্মতি ছাড়া শুধু লেনদেনের SMS যায় (হাজিরা/ফি), প্রচারের SMS নয় — প্রধান পরে সম্মতি রেকর্ড করতে পারবেন।
- **হাজিরার অনুমতি (৪):** এর জন্য একটি **নতুন টেবিল** লাগবে — `staff_attendance_grants`। প্রধান/অ্যাডমিন বা সেই ব্যাচের দায়িত্বপ্রাপ্ত শিক্ষক (ক্লাস টিচার) কোনো কর্মীকে ব্যাচে অনুমতি দেন বা তুলে নেন; অনুমতি চলাকালীন আর বাছাই করা বিভাগে `staff.attendance.*` key থাকলে তবেই কর্মী হাজিরা নেন। অনুমতি দেওয়ার জায়গা: প্রধানের ব্যাচ-পাতা আর শিক্ষকের "আমার ব্যাচ"। (এজেন্ট টেবিল নিজে যোগ করবে না — এই সারি অনুমোদন হলে তবেই, `schema.sql`-সহ।)
- **পরে বদল (৬):** স্কোপ বাড়াতে বা বদলাতে নতুন সিদ্ধান্ত (D170…) — এই সারি সেটা বলে দেয়।
