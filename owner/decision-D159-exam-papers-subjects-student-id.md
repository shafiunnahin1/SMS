# খসড়া সিদ্ধান্ত D159: বহু-বিষয়ের MCQ পরীক্ষা, একই বিষয়ে একাধিক প্রশ্নপত্র, শিক্ষার্থীর আইডি দিয়ে মেলানো, আর OMR-এ আইডির ঘর

> এজেন্টের খসড়া। মালিক অনুমোদন করলে `owner\approve-D159.ps1` চালাবেন। স্ক্রিপ্টটি সারিটি `docs/LOCKED-DECISIONS.md`-এ যোগ করে `Change-Request: D159` দিয়ে commit ও push করে। অনুমোদনের আগে এর কোড লেখা হবে না।

## মালিকের প্রেক্ষাপট (2026-10-24)
1. **MCQ ক্লাস টেস্ট:**
   - একটি প্রশ্নপত্রে ৫টি বিষয়ের প্রতিটির ২০টি করে মোট ১০০টি MCQ।
   - ৮ম শ্রেণির দুই শাখা একসাথে পরীক্ষা দেয়।
   - একটি OMR-এ ৫টি বিষয়ের ১০০টি বৃত্ত থাকে।
2. **অর্ধবার্ষিক পরীক্ষা:**
   - প্রতিটি বিষয়ের পরীক্ষা আলাদা হয়।
   - গণিতের MCQ-এর একটি প্রশ্নপত্র, আর CQ+SQ-এর আরেকটি প্রশ্নপত্র থাকে।
   - MCQ+CQ+SQ-এর নম্বর একসাথে এন্ট্রি হয়।
3. **শিক্ষার্থীর আইডি:**
   - রোলের পাশাপাশি আইডি নম্বর লাগবে, যাতে আলাদা শাখায় একই রোল হলেও গোলমাল না হয়।
   - আইডি কখনো বদলায় না, শ্রেণি বদলালেও একই থাকে।
   - OMR-এ আইডির ঘর লাগবে, বিষয় কোডের ঘর লাগবে না।

## এখন কী আছে, কী বদলাতে হবে
- **D158 (3):** এক পরীক্ষা-বিষয়ে একটিই প্রশ্নপত্র লিংক করা যায়, আর তার সব প্রশ্ন সেই বিষয়ে গোনা হয়। ফলে উপরের ১ ও ২ নম্বর প্রেক্ষাপট চলে না।
- **D127 (1):** OMR-এর তথ্যের ঘর হলো শ্রেণি, রোল, বিষয় কোড আর সেট। এখানে ৩ নম্বর প্রেক্ষাপটের জন্য বদল দরকার।
- **আইডি আগে থেকেই আছে:** শিক্ষার্থীর স্থায়ী আইডি আছে (`students.student_id`, যেমন `DHA-2025-0001`)। এটা শ্রেণি বদলালেও বদলায় না।
- **OMR-এ বাধা:** বৃত্তে শুধু অঙ্ক বসানো যায়, আর আইডিতে অক্ষর আছে। তাই OMR-এর জন্য ১০ অঙ্কের ID হবে `YYYYmmdd`-এর সঙ্গে database serial/ID-এর শেষ ২ অঙ্ক; যেমন `2026102401`।

## প্রস্তাবিত সারি
| D159 | Multi-subject MCQ tests, several papers per exam subject, matching students by their permanent ID, and an ID box on the OMR (amends D127 (1)(5), D158 (3)(4)(5)(6)) | Owner approved (2026-10-24). (1) One question paper may serve several subjects of one exam: when a paper has subject blocks (D128), each exam subject is linked to the paper together with ONE of its subject blocks, and that subject's parts come only from that block's questions and marks (e.g. a class test of 5 subjects x 20 MCQ, taken by both sections of class 8 as one exam of the whole class). (2) An exam subject may link more than one paper (e.g. the MCQ paper and the CQ+SQ paper of a half-yearly subject); its parts are the union of the kinds of all its linked papers (a kind found in two papers adds up), and all parts are entered together on one sheet. `exam_papers` gains `qb_subject_id` (nullable: the paper's block, NULL = the whole paper) and its uniqueness becomes (exam subject, paper, block); a new migration, never an edit of the old one. Link changes stay refused once the subject has marks or the exam is published. (3) Students are matched first by their permanent ID (`students.student_id`, never changed and kept across classes), then by roll + batch: the entry sheet and the AI prompt show the ID; JSON rows may give `id` (preferred) or `roll` (+ `batch`). (4) OMR: the "subject code" box is replaced by a "student ID" box (bubbles, exactly 10 digits: `YYYYmmdd` plus the last 2 digits of the database serial/ID, e.g. `2026102401`); the ID must be unique in the institution - a student whose digit ID is not unique is matched by roll (+ batch) as today and shown in review. Matching order on a scan: ID, then roll within the paper's class/batch; an unreadable or unmatched ID goes to review (D127 (4)), never a silent match. Forms already generated keep their own geometry and boxes. (5) A multi-subject OMR sheet is graded per subject block with the frozen set's key (D126 (2)), so the OMR import (D158 (6)) puts each subject's MCQ mark into that subject. Tests: a 5x20 class test across two sections read and imported per subject; two papers on one subject giving MCQ+CQ+SQ; same roll in two sections resolved by ID; OMR ID box printed, read and matched; old forms unchanged. Implementation commits carry `Change-Request: D159` (with D158 / D127 where those parts change). |

## যা এই সিদ্ধান্তের বাইরে
- শিক্ষার্থীর আইডির নিয়ম বদলানো, যেমন শুধু অঙ্কের আইডি।
- পুরনো আইডি নতুন করে বানানো।
- বোর্ডের রেজিস্ট্রেশন নম্বর।

## মালিককে যা দেখতে হবে
1. OMR-এ আইডির ঘরে ১০টি অঙ্ক থাকবে: `YYYYmmdd` + database serial/ID-এর শেষ ২ অঙ্ক (যেমন `2026102401`)।
2. সব ঠিক থাকলে রিপোজিটরির ভিতরে PowerShell-এ চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D159.ps1`
