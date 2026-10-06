# Risk Alerts — "সহায়তা প্রয়োজন" ছাত্র-সতর্কতা (Revision 12)

> ঝরে পড়া/পিছিয়ে পড়া ঠেকাতে **নিয়ম-ভিত্তিক** (ML নয়) সতর্কতা: উপস্থিতি, নম্বরের পতন, ফি-বকেয়া। টেবিল: `risk_flags`। Module key: `risk_alerts` (core; school · college · coaching)। Roles: Admin, Teacher (নিজের batch)। সংখ্যাগুলো স্বাধীন reference-এ যাচাইকৃত (`refs_r11.py: risk`)।
> **নৈতিক সীমা:** এটি ছাত্রকে "লেবেল" করার যন্ত্র নয়, শিক্ষককে সময়মতো সাহায্য করার সংকেত। ছাত্র বা অভিভাবক-পোর্টালে দেখানো হয় না; কোনো স্বয়ংক্রিয় শাস্তি/ফল-আটকানো নেই; প্রতিটি সতর্কতার সাথে "কেন" (প্রমাণ) থাকে।

## ১. নিয়ম (থ্রেশহোল্ড সবই `settings.risk`, ডিফল্ট নিচে)
| ধরন (`kind`) | মাপ | watch | high |
|---|---|---|---|
| `attendance` | গত ৩০ দিনে উপস্থিতি % (ছুটি-অনুমোদিত দিন বাদ) | < ৭৫ | < ৬০ |
| `marks_drop` | আগের দুই প্রকাশিত পরীক্ষার গড় % − সর্বশেষ % (পয়েন্ট) | ≥ ১৫ | ≥ ২৫ |
| `dues` | কত মাসের ফি বকেয়া (`FeeService`) | ≥ ২ | ≥ ৩ |
| `combined` | উপরের ফ্ল্যাগ-গুলোর সমন্বয় | যেকোনো ১টি watch | **২+ ফ্ল্যাগ অথবা যেকোনো high ⇒ high** |
**যাচাইকৃত উদাহরণ:** উপস্থিতি ৭০% + নম্বর ৭২→৫০ ⇒ `attendance=watch`, `marks_drop=watch` ⇒ combined **high**। শুধু ২ মাস বকেয়া ⇒ **watch**। উপস্থিতি ৫৫% একা ⇒ **high**। সুস্থ (৯২%, ৭০→৭৪, বকেয়া নেই) ⇒ কোনো ফ্ল্যাগ নেই।
**অনুপস্থিত-টানা:** টানা ≥ ৩ কর্মদিবস অনুপস্থিত ⇒ `attendance` kind-এ `details.consecutive_absent` সহ high (সেটিং `consecutive_absent_high`, ডিফল্ট ৩)।

## ২. কীভাবে চলে
- দৈনিক job `risk:evaluate` (`Tenancy::each`, `TenantAwareJob`): প্রতি সক্রিয় enrollment-এর জন্য উপরের মাপ → `risk_flags` সারি।
- **শুধু পরিবর্তনে লেখে:** `UNIQUE (student_id, kind, computed_on)`; একজনের একটি kind-এর "বর্তমান অবস্থা" = সর্বশেষ সারি। আগের দিনের সাথে `level` বদলালে (বা প্রথমবার) নতুন সারি; অপরিবর্তিত থাকলে নয় (দিনে দিনে ফুলে ওঠা এড়াতে)। শর্ত কেটে গেলে `status=resolved`।
- `details` (JSON): মাপ, থ্রেশহোল্ড, সময়সীমা, উৎস (যেমন `{"attendance_pct":70,"window_days":30,"present":21,"working":30}`) — "কেন" সবসময় দেখানো হয়।
- অবস্থা: `open → acknowledged` (শিক্ষক "দেখেছি" + `note`, `acknowledged_by`) `→ resolved` (স্বয়ংক্রিয় অথবা হাতে)।
- রক্ষণ: ৯০ দিনের পুরনো `resolved` সারি `risk:prune` (retention — `docs/legal/privacy-and-consent.md` তালিকায়)।

## ৩. বিজ্ঞপ্তি
শ্রেণিশিক্ষক ও Admin: in-app + (ঐচ্ছিক) সাপ্তাহিক সারাংশ। অভিভাবককে বার্তা **ডিফল্ট বন্ধ** (`settings.risk.notify_parents`); চালু থাকলে নরম ভাষার টেমপ্লেট `risk_parent_notice` ("আপনার সন্তানের সাম্প্রতিক উপস্থিতি নিয়ে আলোচনা করতে চাই"), promotional-ধরনের, তাই `consents.sms` ও নীরব-সময় মেনে (`docs/modules/communication-plus.md`)।

## ৪. Endpoint (`module:risk_alerts`)
```
GET  /risk/flags?batch_id=&level=&status=     GET /risk/students/{id}
POST /risk/flags/{id}/acknowledge { note }    POST /risk/flags/{id}/resolve { note }
GET|PUT /risk/settings        (Admin: থ্রেশহোল্ড, notify_parents)       POST /risk/evaluate   (Admin: এখনই চালান, শুধু নিজের প্রতিষ্ঠান)
```

## ৫. পরীক্ষা ও Done When
| Test | Asserts |
|---|---|
| `RiskRulesTest` | §১-এর চারটি উদাহরণ হুবহু; সীমারেখা (৭৫ ঠিক = watch নয়, ৭৪.৯৯ = watch); কনসেকিউটিভ-অনুপস্থিতি |
| `RiskChangeOnlyTest` | অপরিবর্তিত অবস্থায় নতুন সারি নয়; level বদলালে নতুন সারি; শর্ত কাটলে resolved |
| `RiskExcusedAbsenceTest` | অনুমোদিত ছুটির দিন উপস্থিতি-হারে অনুপস্থিত গণ্য নয় |
| `RiskVisibilityTest` | Student/Parent/Accountant 403; Teacher শুধু নিজের batch; পোর্টালে কোথাও নেই |
| `RiskNoAutoActionTest` | কোনো ফল/admit-card/ফি-নীতি এই ফ্ল্যাগে বদলায় না |
| `RiskTenancyTest` | job `TenantAwareJob`; অন্য প্রতিষ্ঠানের ছাত্র 404 |
- **Done When:** school demo-তে ৪ ধরনের ছাত্র (উপরের ৪টি) → ঠিক সেই ফ্ল্যাগ; শিক্ষক acknowledge করে; ছাত্র/অভিভাবক-পোর্টালে কিছুই দেখা যায় না; থ্রেশহোল্ড বদলে ফল বদলায়।
- **মালিকের সিদ্ধান্ত বাকি:** থ্রেশহোল্ডের ডিফল্ট (আমার অনুমান — প্রকৃত প্রতিষ্ঠানের শিক্ষকের সাথে মেলান); অভিভাবক-বার্তা চালু করা হবে কি।
