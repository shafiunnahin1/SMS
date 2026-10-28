# খসড়া সিদ্ধান্ত D179: প্রশ্নপত্রের প্রিভিউয়ে বহুনির্বাচনী অপশনের কলাম (১ / ২ / ৪ / স্বয়ংক্রিয়)

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D179.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBO.1; push করে না)। D177/D178 থেকে স্বাধীন।

## ১. মালিকের অনুরোধ (2026-10-28)
এখন সব বহুনির্বাচনী প্রশ্নের অপশন সবসময় ২ কলামে বসে। মালিক দুটোই চান: (১) সব প্রশ্নের জন্য একসাথে প্রিভিউয়ের প্যানেলে "অপশনের কলাম: ১ / ২ / ৪ / স্বয়ংক্রিয়"; স্বয়ংক্রিয় হলে অপশন ছোট হলে ৪ কলামে, মাঝারি হলে ২-এ, লম্বা হলে ১-এ। (২) দরকার হলে এক বা একাধিক প্রশ্ন বাছাই করে শুধু সেগুলোর কলাম আলাদা করা।

## ২. এজেন্টের প্রস্তাব (ভিন্নমত হলে জানাবেন)
- ডিফল্ট "স্বয়ংক্রিয়"। স্বয়ংক্রিয় নিয়ম প্রতিটি প্রশ্নে আলাদা: সবচেয়ে লম্বা অপশনের দেখানো লেখা ≤ ১২ অক্ষর → ৪ কলাম; ≤ ৩০ অক্ষর → ২ কলাম; তার বেশি, বা কোনো অপশনে সূত্র-ব্লক/টেবিল → ১ কলাম; অপশনে ছবি থাকলে ২ কলাম। (পরীক্ষায় দেখে সংখ্যা দুটো সমন্বয় করা যাবে; চূড়ান্ত মান PROGRESS-এ লেখা হবে।)
- নির্দিষ্ট প্রশ্নে আলাদা: প্রিভিউয়ে প্রশ্নের উপর ক্লিক করে (বা কয়েকটি বাছাই করে) ১ / ২ / ৪ / "সাধারণ মান অনুসরণ" বেছে নেওয়া; সেটা সাধারণ মানের চেয়ে অগ্রাধিকার পায়।
- উদ্দীপক-ভিত্তিক বহুনির্বাচনীর (D171) প্রতিটি শিশু-প্রশ্নের অপশনেও একই নিয়ম।
- প্রিভিউয়ের অন্য সেটিং ও প্রশ্নের নিজস্ব শব্দ-বদলের মতোই এগুলো এই ব্রাউজারে এই প্রশ্নপত্রের জন্য মনে থাকবে (সার্ভারে নতুন কিছু নয়); ছাপা/PDF প্রিভিউয়ের মতোই হবে। অপশনের ক্রম, সেট বা উত্তরমালা বদলায় না।
- শুধু স্ক্রিনের কাজ: নতুন টেবিল, কলাম, route বা package নয়।

## ৩. সিদ্ধান্তের সারি
| D179 | MCQ option columns in the paper preview: 1 / 2 / 4 / auto, for all questions and per question | Owner approved (2026-10-28). (1) The paper preview panel has "option columns: 1 / 2 / 4 / auto" for all MCQs (default auto). Auto decides per question from its longest option's displayed text: short → 4 columns, medium → 2, long (or a display formula / table in an option) → 1; an option with a picture → 2; the thresholds are recorded in the task evidence. (2) One or more selected questions may be set to 1 / 2 / 4 or back to the paper-wide value; a question's own choice wins. Stimulus-group children (D171) follow the same rule. (3) Like the preview's other settings and per-paper wording, these choices are kept in that browser for that paper; printing follows the preview; option order, sets and answer keys are unchanged. (4) Screens only: no new table, column, route or package. Task QBO.1 (after QBS.1); commits carry `Change-Request: D179`. |
