# খসড়া সিদ্ধান্ত D160: শিক্ষার্থীর আইডি হবে শুধু অঙ্কে, আর OMR-এর আইডি ও এই আইডি এক হবে

> এজেন্টের খসড়া। মালিক অনুমোদন করলে `owner\approve-D160.ps1` চালাবেন। অনুমোদনের আগে এর কোড লেখা হবে না।

## মালিকের নির্দেশ (2026-10-24)
"স্টুডেন্ট আইডিতে কোনো ইংরেজী অক্ষর থাকবে না, শুধু নাম্বার থাকবে।"

## এখন কী আছে
- নতুন শিক্ষার্থীর আইডি এখন `DHA-2025-0001` ধরনের: প্রতিষ্ঠানের নামের ৩ অক্ষর, সাল আর ক্রমিক। এটা আসে `docs/modules/fees-advanced.md` আর `student-import.md` থেকে।
- D159 অনুযায়ী OMR-এ আলাদা একটি ১০ অঙ্কের আইডি ছাপা হয়: ভর্তির তারিখ `YYYYmmdd` আর ডেটাবেস id-এর শেষ ২ অঙ্ক।
- ফলে একজন শিক্ষার্থীর দুটি আলাদা আইডি আছে।
- D159-এর OMR আইডি অনন্য হবে, এমন নিশ্চয়তা নেই। একই দিনে ভর্তি হওয়া দুজনের id-এর শেষ ২ অঙ্ক মিলে যেতে পারে, যেমন id 101 আর 201।

## প্রস্তাব
- **আইডির গঠন:** শিক্ষার্থীর একমাত্র আইডি হবে ঠিক ১০টি অঙ্ক। প্রথম ৮টি ভর্তির তারিখ (`YYYYmmdd`), শেষ ২টি সেই দিনের ভর্তির ক্রমিক `01`–`99`। যেমন `2026102401`।
- **এক আইডি সব জায়গায়:** তালিকা, নম্বর এন্ট্রি, AI প্রম্পট, JSON আর OMR-এ একই আইডি থাকবে।
- **অনন্য থাকা:** ক্রমিক প্রতিদিন আলাদা করে গোনা হয়, তাই আইডি সবসময় অনন্য থাকে।
- **একদিনে ৯৯-এর বেশি ভর্তি:** এমন হলে প্রথম যে তারিখে জায়গা খালি আছে, সেই তারিখের ক্রমিক নেওয়া হবে। নিয়মটা লেখা থাকবে, আর সেই আইডি OMR-এ ঠিকই পড়া যাবে।
- **পুরনো আইডি:** অক্ষরসহ আইডিগুলো (যেমন `DHA-2025-0001`) একবার মালিকের চালানো একটি কমান্ডে নতুন গঠনে বদলাবে।
  - কোন পুরনো আইডি কোন নতুন আইডি হলো, তার তালিকা audit log-এ থাকবে।
  - এরপর কখনো আর বদলাবে না। D159 (3)-এর "আইডি কখনো বদলায় না" এই একবারের ব্যতিক্রম মেনেই চলবে।
  - কমান্ড প্রথমে শুধু দেখাবে কী বদলাবে (`--dry-run`), তারপর মালিক নিজে চালাবেন।

## প্রস্তাবিত সারি
| D160 | Student IDs are digits only, and the student ID is the OMR ID (amends D159 (3)(4), `docs/modules/fees-advanced.md` generateStudentId, `docs/modules/student-import.md` student_id) | Owner approved (2026-10-24). (1) A student's ID (`students.student_id`) has digits only - exactly 10: the admission date `YYYYmmdd` (else the day the record is made) plus that day's admission serial `01`-`99` in the institution (e.g. `2026102401`); a day with more than 99 admissions takes the next date that has a free serial. The ID is unique in the institution and never changes. (2) It is the one ID everywhere - lists, marks entry, AI prompt, JSON import, and the OMR "ID number" box, which reads exactly this ID (D159 (4)'s "last 2 digits of the database id" is replaced by the day serial, so the OMR ID is always unique). (3) Existing IDs with letters are converted once by an owner-run command (`--dry-run` first), each old -> new pair written to the audit log; after that an ID never changes. An imported student with a given ID must give 10 digits. Tests: generator unique and digits-only across a day and a 99+ day; import refuses letters; conversion maps every old ID once and keeps relations; OMR reads and matches the new ID. Implementation commits carry `Change-Request: D160`. |

## মালিককে যা দেখতে হবে
1. শেষ ২ অঙ্ক "সেই দিনের ক্রমিক" হবে, এতে আপত্তি আছে কি? এতে আইডি সবসময় অনন্য থাকে। ডেটাবেস id-এর শেষ ২ অঙ্ক নিলে দুজনের আইডি মিলে যেতে পারে।
2. পুরনো অক্ষরসহ আইডি নতুন আইডিতে বদলানো হবে, নাকি পুরনোগুলো যেমন আছে তেমন থাকবে আর শুধু নতুন শিক্ষার্থী নতুন আইডি পাবে?
3. ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D160.ps1`
