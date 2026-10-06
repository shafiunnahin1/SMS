# College Features (Revision 6)

## Overview
college type কাঠামোগতভাবে school-এর মতোই (একজন student, একটি active enrollment, GPA marksheet), সাথে তিনটি বাড়তি বিষয়: বিভাগ (Group), ঐচ্ছিক/৪র্থ বিষয়, ও সেশনভিত্তিক বর্ষ। আলাদা table নেই — `programs.group_name`, `enrollments.optional_subject_id`, `students.board_reg_no`/`board_roll_no` ব্যবহার হয়।

## Program = Class + Group
| Program name | numeric_name | group_name |
|---|---|---|
| একাদশ - বিজ্ঞান | 11 | science |
| একাদশ - মানবিক | 11 | humanities |
| একাদশ - ব্যবসায় শিক্ষা | 11 | business |
| দ্বাদশ - বিজ্ঞান / মানবিক / ব্যবসায় শিক্ষা | 12 | … |

- Onboarding এই ৬টি স্বয়ংক্রিয় তৈরি করে; ডিগ্রি/অনার্স থাকলে Admin নিজে Program যোগ করে (`numeric_name` NULL, `group_name` `general`)।
- school type-এর Class 9–10-এও একই পদ্ধতি চলে: "Class 9 - Science" নামে আলাদা Program।

## Subjects & Optional (4th) Subject
- `subjects.program_id` অনুযায়ী বিষয় — বিভাগভিত্তিক Program হওয়ায় আলাদা group mapping লাগে না।
- `subjects`-এ একটি কলাম যোগ হবে: `is_optional TINYINT(1) DEFAULT 0` (migration `add_is_optional_to_subjects_table`)। Student-এর নির্বাচিত ৪র্থ বিষয় `enrollments.optional_subject_id`-এ।
- Mark entry list-এ optional subject-এ শুধু তারা আসে যাদের `optional_subject_id` ওই subject।
- GPA: ৪র্থ বিষয়ের grade point থেকে ২ বাদ দিয়ে বাকি অংশ মোট point-এ যোগ হয়, ভাগ হয় বাধ্যতামূলক বিষয়ের সংখ্যা দিয়ে, সর্বোচ্চ ৫.০০ — `docs/modules/grading.md`-এর function-এ `optional_subject_id` parameter যোগ করে বাস্তবায়ন করুন।

## Session & Promotion
- `academic_years` = সেশন ("2025-2026"); terminology-তে "সেশন" দেখায়।
- একাদশ → দ্বাদশ: `docs/modules/promotion-tc.md`-এর bulk promotion, একই group-এর Program-এ (`group_name` মিলিয়ে target স্বয়ংক্রিয় প্রস্তাব)।
- দ্বাদশ শেষে: enrollment `completed`; `alumni` module চালু থাকলে Alumni-তে যোগ করার বাটন।

## Board Information
`students.board_reg_no`, `students.board_roll_no` — ভর্তি form (college ও school Class 9+), admit card ও testimonial PDF-এ দেখায়। বাধ্যতামূলক নয়।

## Notes / Edge Cases
- Group পরিবর্তন (বিজ্ঞান → মানবিক) = `EnrollmentService::transfer()` অন্য Program-এর Batch-এ; পুরনো result ইতিহাসে থাকে।
- college-এ `behavior`, `health`, `parent_meeting`, `gps` default বন্ধ; Super Admin `enabled_modules` override দিয়ে চালু করতে পারে।
