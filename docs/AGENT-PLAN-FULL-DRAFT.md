# AGENT PLAN — সম্পূর্ণ প্রকাশ: খসড়া কাজ-তালিকা (শুধু যেসব মডিউলের পূর্ণ পরিকল্পনা নেই)

> **এটি খসড়া — এখনই বানানোর নির্দেশ নয়।** স্বয়ংক্রিয় তৈরি: `python3 infra/spec-verify/gen_full_release.py .`। `docs/RELEASE-FULL.md` পড়ুন। পূর্ণ পরিকল্পনা আছে শুধু `docs/AGENT-PLAN-R1.md` (M1) ও `docs/AGENT-PLAN-R3.md` (M4)-এর।
> **কেন খসড়া:** প্রতিটির "শেষ-শর্ত" সাধারণ; টেবিল-তালিকা ও পরীক্ষার নাম মডিউল-ধরে নির্দিষ্ট করা হয়নি (একাধিক মডিউল একই স্পেক-নথি ভাগ করে)। **এজেন্ট এগুলো বানাবে না**: গার্ড (`C9`) এই `F.*` আইডি চেনে না, তাই commit আটকায়। ধাপ শুরুর আগে মালিকের সাথে পরিশীলন করে R3-এর ধাঁচে `rN-scope.json`-এ রূপান্তর করতে হবে (`RELEASE-FULL.md` §৭)।


## M1 — ভিত্তি ও চারটি অপরিহার্য ফিচার (রিলিজ R1; পরিকল্পনা: task-plan)

পূর্ণ পরিকল্পনা আছে: `docs/AGENT-PLAN-R1.md`। এখানে নতুন কিছু নেই।


## M2 — প্রথম সংস্করণের পরপর: নোটিশ, খরচ, রুটিন, ID কার্ড, সহায়তা (রিলিজ R1.1; পরিকল্পনা: draft)

### DRAFT `F.M2.1` — ID কার্ড (মডিউল `id_cards`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `students` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/extended-features.md`, `docs/modules/pdf-reports.md`
- **route:** মডিউল-গেটেড route নেই। ফিচার-প্রমাণে কিছু route/controller আছে (নিচে)।
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] ছাত্রের ID কার্ড  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] একসাথে পুরো শাখার ID কার্ড ছাপা  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] ছাত্র-প্রোফাইল-কার্ড  <sub>প্রমাণ: `route:GET /students/{id}/card`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M2.2` — মেধা-তালিকা ও ফল-SMS (মডিউল `merit_list`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `exams` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/coaching-private-batch.md`
- **route:** মডিউল-গেটেড route নেই। ফিচার-প্রমাণে কিছু route/controller আছে (নিচে)।
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] পরীক্ষার মেধা-তালিকা  <sub>প্রমাণ: `route:GET /exams/{id}/merit-list`</sub>
  - [ ] ফলাফল অভিভাবককে SMS-এ জানানো  <sub>প্রমাণ: `doc:coaching-private-batch.md`</sub>
  - [ ] কোচিং সেন্টারের জন্য ব্যাচ-ভিত্তিক মেধা-ক্রম  <sub>প্রমাণ: `doc:coaching-private-batch.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M2.3` — নোটিশ ও বিজ্ঞপ্তি (মডিউল `notices`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `students` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং, ব্যাচ · **গেট:** `core`
- **পড়ুন:** `docs/modules/notifications.md`
- **route (মডিউল-গেটেড, ২):**

```
GET /notices/{id}/receipts -> NoticeAckController@receipts [role:admin,teacher]
POST /notices/{id}/remind-missing -> NoticeAckController@remindMissing [role:admin,teacher]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৫):**
  - [ ] নোটিশ প্রকাশ (সবাই বা নির্দিষ্ট শ্রেণি/শাখা)  <sub>প্রমাণ: `route:POST /notices`</sub>
  - [ ] নোটিশের তালিকা, সম্পাদনা, মোছা  <sub>প্রমাণ: `route:GET /notices`</sub>
  - [ ] কে নোটিশ দেখেছে তার তালিকা  <sub>প্রমাণ: `route:GET /notices/{id}/receipts`</sub>
  - [ ] যারা দেখেনি তাদের স্মরণ করানো  <sub>প্রমাণ: `route:POST /notices/{id}/remind-missing`</sub>
  - [ ] শিক্ষক-অভিভাবক সরাসরি বার্তা  <sub>প্রমাণ: `route:GET /messages`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M2.4` — ক্লাস-রুটিন (মডিউল `routine`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `enrollments` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/routine.md`, `docs/modules/teacher-subjects.md`
- **route (মডিউল-গেটেড, ১০):**

```
GET /routines -> RoutineController@index [role:admin]
POST /routines -> RoutineController@store [role:admin]
GET /routines/{id} -> RoutineController@show [role:admin]
PUT /routines/{id} -> RoutineController@update [role:admin]
DELETE /routines/{id} -> RoutineController@destroy [role:admin]
GET /routines/{batchId}/print -> RoutineController@print [role:admin]
GET /routine-blocks -> RoutineBlockController@index [role:admin]
POST /routine-blocks -> RoutineBlockController@store [role:admin]
PUT /routine-blocks/{id} -> RoutineBlockController@update [role:admin]
DELETE /routine-blocks/{id} -> RoutineBlockController@destroy [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৬):**
  - [ ] শাখা-ভিত্তিক ক্লাস-রুটিন তৈরি  <sub>প্রমাণ: `route:POST /routines`</sub>
  - [ ] পিরিয়ড/সময়-ব্লক ঠিক করা  <sub>প্রমাণ: `route:POST /routine-blocks`</sub>
  - [ ] একই শিক্ষক বা কক্ষ দুই জায়গায় পড়লে আগেই সংঘর্ষ ধরা  <sub>প্রমাণ: `doc:academics-advanced.md`</sub>
  - [ ] রুটিন ছাপা  <sub>প্রমাণ: `route:GET /routines/{batchId}/print`</sub>
  - [ ] শিক্ষকের আজকের রুটিন  <sub>প্রমাণ: `route:GET /teacher/routine/today`</sub>
  - [ ] ছাত্র নিজের রুটিন দেখে  <sub>প্রমাণ: `route:GET /student/routine`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M2.5` — সহায়তা (মডিউল `support`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং, ব্যাচ · **গেট:** `core`
- **পড়ুন:** `docs/modules/platform-ops.md`
- **route (মডিউল-গেটেড, ৪):**

```
GET /support/tickets -> SupportTicketController@index [role:admin]
POST /support/tickets -> SupportTicketController@store [role:admin]
GET /support/tickets/{id} -> SupportTicketController@show [role:admin]
POST /support/tickets/{id}/{action} -> SupportTicketController@transition [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] সহায়তা-অনুরোধ (টিকিট) খোলা ও অনুসরণ  <sub>প্রমাণ: `ctrl:SupportTicketController`</sub>
  - [ ] অনুরোধের উত্তর ও অবস্থা জানা  <sub>প্রমাণ: `ctrl:SupportTicketController`</sub>
  - [ ] সহায়তা-কর্মী আপনার অনুমতি নিয়ে সীমিত সময়ের জন্য আপনার পাতা দেখে সমস্যা ধরতে পারেন — অনুমতি ও সময় আপনার হাতে  <sub>প্রমাণ: `ctrl:ImpersonationController`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** কিছু ফিচারের ধাপ অনির্ধারিত


## M3 — প্রতিষ্ঠান-গভীরতা: ফল, ভর্তি, অনলাইন-পেমেন্ট, ওয়েবসাইট, একাডেমিক-উন্নত (রিলিজ R2; পরিকল্পনা: draft)

### DRAFT `F.M3.1` — শিক্ষা-ক্যালেন্ডার (মডিউল `academic_calendar`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/academic-calendar.md`
- **route (মডিউল-গেটেড, ৪):**

```
POST /exams/{id}/seat-plan/generate -> ExamController@generateSeatPlan [role:admin]
GET /exams/{id}/seat-plan -> ExamController@seatPlan [role:admin]
PUT /exams/{id}/seat-plan/{studentId} -> ExamController@adjustSeat [role:admin]
GET /exams/{id}/seat-plan/print -> ExamController@printSeatPlan [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৭):**
  - [ ] শিক্ষাবর্ষ তৈরি ও ব্যবস্থাপনা  <sub>প্রমাণ: `doc:academic-calendar.md`</sub>
  - [ ] ছুটির তালিকা (সরকারি ও প্রতিষ্ঠানের)  <sub>প্রমাণ: `doc:academic-calendar.md`</sub>
  - [ ] প্রতিষ্ঠানের ক্যালেন্ডার-পাতা  <sub>প্রমাণ: `doc:academic-calendar.md`</sub>
  - [ ] পরীক্ষার আসন-বিন্যাস (seat plan) তৈরি  <sub>প্রমাণ: `route:POST /exams/{id}/seat-plan/generate`</sub>
  - [ ] আসন হাতে বদলানো  <sub>প্রমাণ: `route:PUT /exams/{id}/seat-plan/{studentId}`</sub>
  - [ ] আসন-বিন্যাস ছাপা  <sub>প্রমাণ: `route:GET /exams/{id}/seat-plan/print`</sub>
  - [ ] ছাত্রের নথি (জন্মনিবন্ধন ইত্যাদি) সংরক্ষণ  <sub>প্রমাণ: `doc:academic-calendar.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M3.2` — প্রবেশপত্র (মডিউল `admit_card`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** `exams` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/advanced-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] পরীক্ষার প্রবেশপত্র তৈরি (একসাথে পুরো শাখার)  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] ছাত্র নিজে প্রবেশপত্র দেখে ও ডাউনলোড করে  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] A5 আকারে ছাপা  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M3.3` — সনদ ও প্রত্যয়নপত্র (মডিউল `certificates`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] সনদ ও প্রত্যয়নপত্র তৈরি  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] সনদ ডাউনলোড ও ছাপা  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] একসাথে অনেক ছাত্রের সনদ  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M3.4` — ফি কিস্তিতে (মডিউল `fee_installment`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** `fees` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `plan`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] ফি কিস্তি-পরিকল্পনা তৈরি  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] কিস্তি আদায়  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] অতিদেয় কিস্তির তালিকা  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M3.5` — হিফজ ও মাদ্রাসা-সুবিধা (মডিউল `hifz`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `enrollments` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `opt-in`
- **পড়ুন:** `docs/modules/madrasa.md`
- **route (মডিউল-গেটেড, ৭):**

```
GET /hifz/records -> HifzController@index [role:admin,teacher]
POST /hifz/records -> HifzController@store [role:admin,teacher]
PUT /hifz/records/{id} -> HifzController@update [role:admin,teacher]
DELETE /hifz/records/{id} -> HifzController@destroy [role:admin,teacher]
GET /hifz/students/{id}/progress -> HifzController@progress [role:admin,teacher]
GET /hifz/batches/{id}/overview -> HifzController@overview [role:admin,teacher]
GET /hifz/reports/monthly.pdf -> HifzController@monthlyReport [role:admin,teacher]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৬):**
  - [ ] হিফজ-রেকর্ড (সবক, সবকী, মানযিল)  <sub>প্রমাণ: `route:POST /hifz/records`</sub>
  - [ ] ছাত্রের অগ্রগতি  <sub>প্রমাণ: `route:GET /hifz/students/{id}/progress`</sub>
  - [ ] শাখার সার্বিক চিত্র  <sub>প্রমাণ: `route:GET /hifz/batches/{id}/overview`</sub>
  - [ ] মাসিক প্রতিবেদন PDF  <sub>প্রমাণ: `route:GET /hifz/reports/monthly.pdf`</sub>
  - [ ] হিজরি ক্যালেন্ডার  <sub>প্রমাণ: `doc:madrasa.md`</sub>
  - [ ] নামের সাথে আরবি নাম (সনদ/ID-তে)  <sub>প্রমাণ: `doc:madrasa.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.6` — বাড়ির কাজ (মডিউল `homework`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `enrollments` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route (মডিউল-গেটেড, ৫):**

```
GET /homework -> HomeworkController@index [role:teacher]
POST /homework -> HomeworkController@store [role:teacher]
GET /homework/{id} -> HomeworkController@show [role:teacher]
PUT /homework/{id} -> HomeworkController@update [role:teacher]
DELETE /homework/{id} -> HomeworkController@destroy [role:teacher]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৬):**
  - [ ] বাড়ির কাজ দেওয়া (শ্রেণি/শাখা ধরে)  <sub>প্রমাণ: `route:POST /homework`</sub>
  - [ ] বাড়ির কাজের তালিকা ও সম্পাদনা  <sub>প্রমাণ: `route:GET /homework`</sub>
  - [ ] ছাত্র ফাইল আকারে জমা দেয়  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] শিক্ষক জমা দেখে নম্বর দেন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] পাঠ-সামগ্রী (নোট, ফাইল) আপলোড  <sub>প্রমাণ: `route:POST /materials`</sub>
  - [ ] শিক্ষক-অভিভাবক বার্তা  <sub>প্রমাণ: `route:POST /messages`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.7` — ভর্তিচ্ছুদের তালিকা (মডিউল `leads`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/coaching-private-batch.md`, `docs/modules/public-website.md`
- **route (মডিউল-গেটেড, ৬):**

```
GET /leads -> LeadController@index [role:admin]
POST /leads -> LeadController@store [role:admin]
GET /leads/{id} -> LeadController@show [role:admin]
PUT /leads/{id} -> LeadController@update [role:admin]
DELETE /leads/{id} -> LeadController@destroy [role:admin]
POST /leads/{id}/convert -> LeadController@convert [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] ভর্তিতে আগ্রহীদের তালিকা (ফোন, শ্রেণি, উৎস)  <sub>প্রমাণ: `route:POST /leads`</sub>
  - [ ] তালিকা খোঁজা ও সম্পাদনা  <sub>প্রমাণ: `route:GET /leads`</sub>
  - [ ] আগ্রহীকে ছাত্রে রূপান্তর  <sub>প্রমাণ: `route:POST /leads/{id}/convert`</sub>
  - [ ] লিড মোছা  <sub>প্রমাণ: `route:DELETE /leads/{id}`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.8` — অনলাইন ফি-পেমেন্ট (মডিউল `online_payment`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `fees` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং, ব্যাচ · **গেট:** `core`
- **পড়ুন:** `docs/modules/banglaqr-readiness.md`, `docs/modules/online-fee-payment.md`, `docs/modules/payment-gateways.md`
- **route (মডিউল-গেটেড, ৬):**

```
GET /admin/payments -> AdminOnlinePaymentController@index [role:admin,accountant]
GET /admin/payments/settlements -> AdminOnlinePaymentController@settlements [role:admin,accountant]
GET /admin/payments/{id} -> AdminOnlinePaymentController@show [role:admin,accountant]
GET /parent/fees/payment-options -> FeePaymentController@options [role:parent]
POST /fees/payment/{gateway}/create -> FeePaymentController@create [role:parent]
GET /parent/online-payments/{ref} -> FeePaymentController@status [role:parent]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৮):**
  - [ ] অভিভাবক অনলাইনে ফি দেন (bKash, কার্ড, ব্যাংক ইত্যাদি গেটওয়ে)  <sub>প্রমাণ: `route:POST /fees/payment/{gateway}/create`</sub>
  - [ ] কোন মাধ্যমে দেওয়া যাবে তার তালিকা  <sub>প্রমাণ: `route:GET /parent/fees/payment-options`</sub>
  - [ ] পেমেন্টের অবস্থা জানা  <sub>প্রমাণ: `route:GET /parent/online-payments/{ref}`</sub>
  - [ ] পেমেন্ট সফল হলে স্বয়ংক্রিয় রসিদ ও বকেয়া মিলকরণ  <sub>প্রমাণ: `ctrl:FeePaymentCallbackController`</sub>
  - [ ] প্রশাসকের অনলাইন-পেমেন্টের তালিকা  <sub>প্রমাণ: `route:GET /admin/payments`</sub>
  - [ ] প্রতিষ্ঠানের হিসাবে নিষ্পত্তি (settlement) ও তার প্রতিবেদন  <sub>প্রমাণ: `route:GET /admin/payments/settlements`</sub>
  - [ ] সন্দেহজনক বা আটকে-থাকা পেমেন্ট পর্যালোচনা  <sub>প্রমাণ: `doc:online-fee-payment.md`</sub>
  - [ ] বাংলা QR-এ পরিশোধ  <sub>প্রমাণ: `doc:banglaqr-readiness.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M3.9` — পিরিয়ড-ভিত্তিক হাজিরা (মডিউল `period_attendance`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `attendance` (পূর্ণ পরিকল্পনায়), `routine`
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/academics-advanced.md`
- **route (মডিউল-গেটেড, ৩):**

```
GET /teacher/periods/today -> PeriodAttendanceController@today [role:admin,teacher]
POST /period-attendance -> PeriodAttendanceController@store [role:admin,teacher]
GET /period-attendance/report -> PeriodAttendanceController@report [role:admin,teacher]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] শিক্ষকের আজকের পিরিয়ড-তালিকা  <sub>প্রমাণ: `route:GET /teacher/periods/today`</sub>
  - [ ] পিরিয়ড বা বিষয় ধরে হাজিরা  <sub>প্রমাণ: `route:POST /period-attendance`</sub>
  - [ ] পিরিয়ড-হাজিরার প্রতিবেদন  <sub>প্রমাণ: `route:GET /period-attendance/report`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.10` — শ্রেণি-উত্তরণ ও ছাড়পত্র (মডিউল `promotion_tc`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/academic-sessions.md`, `docs/modules/promotion-tc.md`
- **route (মডিউল-গেটেড, ২):**

```
POST /students/{id}/transfer -> StudentController@issueTC [role:admin]
POST /students/promote -> StudentController@promote [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] পুরো শ্রেণির ছাত্র একসাথে পরের শ্রেণিতে উত্তরণ  <sub>প্রমাণ: `route:POST /students/promote`</sub>
  - [ ] অন্য প্রতিষ্ঠানে বদলি  <sub>প্রমাণ: `route:POST /students/{id}/transfer`</sub>
  - [ ] ছাড়পত্র (TC) তৈরি ও ছাপা  <sub>প্রমাণ: `doc:promotion-tc.md`</sub>
  - [ ] সনদ ও ছাড়পত্রে QR — যে কেউ আসল কি না যাচাই করতে পারে  <sub>প্রমাণ: `doc:quick-wins.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M3.11` — চূড়ান্ত ফলাফল ও Tabulation Sheet (মডিউল `result_sheets`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `exams` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/academics-advanced.md`
- **route (মডিউল-গেটেড, ১১):**

```
GET /result-sheets -> ResultSheetController@index [role:admin,teacher]
POST /result-sheets -> ResultSheetController@store [role:admin,teacher]
GET /result-sheets/{id} -> ResultSheetController@show [role:admin,teacher]
PUT /result-sheets/{id} -> ResultSheetController@update [role:admin,teacher]
DELETE /result-sheets/{id} -> ResultSheetController@destroy [role:admin,teacher]
POST /result-sheets/{id}/compute -> ResultSheetController@compute [role:admin,teacher]
GET /result-sheets/{id}/preview -> ResultSheetController@preview [role:admin,teacher]
POST /result-sheets/{id}/publish -> ResultSheetController@publish [role:admin]
POST /result-sheets/{id}/new-version -> ResultSheetController@newVersion [role:admin]
GET /result-sheets/{id}/tabulation.pdf -> ResultSheetController@tabulation [role:admin,teacher]
GET /result-sheets/{id}/export.xlsx -> ResultSheetController@export [role:admin,teacher]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৬):**
  - [ ] একাধিক পরীক্ষা মিলিয়ে ওজন দিয়ে চূড়ান্ত ফলাফলের নিয়ম তৈরি  <sub>প্রমাণ: `route:POST /result-sheets`</sub>
  - [ ] নিয়ম অনুযায়ী ফলাফল হিসাব  <sub>প্রমাণ: `route:POST /result-sheets/{id}/compute`</sub>
  - [ ] প্রকাশের আগে প্রিভিউ  <sub>প্রমাণ: `route:GET /result-sheets/{id}/preview`</sub>
  - [ ] চূড়ান্ত ফলাফল প্রকাশ  <sub>প্রমাণ: `route:POST /result-sheets/{id}/publish`</sub>
  - [ ] প্রকাশের পর সংশোধন — নতুন সংস্করণ হিসেবে, পুরনোটি সংরক্ষিত  <sub>প্রমাণ: `route:POST /result-sheets/{id}/new-version`</sub>
  - [ ] Tabulation Sheet PDF  <sub>প্রমাণ: `route:GET /result-sheets/{id}/tabulation.pdf`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.12` — ঝুঁকি-সতর্কতা (মডিউল `risk_alerts`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `attendance` (পূর্ণ পরিকল্পনায়), `exams` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/risk-alerts.md`
- **route (মডিউল-গেটেড, ৬):**

```
GET /risk/flags -> RiskController@index [role:admin,teacher]
GET /risk/students/{id} -> RiskController@student [role:admin,teacher]
POST /risk/flags/{id}/{action} -> RiskController@transition [role:admin,teacher]
GET /risk/settings -> RiskController@settings [role:admin]
PUT /risk/settings -> RiskController@updateSettings [role:admin]
POST /risk/evaluate -> RiskController@evaluate [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৫):**
  - [ ] ঝুঁকিপূর্ণ ছাত্রের তালিকা (ঘন ঘন অনুপস্থিত, ফলে পিছিয়ে-পড়া)  <sub>প্রমাণ: `route:GET /risk/flags`</sub>
  - [ ] একজন ছাত্রের ঝুঁকির কারণ বিশ্লেষণ  <sub>প্রমাণ: `route:GET /risk/students/{id}`</sub>
  - [ ] শিক্ষক ব্যবস্থা নিয়ে সতর্কতা নিষ্পত্তি করেন  <sub>প্রমাণ: `route:POST /risk/flags/{id}/{action}`</sub>
  - [ ] কতটা অনুপস্থিতিতে সতর্কতা — প্রতিষ্ঠান নিজে সীমা ঠিক করে  <sub>প্রমাণ: `route:PUT /risk/settings`</sub>
  - [ ] যেকোনো সময় নতুন করে মূল্যায়ন  <sub>প্রমাণ: `route:POST /risk/evaluate`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.13` — ছাত্রের ছুটির আবেদন (মডিউল `student_leave`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `attendance` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং, ব্যাচ · **গেট:** `core`
- **পড়ুন:** `docs/modules/academics-advanced.md`
- **route (মডিউল-গেটেড, ৪):**

```
POST /parent/children/{id}/leave-requests -> StudentLeaveController@store [role:parent]
GET /parent/leave-requests -> StudentLeaveController@mine [role:parent]
GET /leave-requests/students -> StudentLeaveController@index [role:admin,teacher]
PATCH /leave-requests/students/{id} -> StudentLeaveController@decide [role:admin,teacher]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] অভিভাবক অ্যাপ/পোর্টাল থেকে ছুটির আবেদন করেন  <sub>প্রমাণ: `route:POST /parent/children/{id}/leave-requests`</sub>
  - [ ] অভিভাবক নিজের আবেদনগুলোর অবস্থা দেখেন  <sub>প্রমাণ: `route:GET /parent/leave-requests`</sub>
  - [ ] শিক্ষক/প্রশাসক আবেদনের তালিকা দেখেন  <sub>প্রমাণ: `route:GET /leave-requests/students`</sub>
  - [ ] আবেদন অনুমোদন বা বাতিল  <sub>প্রমাণ: `route:PATCH /leave-requests/students/{id}`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.14` — সিলেবাস ও পাঠ-পরিকল্পনা (মডিউল `syllabus`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `enrollments` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং, ব্যাচ · **গেট:** `core`
- **পড়ুন:** `docs/modules/syllabus.md`
- **route (মডিউল-গেটেড, ১৬):**

```
GET /syllabus/units -> SyllabusUnitController@index [role:admin,teacher]
POST /syllabus/units -> SyllabusUnitController@store [role:admin,teacher]
PUT /syllabus/units/{id} -> SyllabusUnitController@update [role:admin,teacher]
DELETE /syllabus/units/{id} -> SyllabusUnitController@destroy [role:admin,teacher]
POST /syllabus/units/clone -> SyllabusUnitController@clone [role:admin,teacher]
POST /syllabus/units/import -> SyllabusUnitController@import [role:admin,teacher]
POST /syllabus/coverage -> SyllabusCoverageController@store [role:admin,teacher]
DELETE /syllabus/coverage -> SyllabusCoverageController@destroy [role:admin,teacher]
GET /syllabus/coverage -> SyllabusCoverageController@index [role:admin,teacher]
GET /syllabus/overview -> SyllabusCoverageController@overview [role:admin,teacher]
GET /syllabus/behind -> SyllabusCoverageController@behind [role:admin,teacher]
GET /lesson-plans -> LessonPlanController@index [role:admin,teacher]
POST /lesson-plans -> LessonPlanController@store [role:admin,teacher]
PUT /lesson-plans/{id} -> LessonPlanController@update [role:admin,teacher]
DELETE /lesson-plans/{id} -> LessonPlanController@destroy [role:admin,teacher]
POST /lesson-plans/{id}/{state} -> LessonPlanController@mark [role:admin,teacher]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৮):**
  - [ ] বিষয়-ভিত্তিক সিলেবাসের ইউনিট তৈরি  <sub>প্রমাণ: `route:POST /syllabus/units`</sub>
  - [ ] আগের বছরের সিলেবাস কপি  <sub>প্রমাণ: `route:POST /syllabus/units/clone`</sub>
  - [ ] Excel থেকে সিলেবাস আমদানি  <sub>প্রমাণ: `route:POST /syllabus/units/import`</sub>
  - [ ] শিক্ষক কোন ইউনিট কতটা পড়ালেন তা চিহ্নিত করা  <sub>প্রমাণ: `route:POST /syllabus/coverage`</sub>
  - [ ] সিলেবাস কতটা শেষ হলো — সারসংক্ষেপ  <sub>প্রমাণ: `route:GET /syllabus/overview`</sub>
  - [ ] কোন শাখা পিছিয়ে আছে তা ধরা  <sub>প্রমাণ: `route:GET /syllabus/behind`</sub>
  - [ ] পাঠ-পরিকল্পনা তৈরি  <sub>প্রমাণ: `route:POST /lesson-plans`</sub>
  - [ ] পাঠ-পরিকল্পনা জমা ও অনুমোদন-ধাপ  <sub>প্রমাণ: `route:POST /lesson-plans/{id}/{state}`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.15` — শিক্ষকের প্রতি-ক্লাস পারিশ্রমিক (মডিউল `teacher_payouts`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `attendance` (পূর্ণ পরিকল্পনায়), `fees` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/coaching-private-batch.md`
- **route (মডিউল-গেটেড, ৫):**

```
GET /teacher-payouts -> TeacherPayoutController@index [role:admin]
POST /teacher-payouts/generate -> TeacherPayoutController@generate [role:admin]
PUT /teacher-payouts/{id} -> TeacherPayoutController@update [role:admin]
POST /teacher-payouts/{id}/approve -> TeacherPayoutController@approve [role:admin]
POST /teacher-payouts/{id}/pay -> TeacherPayoutController@pay [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৫):**
  - [ ] কোচিং: ক্লাস বা ব্যাচ-ভিত্তিক শিক্ষক-পারিশ্রমিক গণনা  <sub>প্রমাণ: `route:POST /teacher-payouts/generate`</sub>
  - [ ] গণনা সংশোধন  <sub>প্রমাণ: `route:PUT /teacher-payouts/{id}`</sub>
  - [ ] অনুমোদন  <sub>প্রমাণ: `route:POST /teacher-payouts/{id}/approve`</sub>
  - [ ] পরিশোধ  <sub>প্রমাণ: `route:POST /teacher-payouts/{id}/pay`</sub>
  - [ ] পারিশ্রমিকের তালিকা  <sub>প্রমাণ: `route:GET /teacher-payouts`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.16` — ভর্তি-চক্র (মডিউল `admission_cycle`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `leads`
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `core`
- **পড়ুন:** `docs/modules/admission-cycle.md`
- **route (মডিউল-গেটেড, ১১):**

```
GET /public/admission/status -> PublicAdmissionStatusController@status
GET /public/admission/cycle/{id}/transparency -> PublicAdmissionStatusController@transparency
GET /admission/cycles -> AdmissionCycleController@index [role:admin]
POST /admission/cycles -> AdmissionCycleController@store [role:admin]
GET /admission/cycles/{id} -> AdmissionCycleController@show [role:admin]
PUT /admission/cycles/{id} -> AdmissionCycleController@update [role:admin]
POST /admission/cycles/{id}/{action} -> AdmissionCycleController@transition [role:admin]
POST /admission/cycles/{id}/test-marks -> AdmissionCycleController@testMarks [role:admin]
POST /admission/cycles/{id}/list/{mode} -> AdmissionCycleController@list [role:admin]
GET /admission/cycles/{id}/draw -> AdmissionCycleController@draw [role:admin]
POST /admission/leads/{id}/{action} -> AdmissionLeadActionController@act [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৮):**
  - [ ] ভর্তি-চক্র তৈরি (সময়, আসন, শর্ত)  <sub>প্রমাণ: `route:POST /admission/cycles`</sub>
  - [ ] আবেদন গ্রহণ শুরু ও বন্ধ  <sub>প্রমাণ: `route:POST /admission/cycles/{id}/{action}`</sub>
  - [ ] ভর্তি-পরীক্ষার নম্বর তোলা  <sub>প্রমাণ: `route:POST /admission/cycles/{id}/test-marks`</sub>
  - [ ] মেধা-তালিকা ও অপেক্ষমান তালিকা তৈরি  <sub>প্রমাণ: `route:POST /admission/cycles/{id}/list/{mode}`</sub>
  - [ ] যাচাইযোগ্য লটারি  <sub>প্রমাণ: `route:GET /admission/cycles/{id}/draw`</sub>
  - [ ] অভিভাবকের জন্য স্বচ্ছতা-পাতা — কীভাবে নির্বাচন হলো  <sub>প্রমাণ: `route:GET /public/admission/cycle/{id}/transparency`</sub>
  - [ ] আবেদনকারী নিজের আবেদনের অবস্থা জানেন  <sub>প্রমাণ: `route:GET /public/admission/status`</sub>
  - [ ] নির্বাচিত আবেদনকারীকে ছাত্রে রূপান্তর  <sub>প্রমাণ: `route:POST /admission/leads/{id}/{action}`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.17` — প্রতিষ্ঠানের ওয়েবসাইট (মডিউল `public_site`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `leads`
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং, ব্যাচ · **গেট:** `core`
- **পড়ুন:** `docs/modules/public-website.md`
- **route (মডিউল-গেটেড, ১৪):**

```
GET /public/site -> PublicSiteController@show
GET /public/notices -> PublicSiteController@notices
POST /public/admission -> PublicAdmissionController@store
GET /public/gallery -> GalleryController@albums
GET /public/gallery/{album_id} -> GalleryController@items
GET /public/news -> NewsController@index
GET /public/news/{slug} -> NewsController@show
GET /public/pages/{slug} -> SitePageController@show
GET /public/teachers -> PublicTeacherController@index
GET /public/events -> PublicEventController@index
POST /public/admission/{lead_id}/pay -> PublicAdmissionPayController@pay
GET /admin/settings/website -> WebsiteSettingsController@show [role:admin]
PUT /admin/settings/website -> WebsiteSettingsController@update [role:admin]
POST /admin/settings/website/hero -> WebsiteSettingsController@hero [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (১২):**
  - [ ] প্রতিষ্ঠানের নিজস্ব পাবলিক ওয়েবসাইট  <sub>প্রমাণ: `route:GET /public/site`</sub>
  - [ ] ওয়েবসাইটে প্রকাশ্য নোটিশ  <sub>প্রমাণ: `route:GET /public/notices`</sub>
  - [ ] খবর ও ঘোষণা  <sub>প্রমাণ: `route:GET /public/news`</sub>
  - [ ] ফটো-গ্যালারি  <sub>প্রমাণ: `route:GET /public/gallery`</sub>
  - [ ] নিজের পাতা (আমাদের সম্পর্কে ইত্যাদি)  <sub>প্রমাণ: `route:GET /public/pages/{slug}`</sub>
  - [ ] শিক্ষক-পরিচিতি  <sub>প্রমাণ: `route:GET /public/teachers`</sub>
  - [ ] প্রকাশ্য অনুষ্ঠান-ক্যালেন্ডার  <sub>প্রমাণ: `route:GET /public/events`</sub>
  - [ ] অনলাইন ভর্তি-ফর্ম  <sub>প্রমাণ: `route:POST /public/admission`</sub>
  - [ ] ভর্তি-ফি অনলাইনে পরিশোধ  <sub>প্রমাণ: `route:POST /public/admission/{lead_id}/pay`</sub>
  - [ ] ওয়েবসাইটের ব্যানার ও সেটিং  <sub>প্রমাণ: `route:PUT /admin/settings/website`</sub>
  - [ ] নিজস্ব ডোমেইন (যেমন yourschool.edu.bd) সংযোগ  <sub>প্রমাণ: `ctrl:DomainController`</sub>
  - [ ] সার্চ-ইঞ্জিনের জন্য SEO  <sub>প্রমাণ: `doc:public-website-plus.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M3.18` — বদলি শিক্ষক (মডিউল `substitution`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `routine`, `period_attendance`
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/academics-advanced.md`
- **route (মডিউল-গেটেড, ৬):**

```
GET /substitutions/needed -> SubstitutionController@needed [role:admin]
GET /substitutions -> SubstitutionController@index [role:admin]
POST /substitutions -> SubstitutionController@store [role:admin]
PUT /substitutions/{id} -> SubstitutionController@update [role:admin]
DELETE /substitutions/{id} -> SubstitutionController@destroy [role:admin]
GET /routines/available-teachers -> SubstitutionController@availableTeachers [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] কোন ক্লাসে বদলি লাগবে তার তালিকা  <sub>প্রমাণ: `route:GET /substitutions/needed`</sub>
  - [ ] বদলি শিক্ষক ঠিক করা  <sub>প্রমাণ: `route:POST /substitutions`</sub>
  - [ ] ওই সময়ে কোন শিক্ষক ফাঁকা তা দেখা  <sub>প্রমাণ: `route:GET /routines/available-teachers`</sub>
  - [ ] বদলি সম্পাদনা বা বাতিল  <sub>প্রমাণ: `route:PUT /substitutions/{id}`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)


## M4 — টাকা ও মানুষ: ক্যাশবুক, বেতন, হিসাব-খাত, ইনভেন্টরি, দান (রিলিজ R3; পরিকল্পনা: task-plan)

পূর্ণ পরিকল্পনা আছে: `docs/AGENT-PLAN-R3.md`। এখানে নতুন কিছু নেই।


## M5 — ক্যাম্পাস ও যন্ত্র: লাইব্রেরি, পরিবহন, হোস্টেল, অনলাইন ক্লাস, কার্ড-যন্ত্র (রিলিজ R4; পরিকল্পনা: draft)

### DRAFT `F.M5.1` — প্রাক্তন শিক্ষার্থী (মডিউল `alumni`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `plan`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] প্রাক্তন শিক্ষার্থীর তালিকা (ডিরেক্টরি)  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] প্রোফাইল ও যোগাযোগ  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] পরিসংখ্যান  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M5.2` — কার্ড/QR যন্ত্রে হাজিরা (মডিউল `attendance_devices`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `attendance` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `plan`
- **পড়ুন:** `docs/modules/attendance-devices.md`
- **route (মডিউল-গেটেড, ১০):**

```
GET /attendance-devices -> AttendanceDeviceController@index [role:admin]
POST /attendance-devices -> AttendanceDeviceController@store [role:admin]
PUT /attendance-devices/{id} -> AttendanceDeviceController@update [role:admin]
POST /attendance-devices/{id}/{action} -> AttendanceDeviceController@transition [role:admin]
GET /person-credentials -> PersonCredentialController@index [role:admin]
POST /person-credentials -> PersonCredentialController@store [role:admin]
POST /person-credentials/import -> PersonCredentialController@import [role:admin]
GET /device-punches -> DevicePunchReviewController@index [role:admin]
POST /device-punches/{id}/assign -> DevicePunchReviewController@assign [role:admin]
POST /device-punches/reprocess -> DevicePunchReviewController@reprocess [role:admin]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৬):**
  - [ ] কার্ড, QR বা RFID যন্ত্র নিবন্ধন  <sub>প্রমাণ: `route:POST /attendance-devices`</sub>
  - [ ] ছাত্র/শিক্ষকের কার্ড বা QR-পরিচিতি  <sub>প্রমাণ: `route:POST /person-credentials`</sub>
  - [ ] পরিচিতি Excel থেকে আমদানি  <sub>প্রমাণ: `route:POST /person-credentials/import`</sub>
  - [ ] যন্ত্রের পাঞ্চ-তালিকা পর্যালোচনা  <sub>প্রমাণ: `route:GET /device-punches`</sub>
  - [ ] অচেনা পাঞ্চ হাতে ছাত্রের সাথে মেলানো  <sub>প্রমাণ: `route:POST /device-punches/{id}/assign`</sub>
  - [ ] পাঞ্চ থেকে হাজিরা স্বয়ংক্রিয় তৈরি  <sub>প্রমাণ: `doc:attendance-devices.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M5.3` — আচরণ-লগ (মডিউল `behavior`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল · **গেট:** `core`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] ছাত্রের আচরণ-লগ (ভালো ও সতর্কতার ঘটনা)  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] আচরণের সারসংক্ষেপ  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] অভিভাবককে ঘটনা জানানো  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] অভিভাবক সন্তানের আচরণ-লগ দেখেন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M5.4` — শিক্ষক-প্রশিক্ষণ (মডিউল `cpd`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `plan`
- **পড়ুন:** `docs/modules/advanced-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] প্রশিক্ষণ-কর্মসূচি তৈরি  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] শিক্ষকদের নিবন্ধন  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] প্রশিক্ষণ সম্পন্ন চিহ্নিত করা  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] শিক্ষকের প্রশিক্ষণ-ইতিহাস ও CPD-প্রতিবেদন  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M5.5` — অনুষ্ঠান ও ক্যালেন্ডার (মডিউল `events`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/advanced-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৫):**
  - [ ] প্রতিষ্ঠানের অনুষ্ঠান ও প্রতিযোগিতা তৈরি  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] ছাত্রের নিবন্ধন  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] অংশগ্রহণের উপস্থিতি  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] ফলাফল ও আসন্ন অনুষ্ঠানের তালিকা  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] ছাত্র নিজে অনুষ্ঠানগুলো দেখে  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M5.6` — স্বাস্থ্য-তথ্য (মডিউল `health`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল · **গেট:** `core`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] ছাত্রের স্বাস্থ্য-তথ্য (রক্তের গ্রুপ, অ্যালার্জি ইত্যাদি)  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] শ্রেণি-ভিত্তিক স্বাস্থ্য-প্রতিবেদন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] অভিভাবক সন্তানের স্বাস্থ্য-তথ্য দেখেন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M5.7` — হোস্টেল (মডিউল `hostel`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `fees` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `plan`
- **পড়ুন:** `docs/modules/hostel.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৭):**
  - [ ] হোস্টেল ও ওয়ার্ডেনের তথ্য  <sub>প্রমাণ: `doc:hostel.md`</sub>
  - [ ] কক্ষ, ফ্লোর, ধারণক্ষমতা ও মাসিক ভাড়া  <sub>প্রমাণ: `doc:hostel.md`</sub>
  - [ ] ছাত্রকে কক্ষ বরাদ্দ  <sub>প্রমাণ: `doc:hostel.md`</sub>
  - [ ] ফাঁকা কক্ষ দেখা  <sub>প্রমাণ: `doc:hostel.md`</sub>
  - [ ] হোস্টেল ছাড়া (check-out)  <sub>প্রমাণ: `doc:hostel.md`</sub>
  - [ ] দখল-প্রতিবেদন (occupancy)  <sub>প্রমাণ: `doc:hostel.md`</sub>
  - [ ] হোস্টেল-ফি ফি-ব্যবস্থার সাথে যুক্ত  <sub>প্রমাণ: `doc:hostel.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে

### DRAFT `F.M5.8` — লাইব্রেরি (মডিউল `library`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `students` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `plan`
- **পড়ুন:** `docs/modules/library.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৬):**
  - [ ] বইয়ের ক্যাটালগ (শিরোনাম, লেখক, ISBN, বিষয়)  <sub>প্রমাণ: `doc:library.md`</sub>
  - [ ] কপি-সংখ্যা ও কতটি আছে  <sub>প্রমাণ: `doc:library.md`</sub>
  - [ ] শেলফ-অবস্থান  <sub>প্রমাণ: `doc:library.md`</sub>
  - [ ] ছাত্রকে বই ইস্যু ও ফেরত  <sub>প্রমাণ: `doc:library.md`</sub>
  - [ ] ফেরতের তারিখ ও দেরির জরিমানা  <sub>প্রমাণ: `doc:library.md`</sub>
  - [ ] ছাত্র নিজের লাইব্রেরি-ইতিহাস দেখে  <sub>প্রমাণ: `doc:library.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে

### DRAFT `F.M5.9` — অনলাইন ক্লাস (মডিউল `online_class`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `routine`
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `plan`
- **পড়ুন:** `docs/modules/online-class.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৫):**
  - [ ] অনলাইন ক্লাসের সময়সূচি ও লিংক (Zoom, Meet ইত্যাদি)  <sub>প্রমাণ: `doc:online-class.md`</sub>
  - [ ] ক্লাসের বিবরণ, সময়কাল, পাসকোড  <sub>প্রমাণ: `doc:online-class.md`</sub>
  - [ ] রেকর্ডিং-লিংক সংরক্ষণ  <sub>প্রমাণ: `doc:online-class.md`</sub>
  - [ ] ছাত্রের রুটিন-পাতায় ক্লাসের লিংক  <sub>প্রমাণ: `doc:online-class.md`</sub>
  - [ ] Zoom-এ স্বয়ংক্রিয় মিটিং তৈরি  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে

### DRAFT `F.M5.10` — অনলাইন কুইজ (মডিউল `online_quiz`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `exams` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `plan`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৫):**
  - [ ] অনলাইন কুইজ/পরীক্ষা তৈরি, MCQ প্রশ্ন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] প্রশ্ন একসাথে আমদানি  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] ছাত্র সময়মতো শুরু ও জমা দেয়  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] MCQ-এর নম্বর স্বয়ংক্রিয়  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] ফল দেখা (শিক্ষক ও ছাত্র)  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে

### DRAFT `F.M5.11` — অভিভাবক-সভা (মডিউল `parent_meeting`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল · **গেট:** `core`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] অভিভাবক-সভার সময় চেয়ে অনুরোধ  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] শিক্ষক সভা নিশ্চিত বা বাতিল করেন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] আসন্ন সভার তালিকা  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] অভিভাবক নিজের সভাগুলো দেখেন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M5.12` — বৃত্তি ও ফি-ছাড় (মডিউল `scholarships`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** `fees` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `plan`
- **পড়ুন:** `docs/modules/advanced-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] বৃত্তি ও ফি-ছাড়ের প্রকল্প তৈরি  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] ছাত্রের আবেদন  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] আবেদন পর্যালোচনা ও বৃত্তি প্রদান  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] ছাত্র নিজের বৃত্তি দেখে  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M5.13` — পরিবহন (মডিউল `transport`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** `fees` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `plan`
- **পড়ুন:** `docs/modules/transport.md`
- **route (মডিউল-গেটেড, ১):**

```
GET /parent/transport -> TransportController@myChildTransport [role:parent]
```
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৬):**
  - [ ] গাড়ির তালিকা (নম্বর, ধারণক্ষমতা, চালক, সহকারী)  <sub>প্রমাণ: `doc:transport.md`</sub>
  - [ ] রুট ও সকাল-বিকালের সময়সূচি  <sub>প্রমাণ: `doc:transport.md`</sub>
  - [ ] রুটের স্টপ, পিকআপ ও ড্রপের সময়  <sub>প্রমাণ: `doc:transport.md`</sub>
  - [ ] ছাত্রকে রুট ও স্টপে নিয়োগ  <sub>প্রমাণ: `doc:transport.md`</sub>
  - [ ] রুট-ভিত্তিক মাসিক পরিবহন-ফি  <sub>প্রমাণ: `doc:transport.md`</sub>
  - [ ] অভিভাবক সন্তানের পরিবহন-তথ্য দেখেন  <sub>প্রমাণ: `doc:transport.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** — (স্পেক-অনুযায়ী পরিশীলনযোগ্য)

### DRAFT `F.M5.14` — দর্শনার্থী নিবন্ধন (মডিউল `visitors`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ · **গেট:** `core`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] দর্শনার্থীর আগমন নিবন্ধন (check-in)  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] প্রস্থান নিবন্ধন (check-out)  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] দর্শনার্থীর তালিকা ও প্রতিবেদন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত


## M6 — প্ল্যাটফর্ম-ব্যবসা ও বিশ্লেষণ: একাধিক শাখা, অ্যানালিটিক্স (রিলিজ R5; পরিকল্পনা: draft)

### DRAFT `F.M6.1` — অ্যানালিটিক্স ড্যাশবোর্ড (মডিউল `analytics`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** `attendance` (পূর্ণ পরিকল্পনায়), `fees` (পূর্ণ পরিকল্পনায়), `exams` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `plan`
- **পড়ুন:** `docs/modules/advanced-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] ছাত্রের পারফরম্যান্স-বিশ্লেষণ  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] প্রবণতা ও তুলনা-চার্ট  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] শিক্ষক ও প্রশাসকের ড্যাশবোর্ড  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M6.2` — একাধিক শাখা (মডিউল `multi_branch`)

- **ভিত্তি:** **আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**
- **নির্ভর করে (মডিউল):** `students` (পূর্ণ পরিকল্পনায়), `fees` (পূর্ণ পরিকল্পনায়)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `plan`
- **পড়ুন:** `docs/modules/extended-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৪):**
  - [ ] একই অ্যাকাউন্টে একাধিক শাখা  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] প্রধান কার্যালয় থেকে শাখাগুলোর তুলনামূলক প্রতিবেদন  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] প্রতিটি শাখার তথ্য আলাদা থাকে, প্রধান কার্যালয় সব শাখা দেখে  <sub>প্রমাণ: `doc:extended-features.md`</sub>
  - [ ] শাখা-ভিত্তিক আলাদা প্রশাসক  <sub>প্রমাণ: `doc:extended-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; ধাপ প্রস্তাবিত; কিছু ফিচারের ধাপ অনির্ধারিত


## M7 — বাহ্যিক সংযোগ: বাংলা QR, Nagad, ব্যাংক-API (বাইরের নথি ছাড়া শুরু করা যায় না) (রিলিজ R6; পরিকল্পনা: blocked-external)

কোনো মডিউল-কী নেই; এগুলো বাহ্যিক সংযোগ। **আসল নথি/অনুমোদন ছাড়া শুরু করা যায় না** (অনুমান নিষিদ্ধ)। রোডম্যাপের সংশ্লিষ্ট সারি:

- সরাসরি Nagad — নির্ভরতা: Nagad-এর ডকুমেন্ট
- বাংলা QR — নির্ভরতা: ব্যাংকের API
- Gateway refund API — নির্ভরতা: প্রদানকারীর ডকুমেন্ট
- ব্যাংক disbursement ফাইল-ফরম্যাট — নির্ভরতা: ব্যাংকের ফরম্যাট

## M8 — মোবাইল-অ্যাপ, AI, GPS (রিলিজ R7; পরিকল্পনা: draft)

### DRAFT `F.M8.1` — AI সহকারী (মডিউল `ai_assistant`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল, কলেজ, কোচিং · **গেট:** `plan`
- **পড়ুন:** `docs/modules/advanced-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] নোটিশ লিখতে AI-সহায়তা  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] প্রশ্ন তৈরিতে AI-সহায়তা  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] ডেটার সারসংক্ষেপ বুঝতে AI-সহায়তা  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; কিছু ফিচারের ধাপ অনির্ধারিত

### DRAFT `F.M8.2` — বাসের লাইভ GPS (মডিউল `gps`)

- **ভিত্তি:** স্পেক থেকে বের-করা ধাপ
- **নির্ভর করে (মডিউল):** — (শুধু আগের ধাপ সম্পূর্ণ)
- **কোন ধরনে:** স্কুল · **গেট:** `plan`
- **পড়ুন:** `docs/modules/advanced-features.md`
- **route:** মডিউল-গেটেড route নেই। **স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**
- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট (৩):**
  - [ ] বাসের লাইভ অবস্থান  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] আজকের রুট  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
  - [ ] অভিভাবক মানচিত্রে বাস দেখেন  <sub>প্রমাণ: `doc:advanced-features.md`</sub>
- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।
- **ফাঁক:** API শুধু গদ্যে; কিছু ফিচারের ধাপ অনির্ধারিত


---
মোট খসড়া কাজ: **৪১**।
