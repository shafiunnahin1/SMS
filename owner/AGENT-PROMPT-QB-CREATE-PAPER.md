# VS Code কোডিং এজেন্টের জন্য প্রম্পট: "Create question paper" চাপলে নামের ঘর খোলে না

> মালিক এই লেখাটা এজেন্টকে দেবেন। এটা শুধু দেখে রিপোর্ট দেওয়ার কাজ। কোড, test বা docs কিছু বদলাবে না, commit বা push করবে না।

## সমস্যা
অ্যাডমিন হিসেবে প্রশ্ন খোঁজার পাতায় (`/admin/question-bank/all-questions`) কেনা ৫টি MCQ বেছে নিচের ভাসমান বোতাম "Create question paper 5" (বাংলায় "প্রশ্নপত্র তৈরি") চাপলে বোতামের ঠিক উপরে প্রশ্নপত্রের নামের ঘর আর সেভ বোতাম আসার কথা। Windows ব্রাউজারে সেটা আসছে না। কোডের test-এ (jsdom) ঘরটি খোলে, তাই আসল ব্রাউজারে কী হচ্ছে তা জানা দরকার।

## যা করবে
1. `git pull origin claude/r216-omr-d127`। তারপর আগের মতো API (`api\public` থেকে `php -S 127.0.0.1:8000`) আর frontend (`npm run dev`) চালু করো। principal হিসেবে লগইন করো।
2. পাতাটি খোলো। ঠিকানায় `?paper=` আছে কি না দেখো এবং লিখে রাখো। ৫টি কেনা প্রশ্ন বেছে নাও।
3. ব্রাউজারের DevTools খোলো (F12): Console আর Elements।
4. বোতামটি **একবার** চাপো। তারপর রিপোর্টে লেখো:
   - Console-এ কোনো লাল error আসে কি না (হুবহু)।
   - Elements-এ `[data-testid="qb-create-paper"]`-এর ভেতরে `input[name="paper_name"]` তৈরি হয় কি না।
   - তৈরি হলে: Elements-এ সেটির উপর মাউস রাখলে পাতায় কোথায় দেখায়? Console-এ চালাও: `document.querySelector('input[name="paper_name"]').getBoundingClientRect()`। ফলটা হুবহু লেখো।
   - সেটির উপরে অন্য কোনো জিনিস ঢাকা পড়ে আছে কি না দেখো। Console-এ চালাও: `(() => { const r = document.querySelector('[data-testid="qb-create-paper"]').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + 10)?.outerHTML.slice(0, 300) })()`। ফলটা লেখো।
5. বোতামটি **আরেকবার** চাপো, তারপর ধাপ ৪-এর একই জিনিসগুলো আবার দেখো (ঘরটি খোলা আর বন্ধের মধ্যে বদলায়)।
6. ব্রাউজারের জানালা বড় করে (1400px চওড়া) আর মোবাইল মাপে (360px) দুইভাবেই দেখো।
7. স্ক্রিনশট নাও: বোতাম চাপার আগে, আর প্রথমবার চাপার পরে।

## নিয়ম
কিছু বদলাবে না, commit বা push করবে না। `.env`-এর কোনো মান লিখবে না। কাজ শেষে সার্ভার বন্ধ করবে।

## রিপোর্ট
```
QB create-paper রিপোর্ট
- git commit:
- ঠিকানা (?paper= আছে কি না):
- বোতামের লেখা চাপার আগে / পরে:
- প্রথমবার চাপার পর: console error / input তৈরি হলো কি না / getBoundingClientRect / elementFromPoint:
- দ্বিতীয়বার চাপার পর: একই
- 1400px ও 360px-এ পার্থক্য:
- স্ক্রিনশট:
```
