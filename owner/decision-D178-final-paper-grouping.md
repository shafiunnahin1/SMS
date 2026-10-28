# খসড়া সিদ্ধান্ত D178: বহু-বিষয়ের প্রশ্নপত্রে "বিষয় অনুযায়ী সাজানো" নিজে থেকে চালু, এবং চূড়ান্ত প্রশ্নপত্রেও তা ও বিষয়ের ক্রম বদলানো

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D178.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBG.1; push করে না)। D177 থেকে স্বাধীন।

## ১. মালিকের অনুরোধ (2026-10-28)
প্রশ্নপত্রের প্রিভিউয়ে প্রশ্নের ধরন অনুযায়ী ভাগ হচ্ছে, কিন্তু বিষয় অনুযায়ী আলাদা গ্রুপ হচ্ছে না (যেমন বাংলা ১–২০, গণিত ২১–৪০, উপরে বিষয়ের নাম; এক বিষয়ের প্রশ্ন অন্য বিষয়ে যাবে না; শুধু সিরিয়াল ও অপশন নিজের গ্রুপে এলোমেলো হবে)। এই ব্যবস্থা D128-এ আছে ("বিষয় অনুযায়ী প্রশ্ন সাজান" চেকবক্স), কিন্তু চূড়ান্ত প্রশ্নপত্রে এখন বদলানো যায় না। মালিক: "চূড়ান্ত করার পরেও চেঞ্জ করার সুযোগ থাকতে হবে।"

## ২. এজেন্টের প্রস্তাব (ভিন্নমত হলে জানাবেন)
- চূড়ান্ত প্রশ্নপত্রে, যতক্ষণ এর কোনো OMR শিট স্ক্যান হয়নি (D133-এর একই শর্ত), প্রধান শিক্ষক বা প্রশ্নপত্রের শিক্ষক প্রশ্নপত্রের পাতা থেকে "বিষয় অনুযায়ী সাজান" চালু/বন্ধ এবং বিষয়ের ক্রম বদলাতে পারবেন।
- বদলালে সেটগুলো নতুন ক্রমে আবার তৈরি হবে — একই সংখ্যক সেট, একই শাফল-পদ্ধতি ও একই সেট-নাম; প্রশ্নপত্র চূড়ান্তই থাকবে; প্রতিটি সেটের উত্তরমালা নতুন ক্রম অনুযায়ী; তৈরি-করা OMR আনলক হয়ে নতুন করে তৈরি হবে (D173-এর নাম-বদলের মতো)। আগে ছাপানো কাগজ তখন আর মিলবে না — তাই বদলানোর আগে নিশ্চিতকরণ বার্তায় সেটি বলা হবে।
- একটি OMR শিট স্ক্যান হয়ে গেলে বদলানো যাবে না (কারণ দেখাবে); তখন কপি করে নতুন প্রশ্নপত্র।
- নতুন টেবিল, কলাম বা package নয়; বিদ্যমান প্রশ্নপত্র-সেটিংস ও সেট-তৈরির কোড ব্যবহার। দরকার হলে বিদ্যমান প্রশ্নপত্র-route-এ একটি নতুন action (কাজ শুরুর সময় নিশ্চিত করে জানাব)।
- একাধিক বিষয়ের প্রশ্ন নিয়ে নতুন প্রশ্নপত্র তৈরি হলে "বিষয় অনুযায়ী সাজান" নিজে থেকেই চালু থাকবে (মালিকের উত্তর, 2026-10-28), বিষয়ের ক্রম = প্রথম যে ক্রমে বিষয় এসেছে; শিক্ষক চাইলে বন্ধ করতে পারবেন। এক বিষয়ের প্রশ্নপত্রে কিছু বদলায় না; আগে তৈরি প্রশ্নপত্র নিজে থেকে বদলায় না।

## ৩. সিদ্ধান্তের সারি
| D178 | Subject grouping on by default for multi-subject papers and changeable on a final paper (amends D126 (2), D128, D133) | Owner approved (2026-10-28). (1) On a final paper none of whose OMR sheets is scanned, the head teacher or the paper's teacher may turn D128 subject grouping on or off and change the subject order. (2) The paper stays final and its sets are rebuilt in the new order with the same number of sets, the same strategy and the same set names, each with its answer key for the new order; a generated OMR form is unlocked to be rebuilt. The confirmation says that copies printed earlier will no longer match. (3) Once any OMR sheet of the paper is scanned this is refused with the reason shown (D133). (4) A new paper created with questions of more than one subject has subject grouping on by default (subjects in the order first met); the teacher may turn it off; single-subject papers and existing papers are unchanged. (5) No new table, column or package; at most one new action on the existing paper routes. Task QBG.1 (after QBS.1); commits carry `Change-Request: D178`. |
