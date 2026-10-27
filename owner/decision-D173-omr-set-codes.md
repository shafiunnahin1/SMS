# খসড়া সিদ্ধান্ত D173: প্রশ্নপত্রের সেট-কোড OMR-এর A–J কলাম অনুযায়ী (D126 (2)-এর সংকীর্ণ সংশোধন)

> এজেন্টের খসড়া — কোনো কোড, guard বা D126 বদলানো হয়নি। অনুমোদন করলে `owner\approve-D173.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ SETC.1 → SETC.2; push করে না)।

## ১. সমস্যা (মালিক, 2026-10-28)
এখন সেটের নাম A, B, … Z (সর্বোচ্চ ২৬টি সেট), অথচ OMR-এর সেট-কোড বক্সের প্রতিটি কলামে শুধু A–J (১০টি বৃত্ত) থাকে। তাই সেট K–Z OMR-এ ভরাট করা যায় না।

## ২. মালিকের উত্তর (2026-10-28)
1. কলাম-সংখ্যা ঠিক করবে প্রশ্নপত্রের মোট সেট-সংখ্যা:
   - ১–১০টি সেট → ১ কলাম, কোড A … J;
   - ১১–১০০টি সেট → ২ কলাম, কোড AA … JJ (একক কলামের প্রথম ১০টির পরের ৯০টি সেট);
   - ১০০-এর বেশি সেট → ৩ কলাম, কোড AAA … JJJ (সর্বোচ্চ ১০০০টি সেট)।
2. একটি প্রশ্নপত্রের সব সেট-কোড একই দৈর্ঘ্যের। যেমন ১৫টি সেট হলে সেট ১ = AA, সেট ১৫ = BE। OMR-এ সেট-কোডের প্রতিটি কলামে ঠিক একটি বৃত্ত ভরাট থাকে।
3. প্রশ্নপত্রেও J-এর পরের কোনো অক্ষর বসবে না।
4. যেসব চূড়ান্ত প্রশ্নপত্রে আগেই K–Z সেট আছে, সেগুলো যেমন আছে থাকবে। তবে পরে সেখানে সেট যোগ বা মোছা হলে (কোনো OMR শিট স্ক্যান না হয়ে থাকলে) সব সেটের নাম নতুন A–J নিয়মে বদলে যাবে, প্রতিটি সেটের প্রশ্ন-ক্রম ও উত্তরমালা অপরিবর্তিত রেখে; তারপর OMR তৈরি করা যাবে। (মালিকের উত্তর, 2026-10-28, PC-এজেন্টের প্রশ্নের পর)
5. বাংলা নামের সেট থাকবে, তবে ক–ঞ (১০টি অক্ষর) দিয়ে, একই নিয়মে (কক … ঞঞ, ককক … ঞঞঞ)।

## ৩. এজেন্টের প্রস্তাব (মালিকের উত্তরের বাইরের যা ধরে নেওয়া হয়েছে — ভিন্নমত হলে জানাবেন)
- নাম গঠনের নিয়ম: n-তম সেটের কোড = (n − 1)-কে কলাম-সংখ্যার সমান অঙ্কে লেখা দশমিক সংখ্যা, প্রতিটি অঙ্ক 0→A, 1→B … 9→J (বাংলায় 0→ক … 9→ঞ)। ১৫টি সেটে সেট ১৫ → 14 → BE।
- পরে সেট যোগ করলে মোট সংখ্যা যদি পরের ধাপে যায় (যেমন ১০ থেকে ১২), তখন সব সেটের নাম নতুন দৈর্ঘ্যে বদলায় (A → AA ইত্যাদি), প্রতিটি সেটের জমানো প্রশ্ন-ক্রম ও উত্তরমালা অপরিবর্তিত থাকে, আর তৈরি-করা OMR আনলক হয়ে নতুন করে তৈরি হয় — D157-এ সেট মুছলে যেভাবে নাম বদলায়। কোনো OMR শিট স্ক্যান হয়ে গেলে সেট যোগ বা মোছা আগের মতোই বন্ধ (D133)। সেট মুছে মোট সংখ্যা নিচের ধাপে নামলে নামও ছোট হয়।
- সর্বোচ্চ ১০০০টি সেট, তবে প্রশ্ন ও বিকল্পের সম্ভাব্য বিন্যাসের চেয়ে বেশি নয় (বর্তমান capacity নিয়ম)। এর জন্য `qb_paper_variants.variant_number` TINYINT (সর্বোচ্চ ২৫৫) থেকে SMALLINT UNSIGNED করার একটি নতুন migration লাগবে (শুধু এই কলামের ধরন; নতুন টেবিল নয়)।
- প্রিভিউ/PDF-এর সেট বাছাই A–Z অক্ষরের বদলে সেট নম্বর দিয়ে হবে; পুরনো `?set=A..Z` লিংক আগের মতোই কাজ করবে (A = সেট ১ … Z = সেট ২৬)। বাংলা নাম কখনো ঠিকানায় ছিল না (ঠিকানা সবসময় Latin অক্ষর, বাংলা নাম শুধু ছাপায়), তাই `?set=ক` ধরনের কোনো পুরনো লিংক নেই।
- OMR-এর সেট-কোড বক্সে কলাম-সংখ্যা = সেট-কোডের দৈর্ঘ্য, প্রতিটি কলামে A–J বা ক–ঞ। স্ক্যান থেকে পড়া কোড সরাসরি সেট খোঁজে; প্রতিটি কলামে একটি করে বৃত্ত না থাকলে "সেট-কোড অসম্পূর্ণ" কারণে রিভিউয়ে যায়। পুরনো (K–Z) সেটওয়ালা প্রশ্নপত্রে OMR তৈরি করতে গেলে কারণ দেখিয়ে আটকায়।

## ৪. সিদ্ধান্তের সারি
| D173 | Paper set codes follow the OMR's A–J columns (narrowly amends D126 (2); D133/D157 rules kept) | Owner approved (2026-10-28). (1) A paper's set codes are built from A–J only (Bangla scheme: ক–ঞ): up to 10 sets one letter (A…J), 11–100 sets two letters (AA…JJ), 101–1000 sets three letters (AAA…JJJ); every code of a paper has the same length, set by the paper's total number of sets; the n-th set's code is n−1 written with that many decimal digits, each digit 0–9 mapped to A–J (or ক–ঞ) — e.g. with 15 sets set 1 = AA and set 15 = BE. No letter after J (or ঞ) is printed on a paper or an OMR sheet. (2) Adding or deleting sets that moves the total into another length renames every set to the new length in order, keeping each set's frozen order and answer key; a generated OMR form is unlocked to be rebuilt; once an OMR sheet of the paper is scanned, sets cannot be added or deleted (D133, D157). (3) At most 1000 sets, never more than the capacity check allows; `qb_paper_variants.variant_number` becomes SMALLINT UNSIGNED by a new migration (no new table). (4) Print/preview address a set by its number; the old `set=A..Z` parameter keeps working (A = set 1 … Z = set 26); Bangla names were never part of an address. (5) The OMR set-code box has one column per code letter, each with A–J (or ক–ঞ); a scan reads one letter per column and a column with no or several marks sends the sheet to review; a paper whose existing sets use letters after J (made before D173) keeps its sets unchanged and generating its OMR form is refused with the reason shown, until sets are next added or deleted on it (while no OMR sheet is scanned): then every set is renamed to the D173 scheme in order, keeping each set's frozen order and answer key, and its OMR form can be generated. (6) Tasks in order SETC.1 (server: naming, rename on add/delete, capacity, migration, print addressing, OMR geometry and scan matching) then SETC.2 (screens: sets list, preview set picker, OMR designer and reader); commits carry `Change-Request: D173`. |
