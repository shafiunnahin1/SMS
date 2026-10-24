# খসড়া সিদ্ধান্ত D162: নম্বরের খসড়া, প্রধানের কাছে জমা, আর জমার পর সংশোধনের অনুমতি

> এজেন্টের খসড়া। মালিক অনুমোদন করলে `owner\approve-D162.ps1` চালাবেন। স্ক্রিপ্টটি তিনটি কাজ করে:
> - সারিটি `docs/LOCKED-DECISIONS.md`-এ যোগ করে।
> - guard-এ R2.1.7-এর জন্য নতুন টেবিল `exam_mark_submissions` যুক্ত করে।
> - commit ও push করে।
>
> অনুমোদনের আগে কোড লেখা হবে না।

## মালিকের নির্দেশ (2026-10-24)
- শিক্ষক বা স্টাফ নম্বর সেভ করে খসড়া হিসেবে রাখতে পারবেন।
- সব নম্বর এন্ট্রি আর যাচাই শেষ হলে প্রধান শিক্ষক বা পরীক্ষা নিয়ন্ত্রকের কাছে পাঠাবেন।
- পাঠানোর পর কিছু বদলাতে চাইলে শিক্ষক বা স্টাফ "আপডেট অনুরোধ" পাঠাবেন।
- প্রধান অনুমোদন করলে শিক্ষক বা স্টাফ নম্বর বদলে আবার জমা দিতে পারবেন।

## এখন কী আছে
- নম্বর সেভ করলেই সেটি চূড়ান্ত। "জমা" বলে কোনো অবস্থা নেই।
- প্রকাশের আগ পর্যন্ত শিক্ষক যতবার খুশি বদলাতে পারেন। প্রকাশের পর শুধু অ্যাডমিন পারেন (D161 (3))।
- "পরীক্ষা নিয়ন্ত্রক" নামে কোনো role এখনো নেই। স্টাফের দায়িত্ব-ভিত্তিক অনুমতি (R3.6, D91–D93) এখনো সব route-এ চালু হয়নি।

## প্রস্তাবিত সারি
| D162 | Marks entry draft, submit to the head, and unlock request after submit (amends D158/D161 marks entry; R2.1.7) | Owner approved (2026-10-24). (1) Each exam subject's marks have a submission state, `draft` by default: the teacher (or staff with marks entry) saves marks as a draft as often as needed; the screen shows "Draft". (2) "Submit to head" sends the subject's marks for review; allowed only when every sitting student has a mark or is absent; after it the subject is `submitted` and the teacher can no longer change it (422 `marks_submitted`). (3) After submit the teacher may send an "update request" with a reason (required, max 500); state `unlock_requested`. The head of the institution (admin) sees pending requests on the exam page and approves or rejects with an optional note; approve -> `unlocked` (the teacher edits and must submit again -> `submitted`), reject -> back to `submitted`. Each step notifies the other side in-app; audit log for submit, request, approve, reject. (4) The admin can view and edit at any state before publishing, and can return a submitted subject to draft. Publishing is refused until every exam subject is `submitted` (422 `marks_not_submitted`, listing the subjects). After publishing, D161 (3) stays: only the admin corrects, with the correction SMS. (5) "Exam controller": until the R3.6 department duties are live for this route, only the admin reviews; later a staff duty key `exam.marks.review` grants the same review under D91 checks - no new role is created now. (6) New tenant table `exam_mark_submissions` (exam_subject_id unique, status draft|submitted|unlock_requested|unlocked, submitted_by, submitted_at, request_reason, requested_by, requested_at, decided_by, decided_at, decision_note, timestamps); a subject without a row is `draft`; schema.sql updated in the implementation commits. Tests: teacher draft save; submit refused with a missing mark; teacher edit after submit 422; request -> approve -> edit -> resubmit; reject keeps it locked; another teacher cannot submit/request for a subject not theirs; a teacher cannot approve; publish refused until all submitted; tenant isolation; admin edit at any state. Implementation commits carry `Change-Request: D162`; the guard gains the table `exam_mark_submissions` for R2.1.7. |

## মালিককে যা দেখতে হবে
১. **"পরীক্ষা নিয়ন্ত্রক":** আপাতত পর্যালোচনা ও অনুমোদন শুধু প্রতিষ্ঠান প্রধান (admin) করবেন। স্টাফের দায়িত্ব-ব্যবস্থা (R3.6) চালু হলে "পরীক্ষা নিয়ন্ত্রক" দায়িত্বপ্রাপ্ত স্টাফও এটা পারবেন। নতুন role এখন বানানো হবে না।
২. **প্রকাশের আগে জমা বাধ্যতামূলক:** সব বিষয় "জমা" না হলে প্রধান ফল প্রকাশ করতে পারবেন না। প্রধান চাইলে নিজে নম্বর দিয়ে বা বদলে এগিয়ে যেতে পারবেন। এতে আপত্তি থাকলে বলুন।
৩. **আংশিক জমা:** জমা দিতে হলে সব শিক্ষার্থীর নম্বর থাকতে হবে, অথবা "অনুপস্থিত" দাগানো থাকতে হবে।
৪. ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D162.ps1`
