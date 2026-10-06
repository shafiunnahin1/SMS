# Data Migration Wizard — পুরনো ডেটা আনা (Revision 12)

> **Release 1 (R16):** মডিউল চালু, কিন্তু `config('release.import_kinds') = ['students']` — অন্য `kind` 422 `kind_not_available`; বাকি kind R1.1। সারি-যাচাই ও টেমপ্লেট-কলাম: `docs/modules/student-import.md`।
> নতুন গ্রাহক নেওয়ার সবচেয়ে বড় বাধা: "আমাদের পুরনো খাতা/Excel-এর ডেটা কি আসবে?" এই উইজার্ড একটি সাধারণ কাঠামোয় আমদানি করে: **আপলোড → কলাম-ম্যাপিং → ড্রাই-রান → চালান → (৭ দিনের মধ্যে) রোলব্যাক**। টেবিল: `import_jobs`, `import_rows`। Module key: `data_migration` (core; সব ধরন)। Roles: Admin। (ছাত্র-আমদানি আগেই ছিল — `docs/modules/student-import.md`; এখন একই উইজার্ডের `students` kind।)
> **সীমা:** (ক) **শুধু UTF-8 (BOM-সহ বা ছাড়া) CSV/XLSX**। পুরনো বিজয়/ANSI-এনকোডিং এর বাংলা টেক্সট আমি স্বয়ংক্রিয় রূপান্তর করি না — শনাক্ত করলে ফাইল প্রত্যাখ্যান ও গাইড দেখায়। (খ) নির্দিষ্ট কোনো প্রতিযোগী সফটওয়্যারের এক্সপোর্ট-ফরম্যাট আমি জানি না; ব্যবহারকারী কলাম ম্যাপ করে। (গ) সীমা: ২০,০০০ সারি/জব, ১০ MB।

## ১. ধরন (`import_jobs.kind`) ও আবশ্যিক কলাম
| kind | কী তৈরি হয় | স্বাভাবিক-কী (idempotent মিল) | আবশ্যিক |
|---|---|---|---|
| `students` | `users` + `students` + `enrollments` | `student_id` কোড | নাম, অভিভাবক-ফোন, program/batch |
| `teachers` | `users` + `teachers` | `employee_id` | নাম, ফোন |
| `fee_structure` | `fee_structures` | (program, batch, fee_category, বছর) | ফি-খাত, পরিমাণ |
| `fee_history` | `fee_payments` (পুরনো রসিদ) | `LEG-<পুরনো রসিদ নং>` + লাইন | ছাত্র-কোড, ফি-খাত, পরিমাণ, তারিখ |
| `results` | `exams`, `exam_subjects`, `results` | (exam, ছাত্র, বিষয়) | পরীক্ষার নাম, ছাত্র-কোড, বিষয়, নম্বর |
| `attendance` | `attendances` | (ছাত্র, batch, তারিখ) | ছাত্র-কোড, তারিখ, status |
`created_table`/`created_id` প্রতিটি `import_rows` সারিতে — রোলব্যাক ও ট্রেসের ভিত্তি।

## ২. প্রবাহ (`status`: `uploaded → mapped → dry_run → running → done` | `failed` | `rolled_back`)
1. **Upload:** ফাইল private disk-এ (`import_jobs.file_path`), কাঠামো-পরীক্ষা (এনকোডিং, শিরোনাম-সারি, সারি-সীমা)।
2. **Map:** উৎস-কলাম → লক্ষ্য-ক্ষেত্র (`mapping` JSON); আবশ্যিক ক্ষেত্র ম্যাপ না হলে এগোয় না; মান-ম্যাপ (যেমন "১ম শ্রেণী" → program)।
3. **Dry-run (বাধ্যতামূলক):** কিছু লেখে না; প্রতি সারিতে `ok|error|skipped` + কারণ (`import_rows.status/error`); সারাংশ (`summary`): মোট, ok, error, skipped (বিদ্যমান)। ত্রুটি-রিপোর্ট Excel-এ ডাউনলোড।
4. **Run:** ৫০০ সারির chunk, প্রতি chunk এক transaction; `TenantAwareJob`; অগ্রগতি-শতাংশ; ত্রুটিপূর্ণ সারি অন্যদের থামায় না; **সব বিজ্ঞপ্তি/SMS/accounting-পোস্টিং/risk-job আমদানির সময় স্থগিত** (`ImportContext::suppress()`)।
5. **Done:** সারাংশ ও রিপোর্ট; কী কী তৈরি হল তার তালিকা।
6. **Rollback (৭ দিন):** `created_*` ধরে মোছা — কিন্তু শুধু যেগুলোর **উপর নির্ভরশীল কিছু পরে তৈরি হয়নি** (যেমন আমদানি-করা ছাত্রের নতুন পেমেন্ট নেই); নির্ভরশীল থাকলে সেই সারি "রোলব্যাক-অযোগ্য" তালিকায় দেখায়, জোর করে নয়।

## ৩. নিয়ম
- **Idempotent পুনরায় চালানো:** একই ফাইল আবার চালালে স্বাভাবিক-কী মিললে `skipped` (দ্বিগুণ তৈরি নয়)।
- **fee_history:** রসিদ-নম্বরে `LEG-` উপসর্গ (বর্তমান সিকোয়েন্সের সাথে সংঘর্ষ এড়াতে); `fee_payments`-এ তারিখ পুরনো; accounting-এর `start_date`-এর আগের হলে ভাউচার হয় না; আমদানি-করা রসিদ নতুন বকেয়া হিসাবে নেট-ভিত্তিক `dueLines`-এ স্বাভাবিকভাবে ধরা পড়ে।
- **results:** পরীক্ষা `"[পুরনো] <নাম>"` নামে তৈরি (প্রকাশিত), SMS/বিজ্ঞপ্তি নেই; ওজনযুক্ত ফাইনাল-ফলাফল (`result_sheets`) চাইলে সেগুলো বেছে নিতে হয়।
- **students:** `users` সারিতে অস্থায়ী পাসওয়ার্ড (`must_change_password=1`); ছাত্র-ID `StudentIdGenerator` অথবা ফাইলের কোড (অনন্য-পরীক্ষা সহ)।
- নিরাপত্তা: ফাইল/সারিতে শিশুর তথ্য — private disk, সম্পূর্ণ জব ৩০ দিন পরে `imports:prune` (ফাইল + `import_rows.data`), `import_jobs` সারাংশ থাকে; Super Admin-এর কাছে অগম্য।
- Audit: প্রতিটি জব (কে, কবে, সংখ্যা)।

## ৪. Endpoint (`module:data_migration`)
```
POST /imports { kind }  (→ upload)      GET /imports   GET /imports/{id}
PUT  /imports/{id}/mapping              POST /imports/{id}/dry-run | run | rollback
GET  /imports/{id}/errors.xlsx          GET /imports/templates/{kind}.xlsx   (খালি টেমপ্লেট)
```

## ৫. পরীক্ষা ও Done When
| Test | Asserts |
|---|---|
| `ImportDryRunNoWriteTest` | dry-run-এ কোনো টেবিলে সারি বাড়ে না |
| `ImportIdempotentTest` | একই ফাইল দুবার চালালে দ্বিতীয়বার সব skipped |
| `ImportRollbackTest` | অক্ষত সারি মোছে; নির্ভরশীল থাকলে বাদ ও তালিকাভুক্ত; ৭ দিন পরে নিষিদ্ধ |
| `ImportSuppressionTest` | আমদানিতে SMS/বিজ্ঞপ্তি/ভাউচার/ঝুঁকি-ফ্ল্যাগ তৈরি হয় না |
| `ImportEncodingTest` | UTF-8 BOM ঠিক; ANSI/বিজয়-সন্দেহে প্রত্যাখ্যান ও গাইড |
| `ImportFeeHistoryTest` | `LEG-` রসিদ; unique সংঘর্ষ নেই; আমদানির পর `dueLines` নেট-ভিত্তিক সঠিক |
| `ImportTenancyTest` | অন্য প্রতিষ্ঠানের job 404; `TenantAwareJob`; ফাইল private |
| `ImportLimitsTest` | ২০,০০০ সারি/১০ MB সীমা; chunk-মেমরি স্থির |
- **Done When:** একটি ২০০ সারির পুরনো-Excel (ছাত্র) + ফি-ইতিহাস ফাইল: ম্যাপ → dry-run (ইচ্ছাকৃত ৫টি ভুল সারিসহ) → চালান → ২০০−৫ তৈরি; ত্রুটি-রিপোর্ট ঠিক; রোলব্যাকে সবকিছু মুছে; আবার চালালে একই ফল।
