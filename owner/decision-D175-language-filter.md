# খসড়া সিদ্ধান্ত D175: প্রশ্ন খোঁজার ফিল্টারে ভাষা-বিষয়ের পাঠ্যক্রম

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D175.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBF.1; push করে না)। D174 থেকে স্বাধীন — যেকোনো ক্রমে অনুমোদন করা যায়।

## ১. মালিকের অনুরোধ (2026-10-28)
প্রতিষ্ঠানের প্রশ্নব্যাংক পেজের (`/admin/question-bank`) ফিল্টারে ভাষাভিত্তিক বিষয়ের (যেমন বাংলা ১ম পত্র) পাঠ্যক্রম নেই। শুধু ভাষাভিত্তিক বিষয় বাছাই হলে অধ্যায় ও টপিক লুকাবে, ভাষা-বিষয়ের পাঠ্যক্রম দেখাবে; ভাষাভিত্তিক ও অন্য বিষয় একসাথে বাছাই হলে পাঠ্যক্রম এবং অধ্যায়-টপিক দুটোই দেখাবে।

## ২. এজেন্টের প্রস্তাব (ভিন্নমত হলে জানাবেন)
- "ভাষাভিত্তিক বিষয়" = বাছাই করা শ্রেণির জন্য যে বিষয়ের প্রকাশিত পাঠ্যক্রম-সংস্করণ আছে (D139/D145 — প্রশ্ন সম্পাদকে যেভাবে চেনা হয়)।
- পাঠ্যক্রম ফিল্টার বহু-বাছাই (অন্য ফিল্টারের মতো); একটি অংশ বাছাই করলে তার নিচের সব অংশের প্রশ্নও আসবে (লেখকের তালিকার বিদ্যমান নিয়ম)। বিষয় বা শ্রেণি বদলালে পাঠ্যক্রম-বাছাই মুছে যায়।
- একই আচরণ লেখক/যাচাইকারীর প্রশ্ন-তালিকার ফিল্টারেও (`/writer/questions`), যাতে দুই জায়গা এক রকম থাকে।
- সার্ভার: প্রতিষ্ঠানের `GET question-bank/curriculum` প্রকাশিত পাঠ্যক্রম-সংস্করণও দেবে, `GET question-bank/questions` নেবে `curriculum_node_ids[]` (লেখকের তালিকার মতো; শুধু প্রকাশিত প্রশ্ন, উত্তর-গোপনীয়তা ও কেনার নিয়ম অপরিবর্তিত)। নতুন টেবিল, কলাম, route বা package নয়।

## ৩. সিদ্ধান্তের সারি
| D175 | Language-subject curriculum in the question filters | Owner approved (2026-10-28). (1) In the question filters of the institution question bank (`/admin/question-bank`) and the writer / reviewer question list, a subject that has a published curriculum version for the chosen class (D139/D145) is a language subject. If only language subjects are selected, chapter and topic are hidden and a multi-select curriculum filter (its parts in tree order) is shown; if language and other subjects are selected, the curriculum filter and chapter / topic are all shown; changing class or subject clears the curriculum choice. A chosen part also matches questions linked to parts beneath it. (2) Server: the institution `GET question-bank/curriculum` also returns the published curriculum versions, and `GET question-bank/questions` accepts `curriculum_node_ids[]` as the writer list does; published-only, answer privacy and purchase rules unchanged; no new table, column, route or package. (3) Task QBF.1 (after SETC.2); commits carry `Change-Request: D175`. |
