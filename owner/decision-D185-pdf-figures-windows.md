# খসড়া সিদ্ধান্ত D185: Windows-এ সার্ভারের PDF-এ গ্রাফ ও চিত্র আঁকা

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D185.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ PDFW.1; push করে না)।

## ১. সমস্যা
সার্ভারের PDF (`GET question-bank/papers/{id}/pdf`, Chromium, D50/D118 (4)) গ্রাফ ও চিত্র আঁকার জন্য qbank-এর টুল-ফোল্ডারটি একটি অস্থায়ী ফোল্ডারে **symlink** করে (`PdfService::withFigurePage`)। Windows-এ সাধারণ অনুমতিতে symlink তৈরি হয় না (Developer Mode বা Administrator ছাড়া), তাই মালিকের PC-তে প্রতিটি গ্রাফ/চিত্র "আঁকা যায়নি" placeholder হয়ে আসে। (VS Code এজেন্ট এটি পুরো ফোল্ডার কপি করে ঠিক করার চেষ্টা করেছিল, কিন্তু একই WIP-এ একটি পরীক্ষা মুছে ফেলা ও tenancy-বাঁধন সরানোর মতো ক্ষতিকর বদলও ছিল; WIP শাখাটি মালিকের নির্দেশে মুছে ফেলা হয়েছে।)

## ২. এজেন্টের প্রস্তাব
- আগের মতো প্রথমে symlink; symlink তৈরি না হলে তবেই টুল-ফোল্ডারের **কপি** অস্থায়ী ফোল্ডারে (Windows-এ Developer Mode চালু থাকলে symlink-ই কাজ করবে, কপি লাগবে না)।
- PDF শেষ হলে অস্থায়ী ফোল্ডার — symlink হোক বা কপি — সবসময় মোছা হবে; কপি মোছার সময় শুধু সেই অস্থায়ী ফোল্ডারের ভেতরেই মুছবে, কখনো আসল qbank ফোল্ডার নয় (symlink অনুসরণ করে মোছা নয়)।
- আচরণ আর কিছু বদলায় না: নেটওয়ার্ক নয় (file:// থেকেই), tenancy-বাঁধন, পরীক্ষা ও Blade টেমপ্লেট অপরিবর্তিত।
- পরীক্ষা: symlink ব্যর্থ ধরে নিয়ে কপির পথে গ্রাফ আঁকা হয় এবং শেষে অস্থায়ী ফোল্ডার মুছে যায়, আসল ফোল্ডার অক্ষত থাকে।
- নতুন টেবিল, কলাম, route বা package নয়।

## ৩. সিদ্ধান্তের সারি
| D185 | Server-side paper PDF draws graphs and diagrams where symlinks are unavailable (Windows) | Owner approved (2026-11-01). (1) `PdfService` keeps linking qbank's tools folder into the temporary print page folder; when the link cannot be created it copies the folder there instead. (2) The temporary folder (link or copy) is always removed afterwards, never following a link and never touching the real tools folder. (3) Nothing else changes: no network, the paper PDF's tenant binding, templates and tests stay as they are. (4) No new table, column, route or package. Task PDFW.1 (after QBG.1); commits carry `Change-Request: D185`. |
