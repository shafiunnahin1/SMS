# খসড়া সিদ্ধান্ত D171: উদ্দীপকভিত্তিক বহুনির্বাচনী প্রশ্নের নম্বর, OMR ও নম্বর-বণ্টন (D129-এর সংকীর্ণ সংশোধন)

> এজেন্টের খসড়া — কোনো কোড, guard বা D129 বদলানো হয়নি। মালিকের উত্তর §৬-এ। অনুমোদন করলে `owner\approve-D171.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ STIM.3 → STIM.1 → STIM.2; push করে না)।
> মালিকের বাছাই (2026-10-27): **বিকল্প B** — `stimulus_mcq_group` প্রশ্নব্যাংকে একটি রেকর্ডই থাকবে, কিন্তু প্রশ্নপত্রে তার প্রতিটি `sub_mcq` আলাদা নম্বরের MCQ।

## ১. কোড থেকে যাচাই করা অবস্থা (কিছু বদলানো হয়নি)
| জায়গা | এখন যা হয় |
|---|---|
| ক্রমিক নম্বর — `QbPaperController::printable` (লাইন ~237–251) | শুধু `slug = mcq` প্রশ্নকে MCQ ধরে; `stimulus_mcq_group` পায় একটি "অন্য" (লিখিত) নম্বর, তার উপ-প্রশ্নগুলোর কোনো নম্বর নেই |
| সেট ও বিকল্প এলোমেলো — `QbPaperSets::optionCounts/arrange` | শুধু উপরের স্তরের `qb_question_options` এলোমেলো করে; `items[].prompt_json.options` ছোঁয় না |
| উত্তরমালা (answer key) | শুধু উপরের স্তরের সঠিক বিকল্প; উপ-প্রশ্নের `answer_json.correct` বাদ |
| OMR — `QbOmrFormService::mcqIds`, `QbOmrReviewService` (লাইন ~143) | একই `slug = mcq` নিয়ম; সারির সংখ্যা = MCQ প্রশ্নের সংখ্যা; সব MCQ-র বিকল্প-সংখ্যা সমান হতে হবে (`option_count`); গ্রেডিং প্রতিটি MCQ-র নিজের নম্বর দিয়ে |
| নম্বর (marks) | প্রশ্নপত্রে প্রতিটি প্রশ্নের **একটি** বাধ্যতামূলক `marks`; মোট = তাদের যোগফল; উপ-প্রশ্নের `items[].marks` প্রশ্নব্যাংকে ঐচ্ছিক এবং প্রশ্নপত্র তা পড়ে না |

## ২. প্রস্তাবিত নিয়ম (বিকল্প B অনুযায়ী)
1. `stimulus_mcq_group` প্রশ্নব্যাংকে একটি রেকর্ড; প্রশ্নপত্রেও একটি আইটেম (একবারই যোগ করা যায়)।
2. ছাপায় উদ্দীপক **একবার**, তার ঠিক পরে উপ-প্রশ্নগুলো লেখার ক্রমে, একসাথে; প্রতিটি উপ-প্রশ্ন সাধারণ MCQ-র মতো ক/খ/গ/ঘ বিকল্পসহ।
3. মূল আইটেম কোনো নম্বর নেয় না; প্রতিটি উপ-প্রশ্ন একটি **MCQ নম্বর** নেয়। D129-এর MCQ নম্বর সেকশন ও বিষয়-ব্লক পেরিয়ে টানা চলে; লিখিত প্রশ্নের আলাদা নম্বর অপরিবর্তিত।
4. উত্তরমালা ও OMR-এর সারি ঠিক ওই উপ-প্রশ্নের MCQ নম্বরে।
5. সেট এলোমেলো: "serial" কৌশলে পুরো গ্রুপ (উদ্দীপক + উপ-প্রশ্ন) একটি ইউনিট হিসেবে সরে, ভেতরের ক্রম বদলায় না; "options" কৌশলে প্রতিটি উপ-প্রশ্নের বিকল্প আলাদাভাবে এলোমেলো, আর ছাপা, উত্তরমালা ও OMR-এ সঠিক উত্তর সেই নতুন অবস্থানে। চূড়ান্ত (final) সেট D126 অনুযায়ী জমে থাকে।
6. কেনা না হলে উত্তর লুকানো (আগের নিয়ম) — উপ-প্রশ্নের `answer_json.correct`-ও।
7. সাধারণ MCQ ও লিখিত প্রশ্নের নম্বর, সেট ও OMR আচরণ অপরিবর্তিত; নতুন টেবিল নয়।

## ৩. কাজ (প্রতিটি আলাদা commit, `Change-Request: D171`)
| টাস্ক | কাজ |
|---|---|
| STIM.1 | প্রশ্নপত্র: উপ-প্রশ্নের MCQ নম্বর, সেট-এলোমেলো, উত্তরমালা, ছাপা/প্রিভিউ (উদ্দীপক একবার) |
| STIM.2 | OMR: উপ-প্রশ্নের সারি, বিকল্প-সংখ্যা যাচাই, গ্রেডিং ও নম্বর (§৪-এর উত্তর অনুযায়ী) |
| STIM.3 | প্রশ্নতালিকা/লেখকের কার্ড: উদ্দীপক একবার, প্রতিটি উপ-প্রশ্ন সাধারণ MCQ-র মতো (মালিকের PC-র চারটি অসংরক্ষিত পরিবর্তন এখানে আসবে) |

## ৪. মালিকের কাছে প্রশ্ন
1. **উপ-প্রশ্নের নম্বর (marks) কোথা থেকে?**
   - ক) প্রশ্নপত্রে গ্রুপের একটি নম্বর দেওয়া হবে, তা উপ-প্রশ্নগুলোর মধ্যে **সমান ভাগ** (যেমন ৩ নম্বর, ৩টি উপ-প্রশ্ন → প্রতিটি ১; ভাগ না মিললে দুই দশমিকে, শেষটিতে বাকি);
   - খ) প্রশ্নপত্র-নির্মাতা **প্রতিটি উপ-প্রশ্নের নম্বর আলাদা** দেবেন;
   - গ) প্রশ্নব্যাংকের `items[].marks` থেকে (তখন সেটি বাধ্যতামূলক হবে; না থাকলে প্রশ্নপত্রে যোগ করা যাবে না)।
   - (সুপারিশ: **ক** — প্রশ্নপত্রের মোট নম্বর আগের মতোই প্রতিটি আইটেমের নম্বরের যোগফল থাকে, নতুন ঘর লাগে না।)
2. **প্রশ্নপত্রের মোট নম্বর:** গ্রুপের নম্বর একবারই যোগ হবে (উপ-প্রশ্নের ভাগ নয়) — ঠিক?
3. **OMR বিকল্প-সংখ্যা:** উপ-প্রশ্নের বিকল্প-সংখ্যা বাকি MCQ-র সমান না হলে (যেমন সব ৪টি, একটির ৫টি) OMR আগের মতো তৈরি হবে না ও কারণ দেখাবে — ঠিক?
4. টাস্ক ভাগ ও ক্রম STIM.1 → STIM.2 → STIM.3 ঠিক? (STIM.3 আগে করতে চাইলে বলুন — আপনার PC-র পরিবর্তনগুলো তখনই commit হতে পারে।)

## ৫. সিদ্ধান্তের সারি
| D171 | Stimulus-based MCQ: one bank record, child MCQs numbered in papers, keys and OMR (narrowly amends D129; D126/D128 unchanged) | Owner approved (2026-10-27). (1) A `stimulus_mcq_group` stays one question-bank record and one paper item; in a paper its stimulus prints once, followed by its `sub_mcq` children together in authored order, each with ordinary MCQ choice labels. (2) The parent takes no serial; every child takes the next MCQ serial; D129's separate MCQ / written serials still run on across sections and subject blocks; the answer key and the OMR rows use the same child serials. (3) Set shuffling: "serial" moves the whole group as one unit (children stay attached and in order); "options" shuffles each child's choices and the correct answer follows them consistently in print, answer key and OMR; final sets stay frozen (D126). (4) Marks: every child's `items[].marks` is required for a group to be used in a paper (a group without them cannot be added); the group's paper marks = the sum of its children's marks, set automatically and not editable by the paper author; the paper total counts the group once (the children's marks are its parts, never added on top); OMR grades each child with its own marks. (5) A child whose option count differs from the paper's MCQ option count blocks OMR generation with the reason shown, as for ordinary MCQs. (6) Answers stay hidden unless bought, children's `answer_json.correct` included. (7) Ordinary MCQs and written questions keep their behaviour; no new table. (8) Tasks in order STIM.3 (question-list / writer cards: stimulus once, each child as an ordinary MCQ — includes the owner's local UI edits), STIM.1 (paper: serials, sets, answer key, print / preview, marks), STIM.2 (OMR rows, option-count check, grading); commits carry `Change-Request: D171`. |

## ৬. মালিকের উত্তর (2026-10-27)
1. **গ১** — প্রতিটি উপ-প্রশ্নের নম্বর প্রশ্নব্যাংকের `items[].marks` থেকে (বাধ্যতামূলক); গ্রুপের নম্বর = তাদের যোগফল, প্রশ্নপত্রে নিজে থেকে বসে, নির্মাতা বদলাতে পারেন না।
2. হ্যাঁ — গ্রুপের নম্বর মোটে একবারই; উপ-প্রশ্নের নম্বর তার ভাগ, বাড়তি নয়।
3. হ্যাঁ — বিকল্প-সংখ্যা না মিললে OMR তৈরি হবে না, কারণ দেখাবে।
4. আগে STIM.3 (মালিকের PC-র চারটি UI পরিবর্তনসহ), তারপর STIM.1 → STIM.2।
