# Donations — দান ও অনুদান ব্যবস্থাপনা (Revision 12)

> অনুদান-নির্ভর প্রতিষ্ঠান (বিশেষত মাদ্রাসা) এর জন্য: দাতা, ফান্ড, প্রচারণা, রসিদ, ফান্ড-ভিত্তিক হিসাব, সীমাবদ্ধ ফান্ডের ব্যয়-পাহারা। টেবিল: `donors`, `donation_funds`, `donation_campaigns`, `donations`; `expenses.fund_id`।
> **ধর্মীয় রায় নেই (D39):** `kind` (যাকাত, সদকা, ওয়াক্ফ, নির্মাণ, বৃত্তি, সাধারণ…) শুধু **ট্যাগ**। কোন তহবিল কোথায় খরচ করা যাবে — প্রতিষ্ঠান (আলেম/উপদেষ্টা-কমিটির সিদ্ধান্তে) `restricted` ও `description`-এ নিজে সংজ্ঞায়িত করে; সিস্টেম সেই সংজ্ঞা *প্রয়োগ* করে, কোনো শরয়ী/আইনি রায় দেয় না। কর-ছাড়ের রসিদের আইনি শর্ত আমি যাচাই করিনি।
> Module key: `donations` — **opt-in** (ডিফল্ট বন্ধ; মাদ্রাসা-প্রিসেট বা Admin চালু করে)। ধরন: school · college। Roles: Admin, Accountant। সিদ্ধান্ত **D39**।

## ১. ডেটা (স্কিমা অনুযায়ী)
- `donors`: নাম, ফোন (`UNIQUE (institution_id, phone)` — একই ফোনে দুজন নয়), ঠিকানা, `type` (`individual|organization|anonymous`), `deleted_at`। **বেনামি দান:** `donations.donor_id = NULL`।
- `donation_funds`: `name` (অনন্য), `kind` (ট্যাগ), `restricted` (০/১), `description` (ব্যয়ের শর্ত — মানুষ-পাঠ্য), `is_active`।
- `donation_campaigns`: `fund_id`, `title`, `goal_amount`, `starts_on/ends_on`, `status` (`draft|active|closed`)।
- `donations`: `fund_id`, `campaign_id`, `amount`, `method` (`cash|bank|bkash|nagad|cheque`), `received_on`, `receipt_no` (`UNIQUE (institution_id, receipt_no)`), `purpose_note`, `status` (`received|reversed`), `reverses_id`, `received_by`।
- **শুধু টাকা:** পণ্য/জিনিস-দান (in-kind) এই সংস্করণে নেই।

## ২. নিয়ম
1. **রসিদ:** `DON-{YYYY}-{seq}` (`nextReceiptNo('DON')`, transaction + institution row lock); PDF দাতার ভাষায়; বেনামিতেও রসিদ (নাম ছাড়া)।
2. **সংশোধন = উল্টো লাইন (D32):** দান ভুল হলে `status=reversed` সারি (`reverses_id`, একই ফান্ড, ঋণাত্মক নয় — `amount` ধনাত্মক, status দিক বোঝায়); মূল সারি অপরিবর্তিত। ফান্ড-ব্যালেন্স = Σ(received) − Σ(reversed) − Σ(`expenses` যার `fund_id` = এই ফান্ড)।
3. **সীমাবদ্ধ ফান্ড-পাহারা (D39):** `expenses.fund_id` সহ ব্যয় সংরক্ষণে `ফান্ড-ব্যালেন্স ≥ ব্যয়` না হলে 422 `fund_overdrawn`। ফান্ড-টাকা থেকে ব্যয় শুধু ব্যয়-পর্দা (`fund_id` বেছে) দিয়ে; ম্যানুয়াল ভাউচারে ফান্ড-অ্যাকাউন্টে নিষেধ (`accounting.md` §১.৬)। **যাচাইকৃত উদাহরণ:** ফান্ডে ১০,০০০ জমা, ৭,০০০ ব্যয় ⇒ ব্যালেন্স ৩,০০০; আরও ৪,০০০ ব্যয় চেষ্টা ⇒ ওভারড্র ⇒ অগ্রাহ্য।
4. **সাধারণ (`restricted=0`) ফান্ড:** ব্যয় কোনো ফান্ডে বাঁধা নয়; ফান্ড-ব্যালেন্স শুধু তথ্য।
5. **হিসাব-খাতা (চালু থাকলে):** দান পোস্ট হয় `4300.<fund_id>` আয়-অ্যাকাউন্টে; ফান্ড-ভিত্তিক বিবরণী ledger থেকে মিলিয়ে নেওয়া যায় (`FundBalanceEqualsLedgerTest`)।
6. **গোপনীয়তা:** দাতার নাম/ফোন সংবেদনশীল নয় কিন্তু ব্যক্তিগত; SMS ধন্যবাদ-বার্তা (`donation_thanks`, প্রাপকের ভাষায়) `consents.sms` মেনে; দাতা-তালিকা Teacher/Student/Parent দেখে না; পাবলিক সাইটে দাতার নাম **প্রকাশ নেই** (ঐচ্ছিক "দাতা-তালিকা" ভবিষ্যৎ, স্পষ্ট সম্মতিসহ)।
7. **অনলাইন দান:** এই সংস্করণে নেই (`online_payments.purpose` এখন `fee | admission_fee`); চাইলে gateway-adapter পুনর্ব্যবহার করে পরে — `docs/ROADMAP.md`।

## ৩. রিপোর্ট
ফান্ড-ভিত্তিক বিবরণী (জমা, ব্যয়, ব্যালেন্স, তারিখ-সীমা) · প্রচারণা-অগ্রগতি (লক্ষ্য বনাম প্রাপ্ত, %) · দাতা-ভিত্তিক বার্ষিক বিবরণী PDF (দাতার অনুরোধে) · দৈনিক দান-তালিকা (ক্যাশবুকের উৎস-ভাগ) · সীমাবদ্ধ ফান্ডের ব্যয়-তালিকা (কে, কী, কত)।

## ৪. Endpoint (`module:donations`)
```
GET|POST|PUT|DELETE /donors            GET /donors/{id}/statement.pdf?year=
GET|POST|PUT /donation-funds           GET /donation-funds/{id}/statement?from=&to=
GET|POST|PUT /donation-campaigns       GET /donation-campaigns/{id}/progress
GET|POST /donations                    POST /donations/{id}/reverse { reason }     GET /donations/{id}/receipt.pdf
```

## ৫. পরীক্ষা ও Done When
| Test | Asserts |
|---|---|
| `DonationReceiptTest` | নম্বর অনন্য/atomic; বেনামি রসিদ; অন্য প্রতিষ্ঠানে একই নম্বর চলে |
| `DonationReversalTest` | মূল অপরিবর্তিত; ফান্ড-ব্যালেন্স কমে; দুবার reverse নিষিদ্ধ |
| `FundGuardTest` | সীমাবদ্ধ ফান্ড ওভারড্র অগ্রাহ্য (১০,০০০/৭,০০০/৪,০০০ উদাহরণ); সাধারণ ফান্ডে নয় |
| `FundBalanceEqualsLedgerTest` | accounting চালু থাকলে ফান্ড-ব্যালেন্স = `4300.x` লেজার |
| `DonorPrivacyTest` | Teacher/Student/Parent 403; পাবলিক এন্ডপয়েন্টে দাতা-তথ্য নেই |
| `DonationGateTest` | opt-in বন্ধ থাকলে 403 `module_disabled`; মাদ্রাসা-প্রিসেট চালু করে |
- **Done When:** মাদ্রাসা demo-তে দুটি ফান্ড (একটি সীমাবদ্ধ), তিন দাতা (একজন বেনামি), দান → রসিদ → ব্যয় → ফান্ড-বিবরণী; ওভারড্র আটকায়; ভুল দান reverse-এ ব্যালেন্স ঠিক।
- **মালিকের সিদ্ধান্ত বাকি:** ফান্ড-ধরনের তালিকা (আপনার আলেম/কমিটির পরামর্শে); কর-ছাড়ের রসিদ-ফরম্যাট; দাতা-তালিকা পাবলিক করা হবে কি; অনলাইন দান।
