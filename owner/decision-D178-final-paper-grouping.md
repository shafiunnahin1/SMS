# খসড়া সিদ্ধান্ত D178: একাধিক বিষয়ের নতুন প্রশ্নপত্রে "বিষয় অনুযায়ী সাজান" নিজে থেকে চালু

> এজেন্টের খসড়া (2026-11-01 সংশোধিত) — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D178.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBG.1; push করে না)।

## ১. মালিকের অনুরোধ (2026-10-28)
প্রশ্নপত্রে বিষয়গুলো আলাদা গ্রুপ হওয়া চাই (বাংলা ১–২০, গণিত ২১–৪০, উপরে বিষয়ের নাম; সিরিয়াল ও অপশন শুধু নিজের গ্রুপে এলোমেলো)। এটি D128-এর "বিষয় অনুযায়ী সাজান"; মালিক: একাধিক বিষয়ের নতুন প্রশ্নপত্রে এটি নিজে থেকেই চালু থাকবে।

## ২. আগের খসড়া থেকে কী বাদ গেল, কেন
আগের খসড়ায় চূড়ান্ত প্রশ্নপত্রে সাজানো/বিষয়ের ক্রম বদলালে "একই প্রশ্নপত্রের সেট নতুন করে বানানো" ছিল। পরে অনুমোদিত D180 এটি আরও নিরাপদভাবে দিয়েছে — বদল মানে নতুন revision, আগের সেট/OMR/স্ক্যান কখনো বদলায় না (QBO.2-এ চালু)। তাই সেই অংশ বাদ; এই সিদ্ধান্ত শুধু ডিফল্ট-চালুর নিয়ম।

## ৩. এজেন্টের প্রস্তাব
- নতুন প্রশ্নপত্র তৈরি করার সময় প্রশ্নগুলো একাধিক বিষয়ের হলে `group_by_subject` চালু হয়ে সংরক্ষিত হবে; বিষয়ের ক্রম = প্রশ্নপত্রে প্রথম যে ক্রমে বিষয় এসেছে। শিক্ষক চাইলে সংরক্ষণের আগে বা পরে বন্ধ করতে পারবেন (খসড়ায় সরাসরি; চূড়ান্ত হলে D180 অনুযায়ী নতুন revision)।
- সার্ভারই নিয়মটি প্রয়োগ করবে (সব জায়গা থেকে তৈরি প্রশ্নপত্রে একই ফল: "সব প্রশ্ন" থেকে, ব্লুপ্রিন্ট থেকে, সম্পাদনা পাতা থেকে); অনুরোধে স্পষ্টভাবে `group_by_subject: false` পাঠালে চালু হবে না।
- এক বিষয়ের প্রশ্নপত্র এবং আগে তৈরি সব প্রশ্নপত্র অপরিবর্তিত।
- নতুন টেবিল, কলাম, route বা package নয়।

## ৪. সিদ্ধান্তের সারি
| D178 | Subject grouping on by default for new multi-subject papers (amends D128's opt-in) | Owner approved (2026-11-01). (1) When a new paper is created with questions of more than one subject and the request does not explicitly set `instructions_json.group_by_subject` to false, the paper is saved with D128 subject grouping on and the subject order as the subjects are first met; this applies however the paper is created (All Questions, blueprint, paper editor). (2) The teacher may turn it off: on a draft directly, on a final paper as a new revision (D180). (3) Single-subject papers and papers that already exist are unchanged. (4) No new table, column, route or package. Task QBG.1 (after QBS.1); commits carry `Change-Request: D178`. |
