# Academics — Advanced (Revision 10)

> সাতটি ফিচার, যা আগে "বাদ/খোলা" ছিল: (১) ওজনযুক্ত ফাইনাল ফলাফল + Tabulation Sheet · (২) বকেয়ায় admit card/ফলাফল আটকানো · (৩) period/বিষয়-ভিত্তিক হাজিরা · (৪) বদলি শিক্ষক + routine-সংঘর্ষ ও স্থির ব্লক (বিরতি/নামাজ/অ্যাসেম্বলি) · (৫) অভিভাবক/ছাত্রের ছুটির আবেদন · (৬) নম্বর-এন্ট্রির deadline ও lock। ভিত্তি: `docs/modules/academic-structure.md`, `docs/modules/grading.md` (R6.3), `docs/modules/fees-advanced.md`। সব টেবিল `docs/database/schema.sql`-এ (D13); সব tenant-scoped (D25)।

| Module key | ধরন (school·college·coaching·batch) | প্ল্যান |
|---|---|---|
| `result_sheets` | ✓ ✓ ✓ – | core |
| `period_attendance` | ✓ ✓ – – | core |
| `substitution` | ✓ ✓ – – | core |
| `student_leave` | ✓ ✓ ✓ ✓ | core |
(বকেয়া-আটকানো ও marks-lock আলাদা key নয় — `fees`/`exams`-এর সেটিং)

---

## ১. ওজনযুক্ত ফাইনাল ফলাফল (`result_sheets`)
**সমস্যা:** বাংলাদেশের বেশিরভাগ স্কুল-কলেজ বছরের ফলাফল একাধিক পরীক্ষা মিলিয়ে দেয় (যেমন ১ম সাময়িক ৩০% + ২য় সাময়িক ৩০% + বার্ষিক ৪০%)। এতদিন শুধু আলাদা পরীক্ষার ফল ছিল।

### ১.১ ডেটা
- `result_sheets`: একটি "ফাইনাল ফলাফলের নিয়ম" — `program_id`, `batch_id` (NULL = পুরো program), `academic_year_id` (NULL সম্ভব), `name`, `rule` (JSON), `status` (`draft|published`), `version`, `published_at`।
- `final_results`: প্রতি ছাত্র × sheet — `total_percentage`, `gpa`, `grade`, `position_program`, `position_batch`, `is_pass`, `details` (JSON: প্রতি বিষয়ে component-ভিত্তিক শতকরা, ওজনযুক্ত মোট, গ্রেড, পাস)। `UNIQUE (result_sheet_id, student_id)`।

### ১.২ `rule` JSON (বদ্ধ schema — `ResultSheetRule` validation)
```json
{
  "components": [
    { "exam_id": 11, "weight": 30 },
    { "exam_id": 12, "weight": 30 },
    { "best_of": 2, "of": [21, 22, 23], "weight": 40 }      // সেরা ২টি ক্লাস-টেস্টের গড়, মোট ওজন ৪০
  ],
  "absent_policy": "zero",                // zero | exclude   (exclude: অনুপস্থিত component বাদ দিয়ে ওজন পুনর্বণ্টন)
  "missing_subject_policy": "error",       // error | skip_redistribute
  "pass_rule": "every_subject",            // total_only | every_subject | every_subject_every_exam
  "pass_percent": 33,                      // total_only / সামগ্রিক সীমা
  "use_gpa": true,                         // না থাকলে institution settings.use_gpa
  "optional_subject": "college_rule"       // docs/modules/college.md
}
```
**বৈধতা:** ওজনের যোগফল ঠিক ১০০; প্রতিটি `exam_id` একই program-এর (batch হলে ওই batch-এর বা program-ব্যাপী); `best_of ≤ len(of)`; একই exam দুবার নয়; প্রকাশিত sheet-এর rule বদলানো নিষেধ (নতুন version)।

### ১.৩ গণনা — `FinalResultService::compute(ResultSheet)`
```
প্রতি ছাত্র s, প্রতি বিষয় b:
  প্রতিটি component c-র শতকরা p(c) = results.percentage   (exam_subjects.full_marks ভিত্তিক, R6.3)   ; best_of হলে সেরা k-টির গড়
  অনুপস্থিত/অনুপস্থিত-নম্বর: absent_policy অনুযায়ী 0 বা বাদ+পুনর্বণ্টন
  weighted(s,b) = Σ weight(c) × p(c) / 100                      (বাদ-পড়া ওজন বাকিদের মধ্যে অনুপাতে)
  grade(s,b), point(s,b) = ResultService scale (percentage → grade) এর weighted দিয়ে    ← একটিই গ্রেড-হিসাব, নকল নয়
  pass(s,b) = pass_rule অনুযায়ী
total(s) = Σ weighted(s,b)×fullweight(b) / Σ fullweight(b)     (পূর্ণমান-ভারিত; ঐচ্ছিক বিষয় college নিয়মে)
gpa(s) = use_gpa ? ResultService::gpa(...) : null              (কোনো F থাকলে 0.00)
is_pass(s) = ∀b pass(s,b)  (pass_rule অনুযায়ী)
position: total(s) ঊর্ধ্বক্রমে; tie → একই rank; ব্যর্থ ছাত্র শেষে (rank "–")
```
ছাত্রের তালিকা = `enrollments` (active বা `completed`/`promoted` যদি `academic_year_id` মিলে) — `students.batch_id` cache নয় (D4)।
- **Idempotent:** `compute` আবার চালালে `final_results` upsert; `published` sheet-এ নিষিদ্ধ (নতুন version বানান)।
- **অসম্পূর্ণ ডেটা রিপোর্ট:** compute-এর আগে "কোন ছাত্র/বিষয়ে কোন component-এ নম্বর নেই" তালিকা (blocking, বা `missing_subject_policy`)।

### ১.৪ Publish ও ব্যবহার
`draft → published` (Admin; কারণসহ audit)। প্রকাশে: ছাত্র/অভিভাবক-পোর্টালে "বার্ষিক ফলাফল" দেখায় (বকেয়া-আটকানো প্রযোজ্য — §২); `settings.result_sms` চালু থাকলে ফলাফল SMS (প্রাপকের ভাষায়, বকেয়া-আটকা ছাত্রে নয়)। `report_card_summaries` (R6.5) এই sheet থেকেও ভরা যায় (`exam_id` NULL-সক্ষম নয় — তাই report card একটি *exam*-ভিত্তিক; ফাইনাল ফলাফলের জন্য `final_results`-ই report-card-ডেটা; PDF রূপ একই `report-cards` template-এ `result_sheet_id` সহ)।
- **Tabulation Sheet:** `GET /result-sheets/{id}/tabulation.pdf` — landscape; সারি = ছাত্র (roll অনুযায়ী), কলাম = বিষয় × {component marks, weighted, grade}; শেষে মোট, GPA, position, মন্তব্য; নিচে স্বাক্ষর-ঘর (শ্রেণিশিক্ষক, প্রধান শিক্ষক); পৃষ্ঠা-বিভাজন ও হেডার-পুনরাবৃত্তি; আরবি locale-এ RTL (`docs/I18N.md` §৮-এর engine-শর্ত)। বিষয় ৮-র বেশি হলে স্বয়ংক্রিয় পৃষ্ঠা-ভাগ বা A3।
- **Excel:** একই তথ্য `.xlsx` (শিরোনাম locale অনুযায়ী)।

### ১.৫ Endpoint
```
GET|POST  /result-sheets                      GET|PUT|DELETE /result-sheets/{id}      (PUT/DELETE শুধু draft)
POST      /result-sheets/{id}/compute         → { missing:[…] | computed:n }
GET       /result-sheets/{id}/preview         → final_results + অনুপস্থিত-সতর্কতা
POST      /result-sheets/{id}/publish         { reason? }      POST /result-sheets/{id}/new-version
GET       /result-sheets/{id}/tabulation.pdf  GET /result-sheets/{id}/export.xlsx
GET       /student/final-results  ·  /parent/children/{id}/final-results
```
Roles: Admin (CRUD, publish); Teacher (preview, নিজের batch); Student/Parent (প্রকাশিত, নিজের)।

### ১.৬ UI
`/admin/exams/result-sheets` (তালিকা) → "নতুন নিয়ম" উইজার্ড: ১) program/batch ২) পরীক্ষা বাছা ও ওজন (লাইভ যোগফল = ১০০) ৩) নীতি (pass/absent/missing) ৪) preview (প্রথম ২০ জন, সমস্যা-তালিকা) ৫) compute → publish। Pack-বিষয়ক নয় (সব pack-এ একই view)।

---

## ২. বকেয়ায় admit card/ফলাফল আটকানো
**সেটিং** (`institutions.settings.fees`): 
```json
{ "block_admit_card": false, "block_result": false, "block_threshold": { "mode": "amount", "value": 1000 }, "block_message": null }
```
`mode` ∈ `amount` (মোট বকেয়া ≥ value) · `months` (≥ n মাসের বকেয়া) · `any` (যেকোনো বকেয়া)। ডিফল্ট দুটোই `false`।
- **Admit card:** bulk generate-এ আটকা ছাত্র আলাদা তালিকায় ("পরিশোধ বাকি — N জন"); একক ডাউনলোডে 403 `blocked_by_dues` (বার্তা: বকেয়ার অঙ্কসহ, `block_message` থাকলে সেটি)।
- **ফলাফল:** ছাত্র/অভিভাবক পোর্টালে নম্বরের জায়গায় "বকেয়া ৳X — পরিশোধ করুন" + online-payment বাটন (থাকলে); শিক্ষক/Admin সবসময় দেখে। ফলাফল-SMS আটকা ছাত্রে যায় না (তালিকা Admin-কে)।
- **ছাড় (exemption):** `due_block_exemptions` — `student_id`, `scope` (`admit_card|result|all`), `reason`, `granted_by`, `expires_at` (NULL = অনির্দিষ্ট); Admin/Accountant দেয়; প্রতিটি `audit_logs`-এ।
- নীতি-সিদ্ধান্ত একটিই function: `DueBlockService::isBlocked(Student, 'admit_card'|'result'): ?array` (অঙ্ক ও কারণসহ) — সব endpoint ও PDF এটি ডাকে; frontend নিজে হিসাব করে না।
- **স্বচ্ছতা:** আটকানোর কারণ সবসময় ব্যবহারকারীকে দেখানো হয় (বকেয়া কত, কীভাবে মেটাবেন); নীরব আটকানো নয়।
```
GET  /students/{id}/due-block             → { blocked:{admit_card,result}, due_amount, reason }
POST|DELETE /students/{id}/due-block-exemptions   [admin, accountant]
GET  /exams/{id}/admit-cards/blocked      → আটকা ছাত্র-তালিকা
```

---

## ৩. Period / বিষয়-ভিত্তিক হাজিরা (`period_attendance`)
- `period_attendances`: `student_id`, `routine_id` (কোন period), `date`, `status` (`present|absent|late|leave`), `taken_by`, `note`; `UNIQUE (student_id, routine_id, date)`।
- **শিক্ষকের প্রবাহ:** "আমার আজকের period" (routine থেকে, `day_of_week` + সময়) → period বেছে ছাত্র-তালিকা (`enrollments` থেকে) → হাজিরা। `substitutions` থাকলে বদলি শিক্ষক সেই period-এ হাজিরা নিতে পারে।
- **দৈনিক হাজিরার সাথে সম্পর্ক** (`settings.attendance.daily_from_periods`, ডিফল্ট `false`): `false` হলে দুটি আলাদা (দৈনিক ম্যানুয়াল + period)। `true` হলে দৈনিক status ব্যুৎপন্ন: প্রথম period-এ `present` → `present`; সব period `absent` → `absent`; নীতি `first_period | majority | any` (`settings.attendance.daily_rule`); ব্যুৎপন্ন সারি `attendances`-এ `taken_by = NULL, note = 'derived'` (হাতে-নেওয়া সারি জেতে)।
- **রিপোর্ট:** বিষয়-অনুযায়ী উপস্থিতি % (পরীক্ষার ন্যূনতম উপস্থিতি যোগ্যতার জন্য `exams.min_attendance_percent` ঐচ্ছিক — admit card নীতিতে `attendance_below_minimum` কারণ; ডিফল্ট বন্ধ)।
- অনুপস্থিত-SMS: period-ভিত্তিক নয় (বার্তা-বন্যা); শুধু দৈনিক নিয়মে।
```
GET  /teacher/periods/today                   POST /period-attendance  { routine_id, date, records[] }
GET  /period-attendance/report?batch_id=&subject_id=&month=
```

---

## ৪. বদলি শিক্ষক, routine-সংঘর্ষ, স্থির ব্লক
### ৪.১ সংঘর্ষ শনাক্তকরণ — `RoutineConflictService::check($candidate): array`
`routines` সংরক্ষণে (create/update/bulk) চলে:
| সংঘর্ষ | শর্ত |
|---|---|
| শিক্ষক দ্বৈত | একই `teacher_id`, একই `day_of_week`, সময় ওভারল্যাপ (`start < other.end AND end > other.start`) |
| ঘর দ্বৈত | একই `room_no` (NULL নয়), একই দিন, ওভারল্যাপ |
| শ্রেণি/batch দ্বৈত | একই `batch_id` (বা batch NULL হলে একই `program_id`), ওভারল্যাপ |
| স্থির ব্লকের সাথে | `routine_blocks`-এর (বিরতি/নামাজ/অ্যাসেম্বলি) সময়ে ক্লাস |
| শিক্ষকের ছুটি | ওই তারিখে approved `leave_applications` (শুধু বদলি বসানোর সময়) |
ফল: `422 routine_conflict` + সংঘর্ষের তালিকা (কোন routine, কেন)। Admin `force=true` দিলে সতর্কতাসহ অনুমোদন (audit) — বদ্ধ ঘর নয়, নীতি-পছন্দ (`settings.routine.allow_conflict_override`, ডিফল্ট `false`)। DB-স্তরে UNIQUE নয় (সময়-ওভারল্যাপ UNIQUE-এ ধরা যায় না), তাই service + test-ই রক্ষক (`RoutineConflictTest`)।

### ৪.২ স্থির ব্লক (`routine_blocks`)
`institution_id`, `program_id` (NULL = সব), `day_of_week` (NULL = প্রতিদিন), `start_time`, `end_time`, `kind` (`break|assembly|prayer|other`), `label`, `sort_order`। রুটিন-ছাপায় আলাদা সারি হিসেবে (ধূসর), মাদ্রাসায় নামাজের সময় এখানে (`docs/modules/madrasa.md`)। সংঘর্ষ-নিয়ম §৪.১।

### ৪.৩ বদলি (`substitutions`)
`routine_id`, `date`, `original_teacher_id`, `substitute_teacher_id`, `reason` (`leave|sick|training|other`), `status` (`requested|confirmed|cancelled`), `created_by`; `UNIQUE (routine_id, date)`।
- **প্রবাহ:** শিক্ষক ছুটি অনুমোদিত হলে Admin-কে "এই তারিখের N টি period-এর বদলি দরকার" তালিকা (`GET /substitutions/needed?date=`); Admin প্রতিটিতে খালি শিক্ষক বাছে (সংঘর্ষ-মুক্ত শিক্ষকের তালিকা — §৪.১ নিয়মে ওই সময়ে যার ক্লাস নেই); সিস্টেম বদলি শিক্ষককে in-app + (সম্মতি থাকলে) SMS পাঠায় ("আগামীকাল ৩য় period, Class 8-A, গণিত"); শিক্ষক "গ্রহণ" করে → `confirmed`।
- **প্রভাব:** শিক্ষকের "আমার আজকের period"-এ আসে; period-হাজিরা বদলি শিক্ষক নেয়; `teacher_payouts` (coaching) প্রযোজ্য নয় (routine নেই); বেতনে প্রভাব ঐচ্ছিক — `hr_payroll` মাস-শেষে "অতিরিক্ত ক্লাস" সারাংশ দেখায় (সংখ্যা মাত্র; টাকা যোগ করা Admin-এর হাতে)।
- মুছে ফেলা: `cancelled` (হার্ড-ডিলিট নয়)।
```
GET  /substitutions/needed?date=         GET|POST /substitutions       PATCH /substitutions/{id} { status }
GET  /routines/available-teachers?day=&start=&end=
GET|POST|PUT|DELETE /routine-blocks
```

---

## ৫. ছাত্র/অভিভাবকের ছুটির আবেদন (`student_leave`)
- `student_leave_requests`: `student_id`, `from_date`, `to_date`, `total_days`, `reason`, `attachment` (private storage; ডাক্তারের সনদ — ≤ ২ MB, PDF/JPG/PNG), `status` (`pending|approved|rejected|cancelled`), `requested_by` (অভিভাবক-user বা ছাত্র-user), `decided_by`, `decided_at`, `decision_note`।
- **আবেদনকারী:** অভিভাবক (সন্তানের জন্য) বা ১৮+ ছাত্র নিজে (`students.date_of_birth`) — অন্যথায় শুধু অভিভাবক। private_batch-এ অভিভাবক-পোর্টাল বন্ধ থাকলে Admin/শিক্ষক ফোনে-জানা ছুটি নিজে এন্ট্রি করে (`method=phone`)।
- **অনুমোদক:** শ্রেণিশিক্ষক/`batch_teachers` বা Admin; সীমা: `settings.student_leave.max_days_auto` (এর নিচে শিক্ষক, উপরে Admin — ডিফল্ট ৩)।
- **প্রভাব:** অনুমোদিত তারিখে `AttendanceService` ওই ছাত্রের default status `leave` দেয় (শিক্ষক বদলাতে পারে), **অনুপস্থিত-SMS যায় না**; রিপোর্টে "ছুটি" আলাদা; পরীক্ষার তারিখে ছুটি ফেললে সতর্কতা।
- সংঘর্ষ: ইতিমধ্যে নেওয়া হাজিরা `absent` থাকলে অনুমোদনে "সংশোধন করুন?" প্রস্তাব (স্বয়ংক্রিয় নয়)।
- নোটিফিকেশন: আবেদনে শিক্ষক/Admin; সিদ্ধান্তে অভিভাবক (ভাষা অনুযায়ী)।
```
POST /parent/children/{id}/leave-requests      GET /parent/leave-requests
GET  /leave-requests/students?status=          PATCH /leave-requests/students/{id} { status, note }     (teacher/admin)
```

---

## ৬. নম্বর-এন্ট্রির deadline ও lock
`exam_subjects.entry_deadline` (DATETIME NULL), `locked_at` (NULL = খোলা), `locked_by`।
- শিক্ষক "জমা দিন" করলে `locked_at` বসে; এরপর সম্পাদনা 403 `marks_locked` (শিক্ষক) — Admin "আনলক" করতে কারণ লিখে (`audit_logs`, শিক্ষককে জানানো)। deadline পেরোলে `ResultService::bulkSaveMarks` শিক্ষককে আটকায় না (সতর্কতা), তবে "দেরিতে জমা" চিহ্ন; Admin deadline-পরবর্তী সম্পাদনা করতে পারে।
- Scheduler `exams:remind-entry` দৈনিক: deadline-এর ২ দিন আগে ও দিনে যে শিক্ষকের নম্বর জমা বাকি তাকে in-app + SMS (সম্মতি নিয়ম মেনে)।
- ফলাফল **প্রকাশ** (`exams.is_published`) শুধু যদি সব `exam_subjects` locked বা Admin override করে; `result_sheets.compute` এর "অসম্পূর্ণ" তালিকা lock-অবস্থাও দেখায়।
```
POST /exams/{id}/subjects/{subjectId}/submit        POST /exams/{id}/subjects/{subjectId}/unlock { reason }
```

---

## ৭. ডেটাবেস (সারাংশ — সংজ্ঞা `schema.sql`-এ)
নতুন টেবিল: `result_sheets`, `final_results`, `due_block_exemptions`, `period_attendances`, `routine_blocks`, `substitutions`, `student_leave_requests`। বর্ধিত: `exam_subjects` (+`entry_deadline`, `locked_at`, `locked_by`)।

## ৮. পরীক্ষা
| Test | Asserts |
|---|---|
| `FinalResultComputeTest` | ৩০/৩০/৪০ ওজনে হাতে-হিসাবের সাথে মেলে (স্থির ফিক্সচার); `best_of`; `absent_policy` zero/exclude; ওজনের যোগ ≠ ১০০ → 422; `pass_rule` তিনটি; ঐচ্ছিক বিষয়; tie → একই rank; ব্যর্থ ছাত্র rank "–" |
| `ResultSheetLifecycleTest` | published sheet-এ rule/compute নিষিদ্ধ; new-version; publish audit; অন্য প্রতিষ্ঠানের exam 422 |
| `TabulationPdfTest` | (spike S5c-এর পর) বাংলা+আরবি নাম, ৮+ বিষয়, পৃষ্ঠা-ভাগ |
| `DueBlockTest` | তিন mode; exemption (expires); admit-card bulk আলাদা তালিকা; পোর্টালে নম্বর লুকানো, শিক্ষকে নয়; SMS বাদ; কারণ সবসময় ফেরত |
| `PeriodAttendanceTest` | `UNIQUE`; বদলি শিক্ষক নিতে পারে, অন্য শিক্ষক নয়; `daily_from_periods` তিন নিয়ম; হাতে-নেওয়া দৈনিক জেতে |
| `RoutineConflictTest` | ৫টি সংঘর্ষ-ধরন প্রত্যেকে; ঠিক-শেষ-ঠিক-শুরু (end = start) সংঘর্ষ নয়; `force` শুধু অনুমোদিত সেটিংয়ে |
| `SubstitutionTest` | সংঘর্ষ-মুক্ত শিক্ষক-তালিকা; `UNIQUE (routine_id,date)`; গ্রহণ-প্রবাহ; ছুটিতে থাকা শিক্ষক বদলি হতে পারে না |
| `StudentLeaveTest` | বয়স-নিয়ম; আবেদনকারী শুধু নিজের সন্তান; অনুমোদনে হাজিরা default `leave` ও SMS নেই; সনদ private URL |
| `MarksLockTest` | জমা → lock; শিক্ষক 403; Admin আনলক কারণসহ; deadline-রিমাইন্ডার tenant-নিরাপদ (`Tenancy::each`) |
(নাম `docs/TESTING.md`-এ)

## ৯. Done When
- [ ] ৩০/৩০/৪০ ওজনের একটি পূর্ণ demo (school): compute → preview → publish → Tabulation PDF ও অভিভাবক-পোর্টাল; হাতে-হিসাবের সাথে মেলে
- [ ] বকেয়া-আটকানো চালু করলে একটি ছাত্রের admit card আটকে কারণসহ দেখায়, exemption দিলে খোলে
- [ ] একই শিক্ষকের দুই ওভারল্যাপিং period সংরক্ষণ 422; বদলি-প্রবাহ শেষ পর্যন্ত
- [ ] অনুমোদিত ছুটিতে হাজিরা default `leave` ও অনুপস্থিত-SMS নেই
- [ ] marks জমা → lock → আনলক (কারণসহ) audit-এ


## D99 request receipt and history boundary (design only)

D99 narrowly extends D98's design-only pair to `leave_substitution_operations`, `leave_substitution_slots`, `leave_substitution_events`. Operation receipts record successful request identity and a relational result manifest; slots record current dated occurrence state; events retain non-null slot/version history and tenant/actor-bound operation linkage. See `docs/API.md` D99 for canonical digest, atomic fan-out, zero-slot success, replay/privacy, retention and export gates. Existing weekly routine and legacy non-leave substitutions remain unchanged. Cancellation/replacement does not erase history or change payroll. The receipt is not durable notification intent storage. No implementation, task activation or dependency acceptance follows; exact action/event/version mapping and delivery remain gated.


## D96 slot event mapping and materialization gate (design only)

The six existing-slot actions and exact future paths/keys/preconditions are specified in the D96 sections of `docs/API.md` and `docs/AUTHORIZATION.md`. They refine D99 receipt semantics, without runtime exposure. Nomination is pending-only advisory; reviewer offers need approved leave; target acceptance alone confirms; decline/clear returns a gap. `nomination_set`, `nomination_cleared`, `offer_created`, `cover_replaced`, `cover_cleared`, `offer_accepted`, `offer_declined` already exist in canonical event_type. Each changed slot gets one final event/version per operation; a confirmed replacement uses cover_replaced, not two events with one version. Same-state advisory no-op emits no event but still gets a receipt. Period start is an absolute cutoff for these public mutations.

Leave rejection maps changed live slots to cancelled/leave_rejected; D85 cancellation to cancelled/leave_cancelled; future routine/block/source or original-Teacher eligibility invalidation to cancelled/source_invalidated (reason_code distinguishes routine_changed, block_changed, teacher_inactive or identity_changed). Target-only eligibility loss clears an otherwise valid future slot to unassigned/source_invalidated with reason_code target_inactive or target_identity_changed; it does not cancel the applicant leave. Substitute's later approved leave clears incompatible future target to unassigned/substitute_leave_invalidated while preserving the original applicant leave. Invalidating writer is the actor of the operation; background execution requires an approved actor attribution and durable intent contract before activation. No scheduler/system-user invention here.

Initial slot materialization, approved nomination-to-offer/gap reconciliation, whole affected-set preconditions and cancel/reapply reuse of unique routine/date remain unresolved design gates. Current enum has no dedicated creation event; do not misuse an invalidation event to fabricate creation history or silently add an enum. Exact closure may require a D96 design-only schema refinement, retaining D99 tooling gates. Invalid nomination at leave approval must not become a confirmed cover; exact gap-versus-action-error policy still needs explicit resolution before implementation. Generic historical Admin substitution routes and generated F.* drafts cannot supply these missing contracts.


## D96/D99 lifecycle refinement after slot-action checkpoint

This section supersedes the earlier pending gate only for initial future-slot creation, reviewed approval/gap behavior and D85 cancel/reapply. Exact integrated request/receipt/scope semantics are in `docs/API.md`. Owner-finalized P2 already requires invalid nomination not to discard valid leave data; P3 already requires a newly conflicting nominee to leave a gap with reviewer-visible reason while leave can approve. Neither needs a new policy decision. Valid leave creation materializes unassigned future source slots, then separate nomination actions may follow. No invented past coverage or automatic nomination-to-offer conversion.

Canonical slot_created plus non-null event result_status records initialization at version1. Approval materializes/reconciles each affected slot to one final version/event; leave_approved records an unchanged gap's changed leave prerequisite, offer_created records an explicit reviewed offer, nomination_cleared records a reviewed gap from a nomination. No approval confirms a target. Substitute-leave approval can clear other applicant covers with substitute_leave_invalidated in the same operation, without cancelling their leaves. Receipt's nullable initiating leave link recovers zero-slot leave identity and does not constrain multi-leave child history.

Each leave cycle owns distinct slot IDs under per-leave/routine/date uniqueness; cancel/reapply preserves terminal old rows, original snapshots, immutable events and old receipt manifests. Cross-leave active-occurrence exclusion is a service invariant under the common institution lock, not implied by this unique key. Source-invalidated same-leave refresh, fully reviewed source/department binding and delivery remain gated. No migration/backfill, runtime, UI, executable task or dependency acceptance.
