# খসড়া সিদ্ধান্ত D176: রিফ্রেশের পরেও বাছাই করা প্রশ্ন বাছাই থাকা (এবং "সব প্রশ্ন" পেজে প্রতি পৃষ্ঠায় ২৫–১০০)

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D176.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBS.1; push করে না)।

## ১. মালিকের অনুরোধ (2026-10-28)
প্রতিষ্ঠানের প্রশ্নব্যাংক পেজে (`/admin/question-bank`) ব্রাউজার রিফ্রেশ করলে বাছাই করা প্রশ্ন আর বাছাই থাকে না; আবার বাছাই করতে হয়। রিফ্রেশের পরেও বাছাই থাকতে হবে।

## ২. এজেন্টের প্রস্তাব (ভিন্নমত হলে জানাবেন)
- শুধু প্রশ্নের **আইডি** এই ব্রাউজারে রাখা হবে (প্রশ্নের লেখা বা উত্তর নয়), প্রতিষ্ঠান ও ব্যবহারকারী আলাদা করে — অন্য কেউ একই ব্রাউজারে লগইন করলে তার বাছাই আলাদা। রিফ্রেশের পর সেই আইডিগুলোর প্রশ্ন আগের মতো সার্ভার থেকে আনা হবে (প্রশ্নপত্রে "প্রশ্ন যোগ" যেভাবে আনে); যে প্রশ্ন আর পাওয়া যায় না তা নীরবে বাদ।
- বাছাই মুছবে: প্রশ্নপত্র তৈরি হলে, "সব বাদ" চাপলে, বা লগআউটে। কোনো প্রশ্নপত্রে "প্রশ্ন যোগ" (`?paper=`) করার সময় সেই প্রশ্নপত্রের প্রশ্ন দিয়েই শুরু হয় (আগের নিয়ম), সাধারণ বাছাই আলাদা থাকে।
- একই নিয়ম লেখক/যাচাইকারীর প্রশ্ন-তালিকার বাছাইয়েও (D174-এর একসাথে সাবমিট/প্রকাশ), যাতে রিফ্রেশে সেখানেও হারায় না।
- স্ক্রিনশটে দেখা যাচ্ছে "সব প্রশ্ন" পেজে এখনো প্রতি পৃষ্ঠায় ১৬টি (D174 শুধু লেখকের তালিকা বদলেছিল)। প্রস্তাব: এখানেও ২৫ / ৫০ / ৭৫ / ১০০ (ডিফল্ট ২৫, ব্রাউজারে মনে থাকে); এর জন্য প্রতিষ্ঠানের `GET question-bank/questions`-এর `per_page` সর্বোচ্চ ৫০ থেকে ১০০ করতে হবে (শুধু validation; নতুন route নয়)। না চাইলে এই অংশ বাদ দিতে বলুন।
- নতুন টেবিল, কলাম, route বা package নয়।

## ৩. সিদ্ধান্তের সারি
| D176 | Question selections survive a browser refresh; 25–100 per page on All Questions | Owner approved (2026-10-28). (1) On the institution question bank (All Questions) and the writer / reviewer question list, the selected questions' ids (never their text or answers) are kept in that browser per institution and user, and after a refresh the selection is restored by loading those questions through the existing endpoints; a question no longer available is dropped silently. The selection is cleared when a paper is created from it, by "clear all", and at logout; adding questions to an existing paper (`?paper=`) still starts from that paper's questions, apart from the ordinary selection. (2) All Questions shows 25, 50, 75 or 100 per page (default 25, remembered in that browser); the institution `GET question-bank/questions` accepts `per_page` up to 100 (validation only). (3) No new table, column, route or package. Task QBS.1 (after QBF.1); commits carry `Change-Request: D176`. |
