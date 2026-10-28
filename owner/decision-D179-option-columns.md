# খসড়া সিদ্ধান্ত D179: প্রশ্নপত্রের প্রিভিউয়ে অপশনের কলাম (১ / ২ / ৪ / স্বয়ংক্রিয়), লম্বা সূত্র কখনো না লুকানো, এবং বাছাই করা লেখার ফন্ট-সাইজ

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D179.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBO.1; push করে না)। D177/D178 থেকে স্বাধীন।

## ১. মালিকের অনুরোধ (2026-10-28)
এখন সব বহুনির্বাচনী প্রশ্নের অপশন সবসময় ২ কলামে বসে। মালিক দুটোই চান: (১) সব প্রশ্নের জন্য একসাথে প্রিভিউয়ের প্যানেলে "অপশনের কলাম: ১ / ২ / ৪ / স্বয়ংক্রিয়"; স্বয়ংক্রিয় হলে অপশন ছোট হলে ৪ কলামে, মাঝারি হলে ২-এ, লম্বা হলে ১-এ। (২) দরকার হলে এক বা একাধিক প্রশ্ন বাছাই করে শুধু সেগুলোর কলাম আলাদা করা।

মালিক (2026-10-28, ছাপা Set AA-এর ছবি): লম্বা LaTeX/সমীকরণ কলামের বাইরে চলে যায় (২১, ৩০ নং), আর কলামে জায়গা না হলে সূত্র লুকিয়ে যায় (১৭-র অপশন, ১৪-র সমীকরণ, ৮-এর iii খালি)। নির্দিষ্ট লেখা বাছাই করে ফন্ট-সাইজ ছোট-বড় করা যাবে, সর্বনিম্ন ৫।

## ২. এজেন্টের প্রস্তাব (ভিন্নমত হলে জানাবেন)
- ডিফল্ট "স্বয়ংক্রিয়"। স্বয়ংক্রিয় নিয়ম প্রতিটি প্রশ্নে আলাদা: সবচেয়ে লম্বা অপশনের দেখানো লেখা ≤ ১২ অক্ষর → ৪ কলাম; ≤ ৩০ অক্ষর → ২ কলাম; তার বেশি, বা কোনো অপশনে সূত্র-ব্লক/টেবিল → ১ কলাম; অপশনে ছবি থাকলে ২ কলাম। (পরীক্ষায় দেখে সংখ্যা দুটো সমন্বয় করা যাবে; চূড়ান্ত মান PROGRESS-এ লেখা হবে।)
- নির্দিষ্ট প্রশ্নে আলাদা: প্রিভিউয়ে প্রশ্নের উপর ক্লিক করে (বা কয়েকটি বাছাই করে) ১ / ২ / ৪ / "সাধারণ মান অনুসরণ" বেছে নেওয়া; সেটা সাধারণ মানের চেয়ে অগ্রাধিকার পায়।
- লম্বা সূত্র: কোনো সূত্র বা লেখা কখনো লুকাবে না বা কাটা পড়বে না। কলামের চেয়ে চওড়া সূত্র নিজে থেকে কলামের মাপে ছোট হবে (সর্বনিম্ন ৫ pt); তাতেও না ধরলে ভাঙা যায় এমন জায়গায় (=, +, − ইত্যাদির পরে) পরের লাইনে যাবে। স্বয়ংক্রিয় কলাম-নিয়মে এমন অপশন ১ কলাম পায়।
- ফন্ট-সাইজ: প্রিভিউয়ে প্রশ্ন, অপশন বা সূত্রের কোনো অংশ মাউস দিয়ে বাছাই করে ছোট্ট টুলবারে ফন্ট-সাইজ বাড়ানো/কমানো (৫ pt থেকে কাগজের বড় সাইজ পর্যন্ত) ও "আগের মতো"। এটা প্রশ্নব্যাংকের প্রশ্ন বদলায় না — শুধু এই প্রশ্নপত্রের ছাপা চেহারা (প্রশ্নের নিজস্ব শব্দ-বদলের মতো)।
- উদ্দীপক-ভিত্তিক বহুনির্বাচনীর (D171) প্রতিটি শিশু-প্রশ্নের অপশনেও একই নিয়ম।
- প্রিভিউয়ের অন্য সেটিং ও প্রশ্নের নিজস্ব শব্দ-বদলের মতোই এগুলো এই ব্রাউজারে এই প্রশ্নপত্রের জন্য মনে থাকবে (সার্ভারে নতুন কিছু নয়); ছাপা/PDF প্রিভিউয়ের মতোই হবে। অপশনের ক্রম, সেট বা উত্তরমালা বদলায় না।
- শুধু স্ক্রিনের কাজ: নতুন টেবিল, কলাম, route বা package নয়।

## ৩. সিদ্ধান্তের সারি
| D179 | Paper preview: MCQ option columns (1 / 2 / 4 / auto, all or per question), long formulas never hidden, font size of selected text | Owner approved (2026-10-28). (1) The paper preview panel has "option columns: 1 / 2 / 4 / auto" for all MCQs (default auto). Auto decides per question from its longest option's displayed text: short → 4 columns, medium → 2, long (or a display formula / table in an option) → 1; an option with a picture → 2; the thresholds are recorded in the task evidence. (2) One or more selected questions may be set to 1 / 2 / 4 or back to the paper-wide value; a question's own choice wins. Stimulus-group children (D171) follow the same rule. (3) No formula or text is ever hidden or clipped: a formula wider than its column shrinks to fit (never below 5 pt) and, if still too wide, breaks after a relation or operator; auto gives such options 1 column. (4) Text selected in the preview (question, option or a formula) can be made larger or smaller (5 pt minimum) or reset, for this paper's print only; the question bank's question is unchanged. (5) Like the preview's other settings and per-paper wording, these choices are kept in that browser for that paper; printing follows the preview; option order, sets and answer keys are unchanged. (6) Screens only: no new table, column, route or package. Task QBO.1 (after QBS.1); commits carry `Change-Request: D179`. |
