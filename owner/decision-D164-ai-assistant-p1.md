# খসড়া সিদ্ধান্ত D164: AI চ্যাটবট P1 — যেকোনো সার্ভারে চলে, GPU বা বাড়তি খরচ ছাড়া

> এজেন্টের খসড়া। এটি D163-এর ধাপ P1-এর পরিকল্পনা।
> মালিক অনুমোদন করলে `owner\approve-D164.ps1` চালাবেন; স্ক্রিপ্টটি শুধু সিদ্ধান্তের সারি যোগ করে।
> guard-এ টাস্ক আর টেবিল যোগ করা মালিকের আলাদা কাজ।

## মালিকের নির্দেশ (2026-10-24)
- উত্তরের ভাষা স্বাভাবিক করতে ছোট মডেল CPU-তে যুক্ত হবে, সাধারণ VPS-এ।
- অনেক টাকা খরচ করা সম্ভব নয়। GPU সার্ভার ভাড়া বা কেনা হবে না।
- চ্যাটবট যেকোনো সার্ভারে চলবে। আমাদের ডেটাবেস থেকে উত্তর মিলিয়ে দেবে: কখনো সরাসরি, কখনো নতুনভাবে সাজিয়ে।
- চ্যাটবট শুধু প্রতিষ্ঠানের unlock করা প্রশ্নে নয়, পুরো প্ল্যাটফর্মের প্রশ্নব্যাংকে খুঁজবে। এটাই হবে প্রজেক্টের অন্যতম আকর্ষণ।
- unlock না করা প্রশ্নের উত্তর আর ব্যাখ্যা প্রতিদিন কয়েকটি ফ্রি দেখাবে। তারপর unlock লাগবে।

## ১. কীভাবে কাজ করবে (খরচ শূন্য)
চ্যাটবটটি আমাদের এখনকার Laravel আর MySQL-এর ভেতরেই চলবে। কোনো বড় AI মডেল বা GPU লাগবে না। ভাষা সাজানোর জন্য শুধু একটি ছোট মডেল আলাদা সস্তা VPS-এ চলবে (§২)। ধাপগুলো:

1. **প্রশ্ন বোঝা:** শিক্ষকের লেখা থেকে শব্দ আলাদা করা হবে। বাংলা আর ইংরেজি সংখ্যা এক করা হবে, আর "কী", "কেন"-র মতো সাধারণ শব্দ বাদ যাবে। লেখায় শ্রেণি, বিষয় বা অধ্যায়ের নাম থাকলে সেটাও ধরা হবে।
2. **খোঁজা:** MySQL-এর পূর্ণ-লেখা খোঁজা (FULLTEXT) দিয়ে তিন জায়গায় খোঁজা হবে:
   - **ক. যাচাই-করা উত্তরের ভাণ্ডার:** রিভিউয়ারদের অনুমোদিত, সংশোধিত বা নতুন লেখা উত্তর।
   - **খ. প্রশ্নব্যাংক:** প্রশ্ন, বিকল্প, ব্যাখ্যা, সৃজনশীলের অংশ।
   - **গ. পাঠ্যক্রম:** অধ্যায় আর বিষয়।

   খোঁজা হবে **পুরো প্ল্যাটফর্মের প্রকাশিত প্রশ্নব্যাংকে**, শুধু unlock করা প্রশ্নে নয়। অন্য প্রতিষ্ঠানের নিজস্ব ডেটা কখনো খোঁজা হবে না, যেমন প্রশ্নপত্র, কেনার তালিকা, OMR আর নম্বর।
   - **unlock করা বা বিনামূল্যের প্রশ্ন:** উত্তর আর ব্যাখ্যা পুরোটা দেখাবে।
   - **unlock না করা প্রশ্ন:** প্রশ্ন, অধ্যায় আর বিষয় দেখাবে। উত্তর ও ব্যাখ্যা দেখাবে **প্রতিষ্ঠানপ্রতি দৈনিক ফ্রি সীমার মধ্যে** (প্রস্তাব ২০টি উত্তর; সংখ্যা Super Admin বদলাতে পারবেন)। সীমা শেষ হলে উত্তর লুকানো থাকবে, পাশে "unlock করুন" বোতাম।
   - **ফ্রি দেখা unlock নয়:** চ্যাটবটে ফ্রি দেখা উত্তর প্রশ্নপত্রে ব্যবহার বা ছাপার অনুমতি দেয় না। সেজন্য আগের মতোই unlock লাগবে।
   - **হিসাব:** কোন প্রশ্নের উত্তর কবে দেখানো হলো, তা লেখা থাকবে। সীমা গোনা হবে শুধু সার্ভারে।
   - **রিভিউয়ারের লেখা উত্তর** (যাচাই-করা ভাণ্ডার) সবসময় ফ্রি। তবে সেই উত্তর কোনো unlock না করা প্রশ্নের সঠিক বিকল্প হুবহু বলে দিলে সেটাও দৈনিক সীমায় গোনা হবে।
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

## ২. ছোট ভাষা-মডেল CPU-তে (মালিকের নির্দেশে P1-এর অংশ)
- **কাজ কী:** খোঁজে পাওয়া লেখা আর রিভিউয়ারের উত্তরকে স্বাভাবিক বাংলায় নতুন করে সাজানো। মডেল নিজে থেকে কোনো তথ্য যোগ করবে না। শুধু দেওয়া লেখা থেকে লিখবে, আর উৎস আগের মতোই দেখাবে।
- **মডেল:** খোলা লাইসেন্সের ছোট মডেল, যেমন Qwen3 1.7B বা 4B (৪-বিট)। চূড়ান্ত বাছাই §৫-এর পরীক্ষা-সেট দিয়ে, লাইসেন্স যাচাইসহ (বাণিজ্যিক ব্যবহারের অনুমতি থাকতে হবে)।
- **চলবে কোথায়:** llama.cpp দিয়ে GPU ছাড়া একটি সাধারণ VPS-এ। VPS-এ ৪–৮ vCPU আর ৮–১৬ GB RAM লাগবে, আনুমানিক মাসে ২,০০০–৫,০০০ টাকা। এই খরচ শুধু আনুমানিক; ভাড়ার আগে তখনকার দাম যাচাই করতে হবে। Laravel শুধু অভ্যন্তরীণ নেটওয়ার্কে এর সাথে কথা বলবে, বাইরে কোনো তথ্য যাবে না।
- **ধীর বা বন্ধ থাকলে:** CPU-তে উত্তর লিখতে কয়েক সেকেন্ড থেকে আধা মিনিট লাগতে পারে। তাই:
  - প্রথমে সাথে সাথে কাঠামো-মাফিক উত্তর (§১) দেখাবে।
  - মডেলের সাজানো উত্তর তৈরি হলে সেটি জায়গা নেবে।
  - মডেল বন্ধ থাকলে বা সময়মতো উত্তর না দিলে কাঠামো-মাফিক উত্তরটাই থাকবে।
  - এভাবে চ্যাটবট মডেল ছাড়াও সবসময় চলবে।
- **ভরসার নিয়ম:** মডেলের লেখায় যদি এমন সংখ্যা বা সঠিক বিকল্প আসে, যা দেওয়া লেখায় নেই, তবে সেই উত্তর বাদ যাবে আর কাঠামো-মাফিক উত্তর থাকবে। মডেলের লেখা উত্তরও রিভিউ-তালিকায় যাবে, আগের মতোই।
- **ইনস্টল:** llama.cpp আর মডেলের ফাইল নতুন সফটওয়্যার (G7)। VPS ভাড়া আর ইনস্টলের অনুমতি এই সিদ্ধান্তে দেওয়া হচ্ছে। তবে guard-এ যোগ করা মালিকের আলাদা commit।

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
| AI-P1.2 | খোঁজা আর উত্তর বানানো: শব্দ আলাদা করা, তিন জায়গায় খোঁজা, সরাসরি বা সাজানো উত্তর, উৎস; unlock না করা উত্তরের দৈনিক ফ্রি সীমা (সার্ভারে গোনা) আর "unlock করুন"; `QuestionAnswerNeverLeaksTest`-এ চ্যাটবটের নতুন পরীক্ষা: সীমার বাইরে উত্তর বা `is_correct` কখনো যায় না |
| AI-P1.3 | চ্যাট পাতা (শিক্ষক): উত্তর, উৎস, "যাচাই হয়নি" চিহ্ন, 👍/👎 |
| AI-P1.4 | রিভিউ-তালিকা (লেখক বা মডারেটর): অনুমোদন / সংশোধন / নতুন লেখা, ভাণ্ডারে যোগ, নোটিফিকেশন |
| AI-P1.5 | পরীক্ষা-সেট, মান যাচাই, দৈনিক সীমা আর ব্যবহারের রিপোর্ট |
| AI-P1.6 | ছোট মডেল (llama.cpp, CPU-তে): queue job-এ নতুন করে লেখা, সময়সীমা ও কাঠামো-মাফিক উত্তরে ফেরা, ভরসার নিয়ম, ২টি মডেলের তুলনা |

## প্রস্তাবিত সারি
| D164 | AI assistant P1: teacher text chat answered from SMS's own data on any server, with a small CPU model to phrase answers - no GPU (D163 (6) P1) | Owner approved (2026-10-24). (1) P1 users: teachers and the head of the institution; text only. Search and answering run inside the existing Laravel/MySQL application on any server; the only addition is the small CPU model in (6); no GPU. (2) Answering: the question is normalized (Bangla/English digits, stop words, class/subject/chapter names) and searched with MySQL FULLTEXT in (a) the reviewed answer bank, (b) the whole platform's published question bank (questions, options, explanations, creative parts) - not only the institution's unlocked items and (c) curriculum chapters/topics; a close reviewed match is returned directly marked "reviewed answer"; otherwise an answer is composed from the 3-5 best matches with fixed Bangla templates, each part with its source; nothing found -> "not found in our data" and the question goes to review. Answers and explanations of items the institution has unlocked, or free items, are shown in full; of other catalogue items only within a per-institution daily free quota counted on the server (default 20, set by the Super Admin), after which the answer stays hidden with an "unlock" action - this is the one exception to question-bank.md "answers never leak", applies only to the assistant, logs every reveal, and a free reveal is not an unlock (it never allows use in a paper or print). Reviewed answer-bank text is free, but one that states a locked item's correct option counts against the quota. `QuestionAnswerNeverLeaksTest` gains assistant cases (beyond the quota no answer, explanation or `is_correct` is sent). Never another institution's own data (papers, unlocks, OMR, marks). (3) Review (D163 (5)): every answer is shown at once (non-bank answers marked "not yet reviewed") and queued, de-identified, for the platform's content_writer / content_moderator on the central host; approved / corrected / rewritten with weight 1 / 2 / 3; corrected or rewritten answers replace the shown one (history kept), the teacher is notified, and they join the answer bank - ranked by weight - so later similar questions are answered directly (learning without model training); not-found and thumbs-down first; the head may switch off sending the institution's answers to review; a bank answer that names an institution's own items is visible only to that institution. (4) New tenant tables `ai_conversations`, `ai_messages`, `ai_reviews` and platform/tenant-scoped `ai_answer_bank`, plus FULLTEXT indexes on question-bank and curriculum text, by new migrations (schema in the task commits). (5) Quality gate: 200 Bangla questions with known sources; live only when the right source is in the top 3 for >= 70% and there are zero cross-institution results (owner may change the bar). Per-institution daily question limit. Module key `ai_assistant`, one price (D47, owner sets it later; until then free and no daily question limit, both Super Admin settings). (6) A small open model on CPU (e.g. Qwen3 1.7B or 4B 4-bit, final pick by the evaluation set with the licence checked for commercial use) served by llama.cpp on a rented VPS without GPU - Hostinger, the cheapest plan with at least 8 GB RAM, starting with the 1.7B model and moving to a bigger plan or the 4B model only if quality or speed falls short (estimated BDT 2,000-5,000 a month; check the price when renting) rewrites only the retrieved text into natural Bangla, called from a queued job over the internal network: the template answer is shown at once and replaced when the rewrite is ready; a timeout or a stopped model keeps the template answer; a rewrite stating a number or correct option not in the given text is discarded. Renting the VPS and installing llama.cpp and the model files are allowed by this decision once the owner has added them to the guard. (7) Tasks AI-P1.1 to AI-P1.6 as in the plan file, one per commit with tests; the owner adds them and the tables to the guard in a separate human commit before code starts. Implementation commits carry `Change-Request: D164`. |

## মালিকের উত্তর (2026-10-24)
১. **চালু করার মান:** ২০০টি পরীক্ষা-প্রশ্নের অন্তত ৭০%-এ ঠিক উৎস প্রথম ৩টির মধ্যে; অন্য প্রতিষ্ঠানের ডেটা ০। ঠিক আছে।
২. **ফ্রি উত্তর:** প্রতিষ্ঠানপ্রতি দিনে ২০টি। ঠিক আছে।
৩. **ভাণ্ডারের আওতা:** রিভিউয়ারের লেখা উত্তর সব প্রতিষ্ঠানের জন্য খোলা। ঠিক আছে।
৪. **মডিউলের দাম আর দৈনিক প্রশ্নের সীমা:** পরে ঠিক হবে। ততদিন Super Admin সেটিংসে খালি থাকবে, অর্থাৎ সীমা নেই আর মডিউল বিনামূল্যে। এটা উত্তর থেকে এজেন্টের ধরে নেওয়া; ভুল হলে বলুন।
৫. **VPS:** Hostinger, যত কম খরচে সম্ভব।
   - সবচেয়ে কম খরচের যে প্ল্যানে অন্তত ৮ GB RAM আছে, সেটা দিয়ে শুরু। সেখানে Qwen3 1.7B চলবে।
   - উত্তরের মান যথেষ্ট না হলে বা চ্যাটবট খুব ধীর হলে তবেই বড় প্ল্যান আর 4B মডেল।
   - ভাড়ার আগে Hostinger-এর তখনকার দাম আর RAM দেখে নিতে হবে। এজেন্ট দাম যাচাই করেনি।
   - একই VPS-এ SMS-ও চালানো যায় কি না, সেটা P1-এর কাজের সময় মেপে জানানো হবে।

ঠিক থাকলে branch পরিষ্কার রেখে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D164.ps1`
