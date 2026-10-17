# Syllabus & Lesson Plans — সিলেবাস ও পাঠ-পরিকল্পনা (Revision 12)

> "সিলেবাস কতদূর শেষ?" — পরীক্ষার আগে প্রধান শিক্ষক ও অভিভাবকের সবচেয়ে বড় প্রশ্ন। টেবিল: `syllabus_units`, `lesson_plans`, `syllabus_coverage`। Module key: `syllabus` (core; সব চার ধরন)। Roles: Admin (সব), Teacher (নিজের বিষয়/batch — `batch_teachers`/`teacher_subjects`), Parent/Student (শুধু পঠন, সেটিং চালু থাকলে)।

## ১. ডেটা
- `syllabus_units`: `program_id`, `subject_id`, `parent_id` (গাছ: অধ্যায় → পাঠ), `title`, `term` (যেমন "১ম সাময়িক"), `planned_periods`, `sort_order`।
- `lesson_plans` (ঐচ্ছিক): `batch_id`, `subject_id`, `teacher_id`, `unit_id`, `planned_date`, `objective`, `activities`, `resources`, `status` (`planned|taught|skipped`)।
- `syllabus_coverage`: `batch_id`, `unit_id`, `teacher_id`, `covered_on`, `note`; **`UNIQUE (batch_id, unit_id)`** — একটি ব্যাচে একটি ইউনিট একবারই "সম্পন্ন"।

## ২. নিয়ম
1. **শুধু পাতা (leaf) গণনা:** কভারেজ % = `সম্পন্ন leaf ইউনিট ÷ মোট leaf ইউনিট`; পিতা-ইউনিট "সম্পন্ন" ধরা হয় যদি সব সন্তান সম্পন্ন (ব্যুৎপন্ন, সংরক্ষিত নয়)।
2. **দুটি ব্যবহার-ধরন:** (ক) সরল — শিক্ষক শুধু ইউনিট টিক দেয় (`syllabus_coverage`); (খ) পূর্ণ — `lesson_plans` লিখে, "পড়ানো হয়েছে" চিহ্ন দিলে সংশ্লিষ্ট ইউনিটের coverage স্বয়ংক্রিয় (idempotent)।
3. **পিছিয়ে-থাকা:** যে ইউনিটের কোনো `lesson_plans.planned_date` আজকের আগে কিন্তু coverage নেই। সাপ্তাহিক in-app সারাংশ প্রধান শিক্ষককে (scheduler `syllabus:digest`, `Tenancy::each`); শিক্ষককে নিজের তালিকা।
4. **কপি:** ইউনিট-গাছ এক program থেকে অন্য program/শিক্ষাবর্ষে ক্লোন; Excel আমদানি (কলাম: বিষয়, অধ্যায়, পাঠ, term, পিরিয়ড) — `docs/modules/data-migration.md`-এর কাঠামোয়।
5. **অভিভাবক/ছাত্র দৃশ্য:** `settings.syllabus.show_parents` (ডিফল্ট **বন্ধ**) — চালু হলে বিষয়-ভিত্তিক "সম্পন্ন অধ্যায়" তালিকা, কোনো শিক্ষক-তুলনা বা "পিছিয়ে" তথ্য নয়।
6. **সতর্কতা:** এটি শিক্ষক-নজরদারি-যন্ত্র নয় — প্রধান শিক্ষকের "বিষয় × শিক্ষক × কভারেজ" ম্যাট্রিক্স সহায়ক; কোনো স্বয়ংক্রিয় শাস্তি/বেতনযোগ নেই।
7. ইউনিট মোছা: coverage/lesson plan থাকলে মোছা যায় না (নিষ্ক্রিয় করা যায় না — তালিকা থেকে লুকানো `archived` নেই; তাই সম্পাদনা শুধু title/সাজানো)।

## ৩. Endpoint
```
GET|POST|PUT|DELETE /syllabus/units     POST /syllabus/units/clone { from_program_id, to_program_id }     POST /syllabus/units/import
GET|POST|PUT|DELETE /lesson-plans       POST /lesson-plans/{id}/taught | skipped
POST|DELETE /syllabus/coverage { batch_id, unit_id, note? }
GET  /syllabus/coverage?batch_id=&subject_id=      GET /syllabus/overview?program_id=&term=     (প্রধান শিক্ষক: বিষয় × শিক্ষক ম্যাট্রিক্স)
GET  /syllabus/behind?teacher_id=
GET  /parent/children/{id}/syllabus      (শুধু show_parents চালু থাকলে)
```

## ৪. পরীক্ষা ও Done When
| Test | Asserts |
|---|---|
| `CoverageMathTest` | শুধু leaf গোনে; পিতা ব্যুৎপন্ন; ০ ইউনিটে ০% (ভাগ-শূন্য নয়) |
| `CoverageUniqueTest` | একই (batch, unit) দুবার নয়; টিক তুললে সরানো যায় (audit) |
| `LessonTaughtLinkTest` | taught ⇒ coverage একবারই; skipped ⇒ নয় |
| `BehindScheduleTest` | planned_date গতকাল+coverage নেই ⇒ পিছিয়ে; coverage হলে নয় |
| `UnitCloneTest` | গাছ-কাঠামো ও ক্রম অক্ষুণ্ণ; `parent_id` নতুন id-তে remap (export-map-এর self-reference নিয়মে) |
| `SyllabusAccessTest` | Teacher শুধু নিজের batch/বিষয়; Parent বন্ধে 403, চালুতে শুধু সম্পন্ন-তালিকা |
| `SyllabusTenancyTest` | অন্য প্রতিষ্ঠান 404; digest job tenant-নিরাপদ |
- **Done When:** school demo-তে ১টি বিষয়ের ২০ ইউনিট; শিক্ষক ১২টি টিক → ৬০.০০%; প্রধান শিক্ষকের ম্যাট্রিক্সে মেলে; পিছিয়ে-তালিকা ইচ্ছাকৃত ভাবে ঠিক; অভিভাবক-দৃশ্য ডিফল্টে লুকানো।
