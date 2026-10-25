# খসড়া সিদ্ধান্ত D165: শিক্ষার্থীর নিজের একাউন্ট, কেনাকাটা, মেয়াদ আর শিক্ষার্থীর AI (D112 (4)-এর বদল, D163 P2)

> এজেন্টের খসড়া। মালিক অনুমোদন করলে `owner\approve-D165.ps1` চালাবেন। স্ক্রিপ্টটি শুধু সিদ্ধান্তের সারি যোগ করে।
> guard-এ টাস্ক আর টেবিল যোগ করা মালিকের আলাদা কাজ, যেমন D164-এ হয়েছিল।

## মালিকের নির্দেশ (2026-10-26)
- প্রতিষ্ঠান ছাড়াও শিক্ষার্থী নিজে রেজিস্ট্রেশন করে একাউন্ট খুলতে পারবে। সে প্রতিষ্ঠানের সুবিধা ছাড়া বাকি সব ব্যবহার করবে:
  - লেখক ও মডারেটরের পাবলিক কুইজ,
  - কনসেপ্ট,
  - PDF ও বই,
  - প্রশ্নব্যাংকে প্র্যাক্টিস।
- শিক্ষার্থী নিজে কিনবে। প্রতিষ্ঠানের শিক্ষার্থীকেও নিজে কিনতে হবে, কারণ প্রতিষ্ঠানের কেনা প্রশ্ন শিক্ষার্থী পায় না।
- প্রতিষ্ঠানের শিক্ষার্থী একই লগইনে প্রতিষ্ঠানের সুবিধা আর নিজের কেনা প্র্যাক্টিস দুটোই পাবে।
- শিক্ষক আর শিক্ষার্থীর দাম আলাদা। দাম Super Admin পরে বসাবেন।
- কেনার ধরন:
  - একটি শ্রেণির সব,
  - একটি বিষয়,
  - একটি অধ্যায়,
  - একটি প্রশ্ন বা কনসেপ্ট,
  - একটি PDF,
  - একটি বই।
- মেয়াদ:
  - ক্লাস ৮ পর্যন্ত: কেনার বছরের ৩১ ডিসেম্বর পর্যন্ত।
  - SSC/HSC: শিক্ষার্থীর নিজের পরীক্ষা শেষ হওয়া পর্যন্ত। যেমন HSC ২০২৬ শেষ হয়েছে আগস্ট ২০২৬-এ।
- অভিভাবকের OTP-সম্মতি লাগবে না।
- AI-তে বেশি কড়াকড়ি চলবে না। অভিভাবকের অনুমতি চাইলে কেউ সেবাটি নেবে না।

## ১. যা আগে থেকেই আছে (নতুন করে বানানো হবে না)
- **দুই ধরনের দাম:** `qb_prices` আর `qb_price_rules`-এ ক্রেতা `institution` বা `student`। দামের ব্যবস্থা (`QbPricingService::quote('student', …)`) তৈরি আছে।
- **শিক্ষার্থীর কেনাকাটার টেবিল:**
  - `qb_student_orders`: bKash দিয়ে প্ল্যাটফর্মের মার্চেন্টে পেমেন্ট, প্রতি অর্ডারে আলাদা। কোনো ওয়ালেট নেই।
  - `qb_student_unlocks`: একটি করে প্রশ্ন, কনসেপ্ট বা রিসোর্স (PDF/বই)।
  - `qb_student_package_access`: মেয়াদসহ কুইজ-প্যাকেজ।
- **পাবলিক কুইজ** (QB.10) আর লেখকের ভাগ (`qb_writer_earnings`)।

## ২. শিক্ষার্থীর নিজের একাউন্ট (D112 (4)-এর বদল)
- **রেজিস্ট্রেশন:** central host-এর পাবলিক পাতায় নাম, মোবাইল নম্বর আর পাসওয়ার্ড দিয়ে। মোবাইল যাচাই হবে বিদ্যমান OTP দিয়ে, শিক্ষার্থীর নিজের নম্বরে।
  - অভিভাবকের সম্মতি বা OTP লাগবে না।
  - বাধ্যতামূলক টিকবক্স: "গোপনীয়তা নীতি ও শর্ত পড়েছি"।
  - বয়স জিজ্ঞাসা করা হবে না।
- **ঠিকানা (tenancy):** নিজে রেজিস্ট্রেশন করা সব শিক্ষার্থী একটি প্ল্যাটফর্ম-প্রতিষ্ঠানের অধীনে থাকবে, যার ধরন `learners`।
  - এতে বিদ্যমান টেবিলের `institution_id NOT NULL` আর tenant-বিচ্ছিন্নতার নিয়ম (D25) না ভেঙেই সব চলে।
  - এই প্রতিষ্ঠানে হাজিরা, ফি, ফল বা অন্য কোনো প্রতিষ্ঠানিক মডিউল চালু থাকবে না। কেউ এর admin হবে না; শুধু Super Admin দেখতে পাবেন।
- **প্রোফাইল:** রেজিস্ট্রেশনে শিক্ষার্থী নিজের শ্রেণি বাছবে। নবম থেকে দ্বাদশ শ্রেণির শিক্ষার্থী নিজের পরীক্ষা-ব্যাচও বাছবে, যেমন "SSC ২০২৮"। পরে প্রোফাইল থেকে বদলানো যাবে।
- **প্রতিষ্ঠানের শিক্ষার্থী:** এখনকার student লগইনেই "প্র্যাক্টিস ও কেনাকাটা" অংশ যোগ হবে। কেনা জিনিস তার নিজের user-এর নামে থাকবে।
  - প্রতিষ্ঠানের কেনা প্রশ্ন (`qb_unlocks`) শিক্ষার্থীকে খুলে দেয় না, আর শিক্ষার্থীর কেনা জিনিস প্রতিষ্ঠানকে খুলে দেয় না।
  - প্রতিষ্ঠান বদলালে বা ছেড়ে দিলে আগে কেনা জিনিস কী হবে, তা §৮-এ।

## ৩. কেনার ধরন
| ধরন | কী খোলে |
|---|---|
| শ্রেণি (সব) | ওই শ্রেণির পাঠ্যক্রমের সব বিষয়-অধ্যায়ের প্রকাশিত প্রশ্ন, কনসেপ্ট, আর ওই শ্রেণি-বিষয়-অধ্যায়ে যুক্ত PDF/বই |
| বিষয় | একটি শ্রেণির একটি বিষয়ের সব কিছু, ওপরের মতো |
| অধ্যায় | একটি অধ্যায়ের সব কিছু, ওপরের মতো |
| প্রশ্ন / কনসেপ্ট | শুধু সেটি (বিদ্যমান `qb_student_unlocks`) |
| PDF / বই | শুধু সেটি (বিদ্যমান `qb_student_unlocks`, ধরন `resource`) |

- **শ্রেণি, বিষয় আর অধ্যায়ের প্যাকেজ:** নতুন টেবিল `qb_student_scope_access`, কলাম: শিক্ষার্থী, স্তর (শ্রেণি, বিষয় বা অধ্যায়), পাঠ্যক্রম-নোড, শুরু, মেয়াদ শেষ, অর্ডার। মেয়াদের মধ্যে প্যাকেজে নতুন যোগ হওয়া জিনিসও খোলা থাকবে।
- **দাম:** প্রতিটি ধরনের শিক্ষার্থী-দাম Super Admin বসাবেন। এর জন্য `qb_prices`-এ শ্রেণি, বিষয় আর অধ্যায়ের দাম বসানোর ঘর যোগ হবে। কোনো ধরনের দাম না বসালে সেটি বিক্রি হবে না, যেমন এখন হয়।
- **আগে কেনা থাকলে:** কেউ একটি অধ্যায় কেনার পর পুরো বিষয় কিনলে আগের টাকা বাদ যাবে না। প্রয়োজনে Super Admin ছাড়ের নিয়ম দিয়ে তা করবেন।
- **টাকার রেকর্ড:** কোনো রেকর্ড মোছা বা বদলানো যাবে না (D32)। লেখকের ভাগ আগের নিয়মেই (D66)। পেমেন্ট শুধু bKash sandbox দিয়ে পরীক্ষা হবে; আসল মার্চেন্ট একাউন্ট মালিকের বিষয়।

## ৪. মেয়াদ
- **পরীক্ষা-ব্যাচ:** নতুন টেবিল `qb_exam_batches`।
  - কলাম: নাম (যেমন "SSC ২০২৭"), ধরন (SSC বা HSC), কোন শ্রেণিগুলো এর আওতায়, পরীক্ষা শেষের তারিখ।
  - Super Admin ব্যাচ বানাবেন আর তারিখ বদলাতে পারবেন। তারিখ বদলালে সেই ব্যাচের শিক্ষার্থীর সব মেয়াদ সাথে সাথে বদলাবে, কারণ মেয়াদ গোনা হয় ব্যাচের তারিখ থেকে।
- **নিয়ম** (কেনার মুহূর্তে সার্ভার মেয়াদ ঠিক করবে):
  - শ্রেণি ৮ বা তার নিচে: কেনার বছরের ৩১ ডিসেম্বর রাত ১১:৫৯, বাংলাদেশ সময়ে।
  - শ্রেণি ৯ থেকে ১২, ব্যাচ বাছা থাকলে: সেই ব্যাচের পরীক্ষা শেষের দিন পর্যন্ত।
  - শ্রেণি ৯ থেকে ১২ কিন্তু ব্যাচ বাছা নেই, বা ব্যাচ বা শ্রেণির বাইরের কিছু (যেমন ভর্তি-প্রস্তুতি): কেনার দিন থেকে ১২ মাস।
  - একটি প্রশ্ন, কনসেপ্ট, PDF বা বই আলাদা কিনলেও একই নিয়মে মেয়াদ। এখন `qb_student_unlocks` স্থায়ী, তাই তাতে মেয়াদের কলাম যোগ হবে (§৮-এর ২)।
- **কেনার আগে দেখানো:** "এটি ৩১ ডিসেম্বর ২০২৬ পর্যন্ত চলবে"। মেয়াদ ৩০ দিনের কম থাকলে সতর্কবার্তা দেখাবে।
- **মেয়াদ শেষে:** জিনিসটি লক হয়ে যাবে। আগের প্র্যাক্টিসের ফল আর ইতিহাস থেকে যাবে।

## ৫. প্র্যাক্টিস
- শিক্ষার্থী শ্রেণি, বিষয় বা অধ্যায় বেছে প্র্যাক্টিস করবে। যা কিনেছে বা যা বিনামূল্যের, সেটির উত্তর ও ব্যাখ্যা দেখাবে।
- উত্তর যাচাই হবে সার্ভারে। না কেনা প্রশ্নের উত্তর কখনো ব্রাউজারে যাবে না (`QbQuestionPublicResource`, বিদ্যমান নিয়ম)।
- নিজের কোন অধ্যায়ে কত ঠিক হলো, তার সহজ হিসাব দেখাবে।

## ৬. শিক্ষার্থীর AI (D163 P2, হালকা নিয়ম)
- P1-এর একই চ্যাটবট, শিক্ষার্থীর জন্য চালু। নিজে রেজিস্ট্রেশন করা আর প্রতিষ্ঠানের, দুই ধরনের শিক্ষার্থীই পাবে।
- **খোঁজা হবে পুরো প্ল্যাটফর্মের প্রকাশিত প্রশ্নব্যাংকে**, P1-এর মতোই।
- **উত্তর দেখানোর নিয়ম:**
  - শিক্ষার্থীর কেনা বা বিনামূল্যের প্রশ্ন: উত্তর আর ব্যাখ্যা পুরোটা।
  - না কেনা প্রশ্ন: শিক্ষার্থীপ্রতি দৈনিক ফ্রি সীমার মধ্যে উত্তর দেখাবে (২০টি; Super Admin বদলাতে পারবেন)। সীমা শেষ হলে "কিনুন" বোতাম।
- **একটাই বাধা:** শিক্ষার্থী যে অনলাইন কুইজ বা পরীক্ষা এখন দিচ্ছে, শুধু সেই কুইজের প্রশ্নের উত্তর চ্যাটবট সেই সময়টুকু দেবে না। এর বাইরে কোনো বাধা নেই।
- **সম্মতি:** অভিভাবকের সম্মতি বা OTP লাগবে না।
- **গোপনীয়তা:** শিক্ষার্থীর চ্যাট রিভিউতে যাবে নাম-পরিচয় ছাড়া, ফোন আর আইডি মুছে, P1-এর মতো। নিজের পুরনো চ্যাট শিক্ষার্থী নিজে মুছে ফেলতে পারবে।
- **দৈনিক প্রশ্নের সীমা:** শুরুতে নেই। Super Admin চাইলে বসাবেন, যেমন P1-এ।

## ৭. ধাপ (প্রতিটি আলাদা commit, `Change-Request: D165`)
| টাস্ক | কাজ |
|---|---|
| ST.1 | `learners` প্ল্যাটফর্ম-প্রতিষ্ঠান, নিজে রেজিস্ট্রেশন (OTP), লগইন, শ্রেণি আর পরীক্ষা-ব্যাচের প্রোফাইল |
| ST.2 | `qb_exam_batches` (Super Admin পাতা), মেয়াদ গোনার নিয়ম, `qb_student_unlocks`-এ মেয়াদ |
| ST.3 | শ্রেণি, বিষয় আর অধ্যায়ের প্যাকেজ: `qb_student_scope_access`, শিক্ষার্থী-দাম বসানো, কেনার পাতা (bKash sandbox) |
| ST.4 | প্র্যাক্টিস আর কেনা জিনিস দেখা: কনসেপ্ট, PDF আর বই; মেয়াদ শেষে লক |
| ST.5 | প্রতিষ্ঠানের শিক্ষার্থীর লগইনে "প্র্যাক্টিস ও কেনাকাটা" |
| ST.6 | শিক্ষার্থীর AI: শিক্ষার্থীর দৈনিক ফ্রি সীমা, চলমান কুইজে বাধা, নিজের চ্যাট মোছা |

নতুন টেবিল: `qb_exam_batches`, `qb_student_scope_access`। বদলানো টেবিল (নতুন migration দিয়ে): `qb_student_unlocks` (মেয়াদ), `qb_prices` (শ্রেণি, বিষয় আর অধ্যায়ের দাম), শিক্ষার্থীর প্রোফাইলে শ্রেণি ও ব্যাচ। কোনো নতুন package লাগবে না।

## ৮. মালিকের উত্তর (2026-10-26)
1. প্রতিষ্ঠানের শিক্ষার্থী প্রতিষ্ঠান ছেড়ে দিলে তার একাউন্ট `learners`-এ সরে যাবে, কেনা জিনিস মেয়াদ পর্যন্ত থাকবে।
2. একক প্রশ্ন, কনসেপ্ট, PDF বা বইয়ের মেয়াদ প্যাকেজের নিয়মেই।
3. শিক্ষার্থীর AI-তে দৈনিক ফ্রি উত্তর ২০টি।

| D165 | Self-registered students, student purchases with validity, and the student AI assistant (amends D112 (4); D163 (6) P2) | Owner approved (2026-10-26). (1) Students may self-register on the central host (name, own mobile verified by the existing OTP, password, privacy/terms checkbox; no guardian consent or OTP, no age question) and use every non-institutional feature: writer/moderator public quizzes, concepts, PDFs/books and question-bank practice; they live under one platform institution of type `learners` (no institutional modules, no admin, Super Admin only) so D25 tenancy and existing NOT NULL institution_id stay intact. Institution students get the same practice and purchases in their existing student login. (2) Students buy for themselves with the existing per-order bKash flow to the platform merchant (no wallet, sandbox only until the owner's merchant account): a whole class, a subject, a chapter (new `qb_student_scope_access`, newly added content included while valid), or a single question/concept/PDF/book (existing `qb_student_unlocks`, gaining an expiry). An institution's unlocks never open content for its students and a student's purchases never open it for the institution. Student prices are separate from institution prices and are set later by the Super Admin per kind (class, subject, chapter added to `qb_prices`); no price = not for sale; buying a larger scope gives no automatic credit for a smaller one. Financial rows are never deleted (D32); writer shares per D66. (3) Validity is fixed by the server at purchase and shown before payment: class 8 or below until 31 December of the purchase year (Asia/Dhaka); class 9-12 with a chosen exam batch until that batch's exam end date (new `qb_exam_batches`, Super Admin managed; changing the date moves every expiry); otherwise 12 months from purchase; expired items lock while attempt history stays. (4) Student AI (P2, light rules): the P1 assistant for both kinds of students, searching the whole platform's published bank; bought or free items fully answered, others within a per-student daily free quota (default 20, Super Admin setting), else a buy button; the only block is the questions of a quiz the student is taking right now; no guardian consent; chats reviewed de-identified as in D164 and deletable by the student; no daily question limit unless the Super Admin sets one. (5) Tasks ST.1-ST.6 as listed in owner/decision-D165-student-learning.md, each with `Change-Request: D165`; the owner adds the tasks and tables to the guard separately; no new packages. Owner answers: a student who leaves an institution moves to `learners` keeping purchases until expiry; single items share the scope validity rule. |
