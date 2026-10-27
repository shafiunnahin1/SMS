# খসড়া সিদ্ধান্ত D174: প্রশ্ন যাচাইয়ে একসাথে প্রকাশ/ফেরত ও প্রতি পৃষ্ঠায় ২৫–১০০ প্রশ্ন

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D174.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBR.1; push করে না)।

## ১. মালিকের অনুরোধ (2026-10-28)
যাচাইয়ের অপেক্ষার প্রশ্ন এখন একটি একটি করে প্রকাশ করতে হয়; একসাথে অনেকগুলো যাচাই করা চাই। প্রশ্নের তালিকায় প্রতি পৃষ্ঠায় এখন ১৬টি; ব্যবহারকারী ২৫–১০০ বেছে নিতে পারবেন।

## ২. এজেন্টের প্রস্তাব (ভিন্নমত হলে জানাবেন)
- শুধু স্ক্রিনের কাজ: নতুন টেবিল, কলাম, route বা package নয়। প্রতিটি প্রশ্ন আগের `POST /writer/questions/{id}/publish` বা `/reject` দিয়েই যায় (লেখকের "একসাথে সাবমিট" যেভাবে চলে), তাই অনুমতি, audit ও অবস্থার নিয়ম অপরিবর্তিত।
- যাচাইকারী (content_moderator) ও Super Admin "যাচাইয়ের অপেক্ষায়" অবস্থার প্রশ্নে চেকবক্স পাবেন, "পৃষ্ঠার সব বাছাই" সহ; বাছাই করা প্রশ্ন একসাথে "প্রকাশ" বা একটি কারণ লিখে একসাথে "ফেরত"। কোনোটি ব্যর্থ হলে কতটি ব্যর্থ তা দেখাবে, বাকিগুলো হয়ে যাবে।
- প্রতি পৃষ্ঠায় ২৫ / ৫০ / ৭৫ / ১০০ (ডিফল্ট ২৫), লেখক ও যাচাইকারী দুজনের তালিকায়; বাছাই এই ব্রাউজারে মনে থাকবে (শুধু সুবিধা, কোনো গোপন তথ্য নয়)।

## ৩. সিদ্ধান্তের সারি
| D174 | Bulk publish / return in question review and 25–100 questions per page | Owner approved (2026-10-28). (1) On the question list a content moderator or the Super Admin may select questions in review (one by one or all on the page) and publish them, or return them with one shared reason, in one action; each question still goes through the existing per-question publish / reject endpoint, so roles, status rules and audit are unchanged; a failure is reported by count and the rest proceed. (2) The question list (writers and reviewers) shows 25, 50, 75 or 100 questions per page (default 25), chosen by the user and remembered in that browser. (3) Screens only: no new table, column, route or package. Task QBR.1 (after SETC.2); commits carry `Change-Request: D174`. |
