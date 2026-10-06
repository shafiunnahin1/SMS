# Communication Plus — SMS টেমপ্লেট/শিডিউল/ক্যাম্পেইন, delivery-অবস্থা, জরুরি সতর্কতা, নোটিশ-স্বীকৃতি (Revision 12)

> আগে SMS ছিল "পাঠানো + লগ"। এখন: প্রতিষ্ঠান-সম্পাদনযোগ্য টেমপ্লেট, নির্ধারিত পাঠানো, ক্যাম্পেইন (খরচ-অনুমানসহ), gateway-র delivery-অবস্থা, এক-ট্যাপ জরুরি সতর্কতা, এবং নোটিশে "পড়েছেন/স্বীকার"। টেবিল: `sms_templates`, `sms_campaigns`, `notice_receipts`; কলাম: `sms_logs.campaign_id/gateway_msg_id/delivery_status/delivered_at`, `notices.require_ack/ack_deadline`। Module key: বিদ্যমান `sms`, `notices` (নতুন key নেই)। Roles: Admin (সব), Accountant (শুধু ফি-স্মারক), Teacher (নিজের batch-এ নোটিশ/বার্তা)।
> **যাচাই-না-করা:** SSL Wireless বা অন্য gateway-র delivery-report (DLR) callback/status API-র ফরম্যাট আমি জানি না → `TODO(OD-sms-dlr)`; Unicode ফ্ল্যাগ আগের মতো `TODO(OD-sms-unicode)`। নিচের "delivery-অবস্থা" অংশ adapter-স্লট, অনুমান-করা প্রোটোকল নয়।

## ১. SMS টেমপ্লেট (`sms_templates`)
- `code` (সিস্টেম-কী যেমন `absent_alert`, `fee_due`, `fee_receipt`, `result_published`, `admission_result`, `risk_parent_notice`, `donation_thanks`, `emergency`; অথবা কাস্টম), `name`, `category` (`transactional` · `promotional` · `emergency`), `body` (JSON `{bn,en,ar}`), `is_system`, `is_active`; `UNIQUE (institution_id, code)`।
- **সিস্টেম টেমপ্লেট** (`is_system=1`): মোছা যায় না; বডি সম্পাদনা যায় কিন্তু **আবশ্যিক ভেরিয়েবল** (যেমন `{student_name}` `absent_alert`-এ) বাদ দেওয়া যায় না।
- **ভেরিয়েবল-তালিকা (allow-list):** `{student_name} {guardian_name} {batch} {program} {date} {due_amount} {receipt_no} {institution} {short_name} {amount} {link}`; অজানা `{x}` সংরক্ষণেই 422। কোনো কোড/HTML নয়।
- **প্রিভিউ:** নমুনা ডেটায় রেন্ডার + **অংশ-সংখ্যা** (`SmsSegments`, Unicode সতর্কতা)। সংরক্ষণ-সীমা: `settings.sms.max_segments` (ডিফল্ট ৩)।
- **ভাষা:** প্রাপকের ভাষায় (`docs/I18N.md` §৭); সেই ভাষার বডি না থাকলে fallback চেইন (`ar→bn→en`)।
- **category-র অর্থ:** `transactional` (হাজিরা-সতর্কতা, রসিদ, OTP) — সম্মতি-পরীক্ষা নেই (D27 অনুযায়ী), নীরব-সময় প্রযোজ্য নয় OTP/রসিদে; `promotional` (বিজ্ঞপ্তি, ঘোষণা, ফি-স্মারক-ধরনের তথ্য) — `consents.sms` + নীরব-সময় + দৈনিক-সীমা প্রযোজ্য; `emergency` — §৪।

## ২. ক্যাম্পেইন ও নির্ধারিত পাঠানো (`sms_campaigns`)
`kind` (`campaign|reminder|emergency`; নির্ধারিত = `scheduled_at` আছে), `title`, `template_id`/`body`, `audience` (JSON ফিল্টার), `status` (`draft|scheduled|sending|done|cancelled`), `scheduled_at`, কাউন্টার (`total_recipients`, `sent_count`, `failed_count`, `segments_total`)।
- **দর্শক-নির্মাণ:** সব অভিভাবক · program · batch · "ফি বকেয়া ≥ X" · "আজ অনুপস্থিত" · "নোটিশ-অস্বীকৃত" · শিক্ষক/কর্মচারী · কাস্টম তালিকা। opt-out (`promotional`-এ `consents.sms` নেই) বাদ।
- **ডি-ডুপ্লিকেট:** একই ফোন (ভাইবোনের একই অভিভাবক-নম্বর) **একটিই** SMS। **যাচাইকৃত:** তিন ভাইবোন (একই নম্বর) + আরও দুজন ⇒ ৩ ইউনিক প্রাপক; এক-লাইনের বাংলা বার্তা ১ অংশ ⇒ ৩ ক্রেডিট; প্ল্যাটফর্ম-নামের suffix যোগে ২ অংশ ⇒ ৬ ক্রেডিট।
- **খরচ-অনুমান ও নিশ্চিতকরণ:** পাঠানোর আগে `ইউনিক প্রাপক × অংশ = ক্রেডিট` ও বর্তমান ব্যালেন্স; ব্যালেন্স কম হলে আটকায়। ৫০০+ প্রাপকে টাইপ-করা নিশ্চিতকরণ। `settings.sms.daily_cap` (ডিফল্ট ১,০০০) পেরোলে `promotional` আটকায়।
- **নির্ধারিত:** `scheduled_at ≥ এখন + ২ মিনিট`; `sms:dispatch` প্রতি মিনিটে (`Tenancy::each`) যা সময়মতো; রদ-ক্ষমতা `sending` শুরুর আগে, চলার মধ্যে "বাকিগুলো বাতিল"।
- **নীরব-সময় (`settings.sms.quiet_hours`, ডিফল্ট ২২:০০–০৭:০০, শুরু অন্তর্ভুক্ত, শেষ বাদ):** `promotional` ওই সময়ে পড়লে পরের ০৭:০০-এ স্থানান্তরিত। **যাচাইকৃত:** ২৩:৩০ ও ০৬:৫৯ নীরব; ০৭:০০ ও ২১:৫৯ নয়; ২২:০০ নীরব। `transactional` (OTP/রসিদ/হাজিরা) ও `emergency` প্রভাবিত নয়।
- **পুনঃচেষ্টা:** gateway-র অস্থায়ী ত্রুটিতে ৩ বার (৫/১৫/৬০ মিনিট ব্যবধানে); প্রতিটি চেষ্টা `sms_logs`-এ আলাদা সারি; চূড়ান্ত অবস্থা = শেষ সারি। স্থায়ী ত্রুটি (অবৈধ নম্বর) পুনঃচেষ্টা নয়।
- **ক্রেডিট:** gateway গ্রহণ করলে কাটে; প্রত্যাখ্যানে `sms_credit_transactions`-এ ফেরত-লাইন। পরে "undelivered" হলে ফেরত নেই (নীতি; প্ল্যাটফর্ম বদলাতে পারে)।

## ৩. Delivery-অবস্থা (adapter-স্লট, `TODO(OD-sms-dlr)`)
- `sms_logs.status` = gateway *গ্রহণ* করল কি না (`sent|failed`); `delivery_status` (`NULL|delivered|undelivered|expired`) = হ্যান্ডসেটে পৌঁছাল কি না; `gateway_msg_id` দিয়ে মিল।
- Adapter ইন্টারফেস `SmsGateway::parseDeliveryReport(Request): ?array` ও ঐচ্ছিক `fetchStatus(string $msgId)`। কেন্দ্রীয় route `POST /webhooks/sms/{provider}` (সই/IP-allowlist প্রদানকারীর নিয়মে — **অজানা**, তাই নিষ্ক্রিয় থাকে যতক্ষণ না কনফিগ)। প্রদানকারীর ডকুমেন্ট ছাড়া **কিছু অনুমান করে বসানো হবে না**।
- ক্যাম্পেইন-রিপোর্ট: গৃহীত/ব্যর্থ সবসময়; "পৌঁছেছে %" শুধু DLR চালু থাকলে (অন্যথায় "অজানা")।

## ৪. জরুরি সতর্কতা (`sms_campaigns.kind = 'emergency'`)
- **কে:** শুধু Admin। **কীভাবে:** "জরুরি বার্তা" বোতাম → টেমপ্লেট বা মুক্ত বার্তা → দর্শক (সব অভিভাবক · কর্মী · নির্দিষ্ট batch) → **অনুমান: প্রাপক, অংশ, ক্রেডিট** → টাইপ-করা নিশ্চিতকরণ শব্দ → তাৎক্ষণিক পাঠানো।
- **ব্যতিক্রম:** নীরব-সময়, দৈনিক-সীমা ও `promotional` সম্মতি-পরীক্ষা **বাইপাস** (নিরাপত্তা-বার্তা) — **এই বাইপাসের আইনি গ্রহণযোগ্যতা আমি যাচাই করিনি**; প্রতিষ্ঠান ToS-এ উল্লেখ করবে (`docs/legal/`)। ব্যালেন্স না থাকলে বাইপাস করে না — কম হলে আংশিক পাঠিয়ে বাকি তালিকা দেখায়।
- ইন-অ্যাপ + (থাকলে) push একই সাথে; "সব ঠিক আছে" ফলো-আপ একই দর্শকে এক-ট্যাপ। প্রতিটি জরুরি বার্তা `audit_logs`-এ (কে, কখন, কত জন)।

## ৫. নোটিশ: নির্ধারিত প্রকাশ ও স্বীকৃতি
- **নির্ধারিত প্রকাশ:** `notices.published_at` ভবিষ্যতে হলে প্রকাশের আগে প্রাপকদের কাছে অদৃশ্য (প্রশ্ন-ফিল্টার `published_at <= now()`); সময় এলে in-app/push, `promotional` SMS চাইলে ক্যাম্পেইন।
- **স্বীকৃতি:** `notices.require_ack = 1`, `ack_deadline`। `notice_receipts` (`read_at`, `acknowledged_at`; `UNIQUE (notice_id, user_id)`) — পড়া স্বয়ংক্রিয় (ওপেন), স্বীকৃতি স্পষ্ট বোতাম। প্রাপক-গোষ্ঠী নোটিশের `target/program/batch` থেকে।
- **রিপোর্ট:** কে পড়েনি/স্বীকার করেনি (তালিকা, %); এক-ট্যাপে "অস্বীকৃতদের স্মারক" (audience `ack_missing:<notice_id>` ⇒ ক্যাম্পেইন)। ডেডলাইন-পেরোনো অস্বীকৃতি লাল।
- Student/Parent শুধু নিজের রসিদ; কে-দেখল তালিকা Admin/নোটিশ-লেখক।

## ৬. Endpoint
```
GET|POST|PUT /sms/templates   POST /sms/templates/{id}/preview
GET|POST /sms/campaigns       POST /sms/campaigns/{id}/estimate | schedule | send | cancel     GET /sms/campaigns/{id}/report
POST /sms/emergency { template_id|body, audience, confirm_word }       GET /sms/emergency/estimate
POST /webhooks/sms/{provider}            (কেন্দ্রীয়; নিষ্ক্রিয় যতক্ষণ না প্রদানকারী কনফিগ)
POST /notices/{id}/ack     GET /notices/{id}/receipts     POST /notices/{id}/remind-missing
```

## ৭. পরীক্ষা ও Done When
| Test | Asserts |
|---|---|
| `TemplateVariableTest` | অজানা `{x}` 422; সিস্টেম টেমপ্লেটের আবশ্যিক ভেরিয়েবল বাদ দেওয়া 422; প্রিভিউ অংশ-সংখ্যা |
| `CampaignEstimateTest` | ৩ ইউনিক/৩ ক্রেডিট ও ৬ ক্রেডিট (suffix) উদাহরণ; ব্যালেন্স কম হলে আটকায় |
| `QuietHoursTest` | ২২:০০/২৩:৩০/০৬:৫৯ নীরব, ০৭:০০/২১:৫৯ নয়; transactional ও emergency প্রভাবহীন; স্থানান্তর ০৭:০০ |
| `ScheduleDispatchTest` | সময়মতো যায়; রদ কাজ করে; `scheduled_at` < +২ মিনিট 422; job tenant-নিরাপদ |
| `RetryTest` | অস্থায়ীতে ৩ বার, স্থায়ীতে ০; ক্রেডিট-ফেরত প্রত্যাখ্যানে |
| `ConsentFilterTest` | promotional-এ `consents.sms` নেই বাদ; transactional বাদ নয় |
| `EmergencyTest` | শুধু Admin; confirm-word ছাড়া 422; নীরব-সময়ে যায়; audit; ব্যালেন্স কমে আংশিক |
| `DeliveryAdapterTest` | DLR নিষ্ক্রিয়ে `delivery_status` NULL ("অজানা"); adapter-mock-এ আপডেট; কোনো অনুমান-করা প্রদানকারী-লজিক নেই |
| `NoticeScheduleTest` | ভবিষ্যৎ `published_at` প্রাপকের কাছে অদৃশ্য |
| `NoticeAckTest` | read স্বয়ংক্রিয়, ack স্পষ্ট; unique; অস্বীকৃতি-তালিকা ও স্মারক-দর্শক |
| `CommunicationTenancyTest` | অন্য প্রতিষ্ঠানের campaign/template/receipt 404 |
- **Done When:** (ক) টেমপ্লেট সম্পাদনা→প্রিভিউ→ক্যাম্পেইন (২০ প্রাপক, নির্ধারিত) →খরচ ঠিক→ পাঠানো; (খ) নীরব-সময়ে promotional স্থগিত, OTP নয়; (গ) জরুরি বার্তা নীরব-সময়েও যায়; (ঘ) `require_ack` নোটিশে অস্বীকৃতদের তালিকা ও এক-ট্যাপ স্মারক; (ঙ) DLR বন্ধ থাকলে রিপোর্টে "অজানা", ভুল "পৌঁছেছে" নয়।
