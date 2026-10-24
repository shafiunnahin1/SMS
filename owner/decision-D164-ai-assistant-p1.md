# খসড়া সিদ্ধান্ত D164: AI চ্যাটবট P1 — যেকোনো সার্ভারে চলে, GPU বা বাড়তি খরচ ছাড়া

> এজেন্টের খসড়া। এটি D163-এর ধাপ P1-এর পরিকল্পনা।
> মালিক অনুমোদন করলে `owner\approve-D164.ps1` চালাবেন; স্ক্রিপ্টটি শুধু সিদ্ধান্তের সারি যোগ করে।
> guard-এ টাস্ক আর টেবিল যোগ করা মালিকের আলাদা কাজ।

## মালিকের নির্দেশ (2026-10-24)
- অনেক টাকা খরচ করা সম্ভব নয়। GPU সার্ভার ভাড়া বা কেনা হবে না।
- চ্যাটবট যেকোনো সার্ভারে চলবে। আমাদের ডেটাবেস থেকে উত্তর মিলিয়ে দেবে: কখনো সরাসরি, কখনো নতুনভাবে সাজিয়ে।

## ১. কীভাবে কাজ করবে (খরচ শূন্য)
চ্যাটবটটি আমাদের এখনকার Laravel আর MySQL-এর ভেতরেই চলবে। কোনো বড় AI মডেল লাগবে না, তাই নতুন সার্ভার বা প্যাকেজও লাগবে না। ধাপগুলো:

1. **প্রশ্ন বোঝা:** শিক্ষকের লেখা থেকে শব্দ আলাদা করা হবে। বাংলা আর ইংরেজি সংখ্যা এক করা হবে, আর "কী", "কেন"-র মতো সাধারণ শব্দ বাদ যাবে। লেখায় শ্রেণি, বিষয় বা অধ্যায়ের নাম থাকলে সেটাও ধরা হবে।
2. **খোঁজা:** MySQL-এর পূর্ণ-লেখা খোঁজা (FULLTEXT) দিয়ে তিন জায়গায় খোঁজা হবে:
   - **ক. যাচাই-করা উত্তরের ভাণ্ডার:** রিভিউয়ারদের অনুমোদিত, সংশোধিত বা নতুন লেখা উত্তর।
   - **খ. প্রশ্নব্যাংক:** প্রশ্ন, বিকল্প, ব্যাখ্যা, সৃজনশীলের অংশ।
   - **গ. পাঠ্যক্রম:** অধ্যায় আর বিষয়।

   শুধু সেই ডেটা খোঁজা হবে, যা প্রতিষ্ঠান দেখতে পায়: নিজের প্রশ্ন আর কেনা বা unlock করা প্রশ্ন।
3. **উত্তর দেওয়া:**
   - **সরাসরি:** যাচাই-করা ভাণ্ডারে খুব কাছের মিল পেলে সেই উত্তরটাই দেওয়া হবে, "যাচাই-করা উত্তর" চিহ্নসহ।
   - **নতুনভাবে সাজানো:** তা না পেলে প্রশ্নব্যাংক আর পাঠ্যক্রম থেকে সবচেয়ে কাছের ৩–৫টি মিল নিয়ে নির্দিষ্ট বাংলা বাক্য-কাঠামোয় সাজানো উত্তর বানানো হবে। যেমন: "এ বিষয়ে আমাদের প্রশ্নব্যাংকে যা আছে: … ব্যাখ্যা: … সম্পর্কিত অধ্যায়: …"। প্রতিটি অংশের সাথে উৎস থাকবে।
   - **কিছু না পেলে:** বলবে "আমাদের ডেটায় পাইনি", আর প্রশ্নটি রিভিউ-তালিকায় পাঠাবে যাতে রিভিউয়ার নতুন উত্তর লিখতে পারেন।
4. **শেখা (খরচ ছাড়াই):**
   - রিভিউয়ারের নতুন বা সংশোধিত উত্তর যাচাই-করা ভাণ্ডারে যোগ হয়।
   - পরে একই রকম প্রশ্ন এলে সেটাই সরাসরি উত্তর হয়।
   - গুরুত্ব: নতুন লেখা ৩, সংশোধিত ২, অনুমোদিত ১। যেটির গুরুত্ব বেশি, মিলের তালিকায় সেটি আগে আসে।
   - এভাবে যত চ্যাট আর রিভিউ, তত ভালো উত্তর আসে। এর জন্য কোনো মডেল শেখাতে হয় না।

**সীমা (সৎভাবে):**
- এটি ChatGPT-এর মতো ইচ্ছেমতো নতুন বাক্য লিখতে পারবে না। উত্তর আসবে ডেটা থেকে, নির্দিষ্ট কাঠামোয়।
- খুব ভিন্ন ভাষায় প্রশ্ন করলে মিল কম পেতে পারে।
- এর বদলে লাভ: খরচ শূন্য, মনগড়া উত্তর নেই, প্রতিটি উত্তরে উৎস।

## ২. পরে চাইলে (ঐচ্ছিক, P1-এর অংশ নয়): ছোট মডেল CPU-তে
- উত্তরের ভাষা আরও স্বাভাবিক করতে পরে একটি ছোট খোলা মডেল যোগ করা যায়, যেমন ১.৫–৪B আকারের Qwen।
- এটা GPU ছাড়া সাধারণ VPS-এ চলে (llama.cpp দিয়ে, ৮–১৬ GB RAM), মাসে আনুমানিক ২,০০০–৫,০০০ টাকায়।
- এটা শুধু খোঁজে পাওয়া লেখাকে নতুন ভাষায় সাজাবে; নিজে থেকে তথ্য যোগ করবে না।
- উত্তর ধীর হবে (কয়েক সেকেন্ড থেকে আধা মিনিট), আর ছোট মডেলের বাংলা দুর্বল।
- তাই এটা আলাদা সিদ্ধান্তে, P1 চালুর পর দরকার মনে হলে।

## ৩. রিভিউ-তালিকা (D163 (5))
- প্রতিটি উত্তর সাথে সাথে দেখাবে। "যাচাই-করা" উত্তর ছাড়া বাকি সব উত্তরে "এখনো যাচাই হয়নি" চিহ্ন থাকবে।
- উত্তরগুলো যাবে প্ল্যাটফর্মের `content_writer` আর `content_moderator`-এর তালিকায়, central host-এ।
- তালিকায় শিক্ষক বা প্রতিষ্ঠানের নাম দেখাবে না। ফোন নম্বর আর আইডি মুছে দেওয়া হবে।
- রিভিউয়ার উত্তরটি অনুমোদন, সংশোধন বা নতুন করে লিখবেন।
- সংশোধিত বা নতুন উত্তর শিক্ষকের চ্যাটে আগের উত্তরের জায়গা নেবে; আগেরটা ইতিহাসে থাকবে। শিক্ষক নোটিফিকেশন পাবেন।
- "পাইনি" আর 👎 পাওয়া উত্তর তালিকায় আগে আসবে।
- প্রতিষ্ঠান প্রধান চাইলে নিজের প্রতিষ্ঠানের উত্তর রিভিউতে পাঠানো বন্ধ রাখতে পারবেন।
- **ভাণ্ডারের আওতা:** রিভিউয়ারের লেখা উত্তর সব প্রতিষ্ঠানের সাধারণ জ্ঞান হিসেবে ভাণ্ডারে যাবে। কিন্তু উত্তরে যদি কোনো প্রতিষ্ঠানের নিজস্ব প্রশ্নের উল্লেখ থাকে, তবে সেই উত্তর শুধু সেই প্রতিষ্ঠানই দেখবে।

## ৪. টেবিল (schema.sql আর migration কাজের commit-এ)
- `ai_conversations`: প্রতিষ্ঠান, ব্যবহারকারী, শিরোনাম।
- `ai_messages`: প্রশ্ন বা উত্তর, উত্তরের ধরন (direct / composed / not_found), উৎসের তালিকা, রেটিং।
- `ai_reviews`: উত্তর; অবস্থা unreviewed / approved / corrected / rewritten; রিভিউয়ারের লেখা; গুরুত্ব ১/২/৩।
- `ai_answer_bank`: যাচাই-করা প্রশ্ন আর উত্তর, গুরুত্ব, আওতা (সবার বা একটি প্রতিষ্ঠানের), FULLTEXT সূচি।
- প্রশ্নব্যাংক আর পাঠ্যক্রমের টেবিলে নতুন FULLTEXT সূচি যোগ হবে, শুধু নতুন migration দিয়ে।

## ৫. মান যাচাই
- **পরীক্ষা-সেট:** প্রশ্নব্যাংক থেকে ২০০টি বাংলা প্রশ্ন, যেগুলোর সঠিক উৎস জানা।
- **কী মাপা হবে:** ঠিক উৎস প্রথম ৩টি মিলের মধ্যে আসে কি না, আর অন্য প্রতিষ্ঠানের ডেটা একবারও আসে কি না।
- **চালু করার শর্ত:** প্রস্তাব, অন্তত ৭০% প্রশ্নে ঠিক উৎস প্রথম ৩টির মধ্যে, আর অন্য প্রতিষ্ঠানের ডেটা ০।

## ৬. কাজের ভাগ (প্রতিটি আলাদা commit আর টেস্ট)
| টাস্ক | কী |
|---|---|
| AI-P1.1 | টেবিল, FULLTEXT সূচি, মডিউল `ai_assistant`, শিক্ষক ও প্রধানের role, tenant-isolation টেস্ট |
| AI-P1.2 | খোঁজা আর উত্তর বানানো: শব্দ আলাদা করা, তিন জায়গায় খোঁজা, সরাসরি বা সাজানো উত্তর, উৎস |
| AI-P1.3 | চ্যাট পাতা (শিক্ষক): উত্তর, উৎস, "যাচাই হয়নি" চিহ্ন, 👍/👎 |
| AI-P1.4 | রিভিউ-তালিকা (লেখক বা মডারেটর): অনুমোদন / সংশোধন / নতুন লেখা, ভাণ্ডারে যোগ, নোটিফিকেশন |
| AI-P1.5 | পরীক্ষা-সেট, মান যাচাই, দৈনিক সীমা আর ব্যবহারের রিপোর্ট |

## প্রস্তাবিত সারি
| D164 | AI assistant P1: teacher text chat answered from SMS's own data on any server - no GPU, no model, no new package (D163 (6) P1; narrows D163 (2) for P1) | Owner approved (2026-10-24). (1) P1 users: teachers and the head of the institution; text only. The assistant runs inside the existing Laravel/MySQL application on any server; no GPU, no language model and no new package or service in P1. (2) Answering: the question is normalized (Bangla/English digits, stop words, class/subject/chapter names) and searched with MySQL FULLTEXT in (a) the reviewed answer bank, (b) the institution's reachable question-bank content (own and unlocked questions, options, explanations, creative parts) and (c) curriculum chapters/topics; a close reviewed match is returned directly marked "reviewed answer"; otherwise an answer is composed from the 3-5 best matches with fixed Bangla templates, each part with its source; nothing found -> "not found in our data" and the question goes to review. Never another institution's private items or unpublished papers. (3) Review (D163 (5)): every answer is shown at once (non-bank answers marked "not yet reviewed") and queued, de-identified, for the platform's content_writer / content_moderator on the central host; approved / corrected / rewritten with weight 1 / 2 / 3; corrected or rewritten answers replace the shown one (history kept), the teacher is notified, and they join the answer bank - ranked by weight - so later similar questions are answered directly (learning without model training); not-found and thumbs-down first; the head may switch off sending the institution's answers to review; a bank answer that names an institution's own items is visible only to that institution. (4) New tenant tables `ai_conversations`, `ai_messages`, `ai_reviews` and platform/tenant-scoped `ai_answer_bank`, plus FULLTEXT indexes on question-bank and curriculum text, by new migrations (schema in the task commits). (5) Quality gate: 200 Bangla questions with known sources; live only when the right source is in the top 3 for >= 70% and there are zero cross-institution results (owner may change the bar). Per-institution daily question limit. Module key `ai_assistant`, one price (D47, owner sets it). (6) An optional small open model on CPU (e.g. 1.5-4B via llama.cpp on an 8-16 GB VPS) only to rephrase found text is a later, separate decision. (7) Tasks AI-P1.1 to AI-P1.5 as in the plan file, one per commit with tests; the owner adds them and the tables to the guard in a separate human commit before code starts. Implementation commits carry `Change-Request: D164`. |

## মালিককে যা ঠিক করতে হবে
১. **চালু করার মান:** ৭০% প্রশ্নে ঠিক উৎস প্রথম ৩টির মধ্যে। ঠিক আছে, নাকি অন্য মান?
২. **ভাণ্ডারের আওতা:** রিভিউয়ারের লেখা উত্তর সব প্রতিষ্ঠানের জন্য সাধারণ জ্ঞান হবে, শুধু প্রতিষ্ঠানের নিজস্ব প্রশ্নের উল্লেখ থাকলে আলাদা। ঠিক আছে?
৩. **দাম আর দৈনিক সীমা:** মডিউলের দাম আর প্রতিষ্ঠানপ্রতি দৈনিক প্রশ্নের সীমা। এখনই, নাকি পরে?
৪. ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D164.ps1`
