# খসড়া সিদ্ধান্ত D164: AI চ্যাটবট P1 — শিক্ষকদের লেখা-চ্যাট (মডেল, সার্ভার, খরচ, রিভিউ-তালিকা)

> এজেন্টের খসড়া। D163-এর ধাপ P1-এর পরিকল্পনা।
> মালিক অনুমোদন করলে `owner\approve-D164.ps1` চালাবেন; এটি শুধু সিদ্ধান্তের সারি যোগ করে।
> অনুমোদনের পরেও দুটি জিনিস আপনার আলাদা হাতে-করা কাজ: সার্ভার ভাড়া বা কেনা, আর guard-এ নতুন টাস্ক ও টেবিল যোগ।
> নিচের সব দাম আনুমানিক, ২০২৬-এর মাঝামাঝি পর্যন্ত আমার জানা বাজারদর থেকে। কেনার আগে তখনকার দাম যাচাই করতে হবে।

## ১. P1-এ কী থাকবে (আর কী থাকবে না)
**থাকবে:**
- **কে ব্যবহার করবেন:** শিক্ষক আর প্রতিষ্ঠান প্রধান। লেখা দিয়ে প্রশ্ন করবেন, যেমন "অষ্টম শ্রেণির গণিতের লসাগু অধ্যায়ের ৫টি MCQ-এর ব্যাখ্যা দাও"।
- **উত্তর কোথা থেকে:** শুধু আমাদের ডেটা থেকে, যেমন প্রশ্নব্যাংক, পাঠ্যক্রমের অধ্যায় আর প্রশ্নের ব্যাখ্যা। প্রতিটি উত্তরের নিচে উৎস দেখাবে (কোন প্রশ্ন বা কোন অধ্যায়)। উৎস না পেলে বলবে "আমাদের ডেটায় পাইনি"। নিজে থেকে বানিয়ে বলবে না।
- **কোন ডেটা দেখবে:** প্রতিষ্ঠান যেসব প্রশ্ন দেখতে পায় শুধু সেগুলো, যেমন কেনা বা unlock করা প্রশ্ন আর নিজের প্রশ্ন। অন্য প্রতিষ্ঠানের প্রশ্ন বা প্রশ্নপত্র দেখবে না।
- **রিভিউ (D163 (5)):**
  - প্রতিটি উত্তর সাথে সাথে "এখনো যাচাই হয়নি" চিহ্নসহ দেখাবে।
  - উত্তরটি প্ল্যাটফর্মের লেখক বা মডারেটরের রিভিউ-তালিকায় যাবে।
  - রিভিউয়ার উত্তর সংশোধন করলে বা নতুন করে লিখলে শিক্ষক নোটিফিকেশন পাবেন।

**থাকবে না:**
- শিক্ষার্থী (P2)।
- ভয়েস ও ছবি (P3)।
- মডেল নতুন করে শেখানো (P4)। তবে P1 থেকেই রিভিউ করা উত্তর জমবে, যা P4-এ শেখানোর কাঁচামাল হবে।

## ২. মডেল
| কাজ | প্রস্তাব | কেন |
|---|---|---|
| উত্তর লেখা (ভাষা-মডেল) | **Qwen3 14B** (৪-বিট), বিকল্প Gemma 3 12B। খোলা লাইসেন্স, বাংলা জানে | ২৪ GB GPU-তে চলে; বাংলায় ছোট মডেলের চেয়ে ভালো |
| খোঁজা (embedding) | **BGE-M3** (বহুভাষিক, বাংলাসহ) | প্রশ্ন আর অধ্যায়ের সাথে প্রশ্নকারীর প্রশ্ন মেলাতে |
| চালানোর সফটওয়্যার | **vLLM** (GPU-তে); উন্নয়নের সময় llama.cpp (CPU-তে) | একসাথে অনেক অনুরোধ দ্রুত সামলায় |
| ভেক্টর ডেটাবেস | **Qdrant** (নিজস্ব সার্ভারে, প্রতি প্রতিষ্ঠান আলাদা ফিল্টার) | MySQL-এ ভেক্টর খোঁজা নেই |

- **চূড়ান্ত বাছাই কীভাবে:** দুটি মডেলকেই আমাদের ৩০০টি বাংলা প্রশ্নের পরীক্ষা-সেট (নিচে §৫) দিয়ে মাপা হবে। যেটা ভালো, সেটা চলবে।
- **লাইসেন্স:** চূড়ান্ত বাছাইয়ের আগে মডেলের লাইসেন্স যাচাই হবে। শর্ত দুটি: বাণিজ্যিক ব্যবহার, আর নিজের ডেটা দিয়ে নতুন করে শেখানো (P4), দুটোরই অনুমতি থাকতে হবে।

## ৩. সার্ভার ও খরচ (আনুমানিক; কেনা বা ভাড়ার আগে যাচাই)
| বিকল্প | কী | আনুমানিক খরচ |
|---|---|---|
| **ক. ভাড়া (প্রস্তাবিত, শুরুতে)** | ক্লাউডে একটি ২৪ GB GPU (L4 / A10 / RTX 4090 শ্রেণি), ২৪ ঘণ্টা চালু | মাসে প্রায় $৩৫০–৮০০ (≈ ৪২,০০০–৯৬,০০০ টাকা)। শুধু অফিস-সময়ে চালালে প্রায় অর্ধেক |
| খ. নিজস্ব সার্ভার কেনা | RTX 4090 (২৪ GB) মেশিন, ৬৪ GB RAM, UPS | এককালীন প্রায় ৪–৬ লাখ টাকা। তারপর বিদ্যুৎ আর ইন্টারনেট; রক্ষণাবেক্ষণ আমাদের |
| গ. বড় মডেল (৩২B) | ৪৮ GB+ GPU (A6000 / L40S / দুটি ২৪ GB) | ভাড়া মাসে প্রায় $৮০০–১৮০০ |

- **ক্ষমতা:** একটি ২৪ GB GPU-তে ১৪B মডেল একসাথে প্রায় ১০–২০ জনের উত্তর দিতে পারে। প্রতি উত্তর কয়েক সেকেন্ড।
- **প্রস্তাব:** P1-এ বিকল্প ক দিয়ে শুরু। ব্যবহার আর খরচ ৩ মাস দেখে তারপর কেনা বা ভাড়ার সিদ্ধান্ত।
- **দাম:** মডিউলের দাম (D47) আপনি ঠিক করবেন। সার্ভারের খরচ মেটাতে প্রতিষ্ঠানপ্রতি দৈনিক প্রশ্নের সীমা রাখা যায়।

## ৪. রিভিউ-তালিকার নকশা
- **নতুন টেবিল:**
  - `ai_conversations`: প্রতিষ্ঠান, ব্যবহারকারী, শিরোনাম।
  - `ai_messages`: প্রশ্ন বা উত্তর, মডেলের সংস্করণ, উৎসের তালিকা।
  - `ai_reviews`: উত্তর; অবস্থা `unreviewed`, `approved`, `corrected` বা `rewritten`; রিভিউয়ারের লেখা; গুরুত্ব (rewritten ৩, corrected ২, approved ১); রিভিউয়ার; সময়।
  - schema.sql আর migration কাজের commit-এ যোগ হবে।
- **রিভিউয়ার:** প্ল্যাটফর্মের `content_writer` / `content_moderator`, central host-এ। তালিকায় শুধু প্রশ্ন, উত্তর আর উৎস দেখাবে। শিক্ষকের নাম বা প্রতিষ্ঠানের নাম দেখাবে না।
  - প্রতিষ্ঠান প্রধান সেটিংসে "রিভিউর জন্য পাঠানো" বন্ধ রাখতে পারবেন।
  - বন্ধ থাকলে উত্তর "যাচাই হয়নি" অবস্থাতেই থাকবে, আর P4-এর শেখানোয় যাবে না।
- **রিভিউয়ের পর:**
  - সংশোধিত বা নতুন লেখা উত্তর শিক্ষকের চ্যাটে আগের উত্তরের জায়গা নেবে; আগেরটা ইতিহাসে থাকবে।
  - শিক্ষক অ্যাপের ভেতরে নোটিফিকেশন পাবেন।
- **ব্যবহারকারীর রেটিং:** 👍 বা 👎। 👎 পাওয়া উত্তর রিভিউ-তালিকায় আগে আসবে।
- **গোপনীয়তা:** উত্তর রিভিউতে পাঠানোর আগে ফোন নম্বর, ১০ অঙ্কের আইডি আর নাম-জাতীয় তথ্য মুছে দেওয়া হবে।

## ৫. মান যাচাই
- **পরীক্ষা-সেট:** প্রশ্নব্যাংক থেকে ৩০০টি বাংলা প্রশ্ন, যাদের সঠিক উত্তর জানা।
- **কী মাপা হবে:**
  - সঠিকতা;
  - উৎস ঠিক কি না;
  - "পাইনি" বলা ঠিক জায়গায় কি না;
  - অন্য প্রতিষ্ঠানের ডেটা না আসা;
  - বাংলার মান।
- **চালু করার শর্ত:** নির্দিষ্ট মানে পৌঁছালে তবেই চালু হবে। আপনি মান ঠিক করবেন; প্রস্তাব ৮০% সঠিক, আর অন্য প্রতিষ্ঠানের ডেটা ০টি।

## ৬. কাজের ভাগ (প্রতিটি আলাদা commit; guard-এ টাস্ক যোগ মালিকের)
| টাস্ক | কী |
|---|---|
| AI-P1.1 | AI সার্ভিস (Python, vLLM + Qdrant), একটি অভ্যন্তরীণ API; Laravel queue job দিয়ে ডাকে; কোনো বাইরের নেটওয়ার্ক নয় |
| AI-P1.2 | ডেটা সূচিকরণ: প্রশ্ন, অধ্যায়, ব্যাখ্যা → embedding; প্রশ্ন বদলালে আবার সূচিকরণ |
| AI-P1.3 | টেবিল, API (`/ai/conversations`), মডিউল `ai_assistant`, শিক্ষক ও প্রধানের role, tenant-isolation টেস্ট |
| AI-P1.4 | চ্যাট পাতা (শিক্ষক): উৎস, "যাচাই হয়নি" চিহ্ন, 👍/👎 |
| AI-P1.5 | রিভিউ-তালিকা (লেখক বা মডারেটর, central): অনুমোদন / সংশোধন / নতুন লেখা; নোটিফিকেশন |
| AI-P1.6 | পরীক্ষা-সেট, মান যাচাই, খরচ ও ব্যবহারের রিপোর্ট, দৈনিক সীমা |

## প্রস্তাবিত সারি
| D164 | AI assistant P1 plan: teacher text chat with sources, self-hosted models, review queue (D163 (6) P1) | Owner approved (2026-10-24). (1) P1 users: teachers and the head of the institution; text questions only; answers are generated only from the institution's reachable content (its own and unlocked question-bank items, curriculum nodes, explanations) by retrieval, with the sources listed; no source found -> the assistant says so; never another institution's items or unpublished papers. (2) Models (final pick by the evaluation set in (5), licence checked for commercial use and fine-tuning): language model Qwen3 14B 4-bit (alternative Gemma 3 12B), embeddings BGE-M3, served by vLLM on one 24 GB GPU; vector store Qdrant filtered by institution; all on servers SMS controls, no outside AI service (D163 (2)). (3) Infrastructure: start with one rented 24 GB GPU server (estimate USD 350-800 a month), review usage and cost after 3 months before any purchase; per-institution daily question limit; module key `ai_assistant` with one price (D47, owner sets it). (4) Review queue (D163 (5)): every answer shown at once marked "not yet reviewed" and queued for the platform's content_writer / content_moderator on the central host, de-identified (no teacher or institution name, phones, IDs); reviewer marks approved / corrected / rewritten with training weight 1 / 2 / 3; a corrected or rewritten answer replaces the shown one (history kept) and the teacher is notified in-app; thumbs-down answers come first; the head may switch off sending the institution's answers to review (then they stay unreviewed and never enter training). New tenant tables `ai_conversations`, `ai_messages`, `ai_reviews` (schema in the task commits). (5) Quality gate: a fixed set of 300 Bangla questions with known answers; P1 goes live only at >= 80% correct with correct sources and zero cross-institution leaks (owner may change the bar). (6) Tasks AI-P1.1 to AI-P1.6 as in the plan file, one per commit with tests; the owner adds them to the guard (tasks, tables, the AI service directory and its packages) in a separate human commit before code starts; renting the server and any package install happen only after that. Implementation commits carry `Change-Request: D164`. |

## মালিককে যা ঠিক করতে হবে
১. **সার্ভার:** ভাড়া দিয়ে শুরু (বিকল্প ক), নাকি সরাসরি কেনা (বিকল্প খ)?
২. **চালু করার মান:** ৮০% সঠিক হলেই চালু, নাকি অন্য মান?
৩. **দাম আর দৈনিক সীমা:** মডিউলের দাম আর প্রতিষ্ঠানপ্রতি দৈনিক প্রশ্নের সীমা। এখনই, নাকি পরে।
৪. ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D164.ps1`
