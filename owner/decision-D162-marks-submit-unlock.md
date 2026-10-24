# খসড়া সিদ্ধান্ত D162: নম্বরের খসড়া, প্রধানের কাছে জমা, আর জমার পর সংশোধনের অনুমতি

> এজেন্টের খসড়া। মালিক অনুমোদন করলে `owner\approve-D162.ps1` চালাবেন। স্ক্রিপ্টটি তিনটি কাজ করে:
> - সারিটি `docs/LOCKED-DECISIONS.md`-এ যোগ করে।
> - guard-এ R2.1.7-এর জন্য নতুন টেবিল `exam_mark_submissions` যুক্ত করে।
> - commit ও push করে।
>
> অনুমোদনের আগে কোড লেখা হবে না।

## মালিকের নির্দেশ (2026-10-24)
- প্রশ্নপত্র লিংক ছাড়াও ফলাফল এন্ট্রি করা যাবে।
- শিক্ষক বা স্টাফ নম্বর সেভ করে খসড়া হিসেবে রাখতে পারবেন।
- সব নম্বর এন্ট্রি আর যাচাই শেষ হলে প্রধান শিক্ষক বা পরীক্ষা নিয়ন্ত্রকের কাছে পাঠাবেন।
- পাঠানোর পর কিছু বদলাতে চাইলে শিক্ষক বা স্টাফ "আপডেট অনুরোধ" পাঠাবেন।
- প্রধান অনুমোদন করলে শিক্ষক বা স্টাফ নম্বর বদলে আবার জমা দিতে পারবেন।

## এখন কী আছে
- নম্বর সেভ করলেই সেটি চূড়ান্ত। "জমা" বলে কোনো অবস্থা নেই।
- প্রকাশের আগ পর্যন্ত শিক্ষক যতবার খুশি বদলাতে পারেন। প্রকাশের পর শুধু অ্যাডমিন পারেন (D161 (3))।
- "পরীক্ষা নিয়ন্ত্রক" নামে কোনো role এখনো নেই। স্টাফের দায়িত্ব-ভিত্তিক অনুমতি (R3.6, D91–D93) এখনো সব route-এ চালু হয়নি।

## প্রস্তাবিত সারি
| D162 | Marks entry draft, submit to the head, and unlock request after submit (amends D158/D161 marks entry; R2.1.7) | Owner approved (2026-10-24). (1) Each exam subject's marks have a submission state, `draft` by default: the teacher (or staff with marks entry) saves marks as a draft as often as needed; the screen shows "Draft". (2) "Submit to head" sends the subject's marks for review; allowed only when every sitting student has a mark or is absent; after it the subject is `submitted` and the teacher can no longer change it (422 `marks_submitted`). (3) After submit the teacher may send an "update request" with a reason (required, max 500); state `unlock_requested`. The head of the institution (admin) sees pending requests on the exam page and approves or rejects with an optional note; approve -> `unlocked` (the teacher edits and must submit again -> `submitted`), reject -> back to `submitted`. Each step notifies the other side in-app; audit log for submit, request, approve, reject. (4) The admin can view and edit at any state before publishing, and can return a submitted subject to draft. Publishing is NOT blocked by unsubmitted subjects: the publish dialog warns and lists the subjects still draft / unlock-requested / unlocked, and the admin may publish anyway; publishing locks every subject (D161 (3) applies). After publishing, D161 (3) stays: only the admin corrects, with the correction SMS. (5) "Exam controller": for now the head of the institution (admin) reviews. In a later update the head may assign this duty to a teacher or staff member (planned as the R3.6 department duty key `exam.marks.review` under D91 checks); no new role is created now and nothing of that assignment is built in R2.1.7. (6) A question paper link is optional (D158 (3) clarified): an exam subject without a linked paper takes marks too - either one total mark, or parts the admin sets by hand on the exam's subjects tab (MCQ / creative / short / practical or a custom label, each with full and pass marks, total = sum of parts). Marks entry, draft/submit/unlock, JSON MCQ import (when an MCQ part exists), merit list, publish and SMS work the same with or without a link; only OMR import needs a linked paper with an OMR form. Linking a paper replaces the hand-set parts with the paper's kinds (refused once marks exist, as today); unlinking the last paper leaves the subject with no parts until the admin sets them again. (7) New tenant table `exam_mark_submissions` (exam_subject_id unique, status draft|submitted|unlock_requested|unlocked, submitted_by, submitted_at, request_reason, requested_by, requested_at, decided_by, decided_at, decision_note, timestamps); a subject without a row is `draft`; schema.sql updated in the implementation commits. Tests: teacher draft save; submit refused with a missing mark; teacher edit after submit 422; request -> approve -> edit -> resubmit; reject keeps it locked; another teacher cannot submit/request for a subject not theirs; a teacher cannot approve; publish allowed with unsubmitted subjects and the response lists them; tenant isolation; admin edit at any state; a subject with hand-set parts and no paper link takes marks, submits and publishes; JSON MCQ import works without a link; OMR import without a link answers 422. Implementation commits carry `Change-Request: D162`; the guard gains the table `exam_mark_submissions` for R2.1.7. |

## মালিকের উত্তর (2026-10-24)
১. পরীক্ষা নিয়ন্ত্রকের দায়িত্ব আপাতত প্রধানের কাছেই থাকবে। পরের কোনো আপডেটে প্রধান চাইলে এই দায়িত্ব অন্য কোনো শিক্ষক বা স্টাফকে দিতে পারবেন।
২. সব বিষয় জমা না হলেও ফল প্রকাশ আটকাবে না। প্রকাশের সময় শুধু সতর্কবার্তায় কোন কোন বিষয় এখনো জমা হয়নি তার তালিকা দেখাবে।
৩. জমা দিতে প্রত্যেক শিক্ষার্থীর নম্বর থাকতে হবে, অথবা "অনুপস্থিত" দাগানো থাকতে হবে।
৪. প্রশ্নপত্র লিংক ছাড়াও নম্বর এন্ট্রি করা যাবে (অংশ ৬)।

ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D162.ps1`
