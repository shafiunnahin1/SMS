# খসড়া সিদ্ধান্ত D161: মেধা তালিকার PDF, অভিভাবককে ফলাফলের SMS (ব্যালেন্স শেষ হলে বাকিগুলো pending) আর ফলাফল সংশোধনের SMS

> এজেন্টের খসড়া। মালিক অনুমোদন করলে `owner\approve-D161.ps1` চালাবেন। স্ক্রিপ্টটি সারিটি `docs/LOCKED-DECISIONS.md`-এ যোগ করে, guard-এ নতুন টেবিল `exam_result_sms` যুক্ত করে, তারপর commit ও push করে। অনুমোদনের আগে কোড লেখা হবে না।

## মালিকের নির্দেশ (2026-10-24)
- মেধা তালিকার PDF হবে।
- ফলাফল চূড়ান্ত (প্রকাশ) করার পর প্রতিষ্ঠান প্রধান "SMS পাঠান" বোতাম দেখবেন। চাপলে অভিভাবকদের SMS যাবে।
- কিছু SMS যাওয়ার পর ওয়ালেটের ব্যালেন্স শেষ হলে বাকিগুলো pending থাকবে। রিপোর্টে "15/50" এভাবে দেখাবে। রিচার্জ করে আবার চাপলে শুধু pending-গুলো যাবে।
- ফলাফল চূড়ান্ত হলে শিক্ষকেরা আর বদলাতে পারবেন না। প্রতিষ্ঠান প্রধান পারবেন।
- প্রধান ফলাফল বদলালে ওই শিক্ষার্থীর অভিভাবকের কাছে সংশোধনের SMS যাবে: কোন পরীক্ষায় বদল হয়েছে, আগের ফলাফল, নতুন ফলাফল, আর ভুলের জন্য দুঃখ প্রকাশ।

## এখন কী আছে
- ফল প্রকাশের পর শিক্ষক নম্বর বদলাতে পারেন না, শুধু অ্যাডমিন পারেন। এটা আগে থেকেই আছে (`exam_published`)।
- এখনকার SMS ব্যবস্থায় "pending" অবস্থা নেই। ব্যালেন্স কম থাকলে SMS পাঠানো থেমে যায় (`sms_quota_exceeded`), কিছু লেখা থাকে না। কোন SMS গেছে আর কোনটা বাকি, তার হিসাব রাখতে নতুন টেবিল লাগবে।
- `coaching-private-batch.md` বলে: মেধা তালিকার PDF হবে, আর "ফলাফল SMS পাঠান" দিয়ে প্রতি অভিভাবককে নাম, নম্বর আর rank যাবে। D158 এগুলো বাইরে রেখেছিল।

## প্রস্তাবিত সারি
| D161 | Merit-list PDF, result SMS to guardians with pending on an empty wallet, and correction SMS (amends D158 "out of scope", uses D55-D60 wallet rules) | Owner approved (2026-10-24). (1) Merit list PDF: the exam page's merit list (D158 (2), with its batch filter) downloads as a PDF by SMS's own Chromium renderer (D50), same columns, the institution heading. (2) Result SMS: after an exam is published, the head of the institution (admin) sees "Send SMS"; it queues one message per sitting student with marks to the guardian phone (name, exam, total, percentage, rank; GPA when the institution uses it), in the recipient's SMS language (I18N section 7). Messages go out in a queued job; each is `sent`, `failed`, `skipped` (guardian switched SMS off - privacy-and-consent section 3) or `pending` (the wallet could not pay - the job stops charging when the balance runs out, never a negative balance). The report shows sent / total (e.g. 15/50) with pending, failed and skipped counts; pressing "Send SMS" again sends only pending and failed ones, never one already sent. (3) After publishing, teachers cannot change marks (as today); the admin may correct a mark. A correction of a published exam's mark queues a correction SMS to that student's guardian: "<exam>: the result has been corrected - before: <old>, now: <new>. We are sorry for the mistake." (old/new = that subject's marks and grade, and the new total/rank), sent at once by the same rules (pending if the wallet is empty). (4) New tenant table `exam_result_sms` (exam, student, kind result|correction, phone, message, status pending|sent|failed|skipped, sms_log_id, error, attempts, created_by, timestamps); schema.sql updated in the implementation commits; sms_logs stays the billing record. (5) Only the admin sends; audit log for each send run and each correction. Tests: 50 queued with a wallet for 15 -> 15 sent, 35 pending, balance 0 and never negative; resend after recharge sends the 35 only; skipped consent; own-API route never charges; a teacher cannot edit after publish; an admin correction queues exactly one correction SMS with old and new; the PDF renders the ranks. Implementation commits carry `Change-Request: D161`; the guard gains the table `exam_result_sms` for R2.1.7. |

## মালিককে যা দেখতে হবে
১. SMS-এ কী থাকবে: নাম, পরীক্ষা, মোট নম্বর, শতকরা আর মেধাক্রম। প্রতিষ্ঠান GPA ব্যবহার করলে GPA-ও থাকবে। আর কিছু চাইলে বলুন।
২. যে অভিভাবক SMS বন্ধ রেখেছেন, তাঁকে ফলাফলের SMS যাবে না, রিপোর্টে "skipped" দেখাবে। গোপনীয়তার নিয়মে ফলাফল "transactional" নয়।
৩. ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D161.ps1`
