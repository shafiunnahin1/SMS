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
- **আইডির গঠন:** শিক্ষার্থীর একমাত্র আইডি হবে ঠিক ১০টি অঙ্ক। প্রথম ৬টি ভর্তির তারিখ (`YYmmdd`), শেষ ৪টি সম্পূর্ণ সিস্টেমের global ভর্তির ক্রমিক `0001`–`9999`। যেমন `2610240001`।
- **এক আইডি সব জায়গায়:** তালিকা, নম্বর এন্ট্রি, AI প্রম্পট, JSON আর OMR-এ একই আইডি থাকবে।
- **অনন্য থাকা:** ক্রমিক সম্পূর্ণ সিস্টেমে global এবং প্রতিদিন নতুন করে শুরু হয়, তাই বিভিন্ন প্রতিষ্ঠানের শিক্ষার্থীর ID-ও অনন্য থাকে।
- **একদিনে ৯৯৯৯টি ভর্তি পূর্ণ হলে:** সেদিন নতুন ভর্তি বন্ধ থাকবে এবং ব্যবহারকারীকে পরের দিন registration করতে বলা হবে।
- **পুরনো আইডি:** অক্ষরসহ আইডিগুলো (যেমন `DHA-2025-0001`) একবার মালিকের চালানো একটি কমান্ডে নতুন গঠনে বদলাবে।
  - কোন পুরনো আইডি কোন নতুন আইডি হলো, তার তালিকা audit log-এ থাকবে।
  - এরপর কখনো আর বদলাবে না। D159 (3)-এর "আইডি কখনো বদলায় না" এই একবারের ব্যতিক্রম মেনেই চলবে।
  - কমান্ড প্রথমে শুধু দেখাবে কী বদলাবে (`--dry-run`), তারপর মালিক নিজে চালাবেন।

## প্রস্তাবিত সারি
| D160 | Student IDs are digits only, and the student ID is the OMR ID (amends D159 (3)(4), `docs/modules/fees-advanced.md` generateStudentId, `docs/modules/student-import.md` student_id) | Owner approved (2026-10-24). (1) A student's ID (`students.student_id`) has digits only - exactly 10: the admission date `YYmmdd` (or the day the record is made when admission date is absent) plus a four-digit global system admission serial `0001`-`9999` for that date (e.g. `2610240001`). The serial is shared across all institutions and resets daily, so IDs are globally unique. When the daily serial reaches `9999`, registration is closed for that day and users are told to register the next day. The ID never changes after assignment. (2) It is the one ID everywhere - lists, marks entry, AI prompt, JSON import, and the OMR "ID number" box, which reads exactly this ID (D159 (4)'s database-id suffix is replaced by the global day serial). (3) Existing IDs with letters are converted once by an owner-run command (`--dry-run` first), each old -> new pair written to the audit log; after that an ID never changes. An imported student with a given ID must give 10 digits. Tests: generator unique and digits-only across institutions and a 9999-cap day; import refuses letters; conversion maps every old ID once and keeps relations; OMR reads and matches the new ID. Implementation commits carry `Change-Request: D160`. |

## মালিককে যা দেখতে হবে
1. শেষ ৪ অঙ্ক সম্পূর্ণ সিস্টেমের global দৈনিক ক্রমিক হবে (`0001`–`9999`); `9999` পূর্ণ হলে সেদিন ভর্তি বন্ধ থাকবে।
2. পুরনো অক্ষরসহ ID একবার নতুন ১০ অঙ্কের ID-তে migrate হবে; ভর্তি তারিখ না থাকলে record-created date ব্যবহার হবে।
3. ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D160.ps1`
