# খসড়া সিদ্ধান্ত D177: রিলোডের পরেও প্রশ্নের ফিল্টার থাকা

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D177.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBK.1; push করে না)।

## ১. মালিকের অনুরোধ (2026-10-28)
ব্রাউজার রিলোড করলে বাছাই করা প্রশ্ন থাকে (D176), কিন্তু ফিল্টারের মান রিসেট হয়ে যায়। রিলোডের পরেও ফিল্টার থাকতে হবে।

## ২. এজেন্টের প্রস্তাব (ভিন্নমত হলে জানাবেন)
- প্রতিষ্ঠানের "সব প্রশ্ন" (`/admin|teacher/question-bank`) ও লেখক/যাচাইকারীর প্রশ্ন-তালিকায় ফিল্টারের সব মান (খোঁজার লেখা, শ্রেণি, বিষয়, অধ্যায়, টপিক, পাঠ্যক্রম, প্রশ্নের ধরন, উৎস, বছর) এবং বর্তমান পৃষ্ঠা-নম্বর এই ব্রাউজারে রাখা হবে — D176-এর মতো পেজ, প্রতিষ্ঠান ও ব্যবহারকারী আলাদা করে।
- রিলোডের পর আগের ফিল্টার ও পৃষ্ঠা ফিরে আসবে; ফিল্টারের রিসেট বোতাম চাপলে বা লগআউটে মুছবে। লেখকের তালিকায় অবস্থা-ট্যাব (সব/খসড়া/যাচাইয়ের অপেক্ষায়…) আগের মতোই ঠিকানায় (`?status=`) থাকে।
- যে মান আর নেই (যেমন মুছে ফেলা অধ্যায়) তা চুপচাপ বাদ পড়বে। প্রশ্নপত্রে "প্রশ্ন যোগ" (`?paper=`) করার সময়ও একই ফিল্টার থাকে।
- শুধু স্ক্রিনের কাজ: নতুন টেবিল, কলাম, route বা package নয়।

## ৩. সিদ্ধান্তের সারি
| D177 | Question filters survive a browser reload | Owner approved (2026-10-28). (1) On the institution question bank (All Questions) and the writer / reviewer question list, every filter value (search text, class, subject, chapter, topic, curriculum, question type, source, year) and the current page number are kept in that browser per page, institution and user (as D176), and are restored after a reload; a value no longer offered is dropped silently. (2) They are cleared by the filter's reset button and at logout; the writer list's status tab stays in its address (`?status=`). (3) Screens only: no new table, column, route or package. Task QBK.1 (after QBS.1); commits carry `Change-Request: D177`. |
