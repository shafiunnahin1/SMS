# Finance — Cash Book & Refunds (Revision 11)

> দুটি ফিচার, যা আগে "বাদ/খোলা" ছিল: **দৈনিক ক্যাশবুক (day-end close)** এবং **রিফান্ড/reversal** (ফি, অনলাইন ফি, subscription)। সংখ্যাগুলো `infra/spec-verify/refs_r11.py`-এর Decimal reference-এ চালিয়ে মেলানো। টেবিল: `docs/database/schema.sql` (D13)। নীতি D32: **আর্থিক সংশোধন = নতুন লাইন, সম্পাদনা নয়।**
> Module keys: `cashbook` (চার ধরনেই, core)। রিফান্ড `fees`/`online_payment`-এর অংশ (আলাদা key নেই)।

## ১. ভিত্তি যা আগেই বসানো (R10)
- `fee_payments.status` এ `reversed`, `reverses_id`; `FeeService::dueLines()` **নেট-পরিশোধ** দিয়ে বাকি বিচার করে (ঋণাত্মক লাইন সহ) — তাই রিফান্ডের পর বকেয়া আপনাআপনি ফেরে, fee-কোড বদলাতে হয় না।
- `expenses.payment_method`, `source` (`manual|payroll|advance|store|refund`) — ক্যাশবুক এগুলো পড়ে।

## ২. ফি-রিফান্ড (`fee_refunds`)
### ২.১ প্রবাহ
```
অনুরোধ (Accountant/Admin)  →  অনুমোদন (Admin; নিজের অনুরোধ নিজে নয়, একজন-Admin ব্যতিক্রম audit-সহ)  →  নিষ্পন্ন (processed)
      নগদ/bKash/ব্যাংকে ফেরত দেওয়ার পর "ফেরত দেওয়া হয়েছে" চিহ্ন     →  reversal রসিদ তৈরি (RFD-YYYY-nnnnn)
```
- **কী ফেরত:** মূল রসিদের এক বা একাধিক লাইন, প্রতিটির জন্য পরিমাণ। `refund_lines` = `[{fee_payment_id, amount}]` (কলামের নাম `lines` নয় — `LINES` MySQL-এ সংরক্ষিত শব্দ)।
- **সীমা:** লাইন-প্রতি ফেরত ≤ **ওই লাইনে এখনো ধরে-রাখা নেট** (`positive payments − আগের reversal`)। বেশি → 422। ছাড় (waived) লাইন ফেরত হয় না।
- **নিষ্পন্নে (transaction, institution-row lock):** প্রতিটি লাইনে একটি ঋণাত্মক `fee_payments` সারি (`paid_amount = −x`, `status = reversed`, `reverses_id = মূল`, একই `enrollment/category/month`, নতুন রসিদ `RFD-…` + `line_no`)। মূল সারি **অপরিবর্তিত**। ফলে `dueLines()` বকেয়া ফেরত দেখায়।
- **ক্যাশবুক:** নগদ ফেরত = নগদ-আউট (`expenses` সারি `source=refund`, `payment_method=cash`); মোবাইল/ব্যাংক হলে সংশ্লিষ্ট কলামে।
- **SMS:** অভিভাবককে "৳X ফেরত দেওয়া হয়েছে" (সম্মতি-নিয়মে)।
- **প্রিন্ট:** রসিদে "ফেরত রসিদ", মূল রসিদ নম্বর উল্লেখ। মূল রসিদে "আংশিক/পূর্ণ ফেরত হয়েছে" চিহ্ন (প্রদর্শনে, ডেটা অপরিবর্তিত)।

### ২.২ অনলাইন ফির রিফান্ড
- অনুরোধে `online_payment_id` যুক্ত; `method = online_gateway`।
- **Gateway-র refund API আমি যাচাই করিনি** (bKash/SSLCommerz কী দেয়, কত সময়ে, কী ফি) → `GatewayInterface::refund()` **ঐচ্ছিক method**; adapter এটি না দিলে **ম্যানুয়াল প্রবাহ**: Admin gateway-র নিজের পোর্টালে ফেরত দেয়, তারপর `gateway_refund_ref` সহ "নিষ্পন্ন" চিহ্ন দেয়। API-সক্ষম হলে সিস্টেম নিজে ডাকে (R6, `TODO(OD-refund-api)`)।
- `online_payments.refunded_amount` বাড়ে; পুরো ফেরতে `status = refunded`।
- **প্ল্যাটফর্ম-সংগৃহীত (D14 ২য় মোড)** পেমেন্ট হলে settlement-এ প্রভাব: settlement তখনো `draft/approved` হলে নেট-পাওনা কমে; **ইতিমধ্যে `paid` হলে** `settlements.refund_adjustment` পরের settlement-এ ঋণ হিসেবে যায় (ঋণাত্মক carry-forward), প্রতিষ্ঠানকে জানানো হয়।

### ২.৩ Subscription (প্ল্যাটফর্ম ← প্রতিষ্ঠান) রিফান্ড
`payments.status = refunded` আগে থেকেই ছিল, প্রবাহ ছিল না। এখন: Super Admin কারণসহ পূর্ণ/আংশিক রিফান্ড; `payments.refunded_amount`, `refund_note`; একটি **credit-note** ইনভয়েস (`subscription_invoices.credit_for_id` = মূল, ঋণাত্মক `total`); ম্যানুয়াল gateway-পোর্টালে ফেরত; subscription-মেয়াদ সমন্বয় (`docs/modules/platform-ops.md`)।

### ২.৪ অ্যাক্সেস
| | Admin | Accountant | Teacher/Student/Parent | Super |
|---|---|---|---|---|
| অনুরোধ | ✅ | ✅ | — | — |
| অনুমোদন | ✅ | নিজেরটা নয় | — | — |
| নিষ্পন্ন | ✅ | ✅ | — | — |
| Subscription রিফান্ড | — | — | — | ✅ |
প্রতিটি ধাপ `audit_logs`-এ।

## ৩. ক্যাশবুক (`cash_book_closings`)
### ৩.১ কী
একটি দিনের নগদ-প্রবাহ ও দিনশেষ বন্ধ (close)। **শুধু নগদ** (bKash/ব্যাংক আলাদা কলামে দেখানো, কিন্তু "নগদ অবশিষ্ট"-এ নয়)।
```
নগদ-ইন  = fee_payments (cash, ধনাত্মক) + স্টোর-বিক্রি (cash) + দান (cash) [+ অন্যান্য আয়]
নগদ-আউট = expenses (cash) + বেতন/অগ্রিম (cash) + ফেরত (cash) + ঋণাত্মক fee_payments (cash reversal)
প্রত্যাশিত বন্ধ-অবশিষ্ট = পূর্ব-দিনের বন্ধ-অবশিষ্ট (opening) + নগদ-ইন − নগদ-আউট
```
**যাচাইকৃত উদাহরণ:** opening ৳৫,০০০; ইন: ফি ৳১২,০০০ + স্টোর ৳১,৫০০; আউট: খরচ ৳৩,০০০ + বেতন ৳৮,০০০ + ফেরত ৳৫০০ ⇒ প্রত্যাশিত **৳৭,০০০**; গোনা নগদ ৳৬,৯৮০ ⇒ পার্থক্য **−৳২০**।

### ৩.২ Close ও lock
- Accountant/Admin দিনের শেষে "বন্ধ করুন": `counted_cash` (হাতে-গোনা) লেখে; `difference` সার্ভার গণনা করে; পার্থক্য ≠ ০ হলে `note` বাধ্যতামূলক।
- **বন্ধ দিনে নতুন বা সংশোধিত নগদ-লেনদেন নিষিদ্ধ:** ওই `date`-এর `fee_payments`, `expenses`, স্টোর-বিক্রি, দান লিখতে গেলে 409 `day_closed`। ভুল ধরা পড়লে (ক) আজকের তারিখে সংশোধনী লাইন, অথবা (খ) Admin দিনটি **পুনরায় খুলে** (`status=reopened`, `reopen_reason` বাধ্যতামূলক, audit) সংশোধন করে আবার বন্ধ করে।
- পরের দিনের `opening` = আগের **বন্ধ** দিনের `counted_cash` (না থাকলে `expected_closing`)। মাঝের কোনো দিন বন্ধ না হলে পরের দিন বন্ধ করা যায় না (ক্রম বজায়)। প্রথম দিনের opening হাতে।
- ভবিষ্যৎ-তারিখের লেনদেন নিষিদ্ধ।
- একই `(institution_id, date)` একটি সারি (`UNIQUE`)।

### ৩.৩ প্রতিবেদন
দৈনিক ক্যাশবুক (PDF/Excel): খাত-ভিত্তিক ইন/আউট, পদ্ধতি-ভিত্তিক (নগদ/bKash/ব্যাংক) সারাংশ, সংগ্রাহক-ভিত্তিক সংগ্রহ (কে কত তুলেছে), বন্ধ-অবস্থা, পার্থক্য-ইতিহাস। মাসিক সারাংশ। হিসাব-খাতা চালু থাকলে (`docs/modules/accounting.md`) ক্যাশবুক সেই নগদ-হিসাবের সাথে মেলানো হয়।

## ৪. Endpoint
```
GET  /cashbook?date=               → দিনের ইন/আউট বিবরণ + opening + expected + status
GET  /cashbook/range?from=&to=     POST /cashbook/{date}/close { counted_cash, note? }    POST /cashbook/{date}/reopen { reason }   [admin]
GET  /cashbook/{date}/report.pdf   /report.xlsx
GET|POST /fee-refunds   GET /fee-refunds/{id}   POST /fee-refunds/{id}/approve | reject | process { gateway_refund_ref? }
GET  /fee-refunds/refundable?receipt_no=            → লাইন-ভিত্তিক সর্বোচ্চ ফেরতযোগ্য
POST /super/payments/{id}/refund { amount, reason }    (subscription)
```
মেনু: `ফি` গ্রুপে "ক্যাশবুক" (`module: cashbook`) ও "ফেরত" (`module: fees`)।

## ৫. পরীক্ষা
| Test | Asserts |
|---|---|
| `RefundDueRecalcTest` | পূর্ণ ফেরতে বকেয়া ফেরে; আংশিক (৪০০) → বকেয়া ৪০০; ৬০০ পরিশোধ + ১০০ ফেরত → ৫০০; ছাড়-লাইন কখনো বকেয়া হয় না (reference-এর ৬টি কেস) |
| `RefundCapTest` | লাইন-নেটের বেশি ফেরত 422; দ্বিতীয় ফেরত বাকিটুকু পর্যন্ত; একই অনুরোধ দুবার প্রক্রিয়া idempotent |
| `RefundImmutabilityTest` | মূল `fee_payments` সারি অপরিবর্তিত; reversal সারিতে ঋণাত্মক `paid_amount`, `reverses_id`, `RFD-` রসিদ |
| `RefundSettlementTest` | settlement `draft` হলে নেট কমে; `paid` হলে পরের settlement-এ `refund_adjustment` |
| `SubscriptionRefundTest` | credit-note ঋণাত্মক; `refunded_amount ≤ amount`; পূর্ণ ফেরতে মেয়াদ সমন্বয় |
| `CashBookMathTest` | উপরের উদাহরণ (৭,০০০ / −২০) |
| `CashBookLockTest` | বন্ধ দিনে লিখলে 409; reopen কারণ ছাড়া 422; ক্রম বজায়; ভবিষ্যৎ-তারিখ নিষিদ্ধ |
| `CashBookSourcesTest` | payroll-নগদ, স্টোর-নগদ, দান-নগদ, ফেরত-নগদ সবাই সঠিক কলামে; mobile/bank নগদ-অবশিষ্টে নয় |
| `CashBookTenancyTest` | অন্য প্রতিষ্ঠানের দিন 404; scheduler `Tenancy::each` |

## ৬. Done When
- [ ] ৳১,০০০ ফি আদায় → ৳৪০০ আংশিক ফেরত → বকেয়া ৳৪০০ ও `RFD-` রসিদ; মূল রসিদ অপরিবর্তিত
- [ ] অনলাইন ফি ফেরত (ম্যানুয়াল gateway) → `refunded_amount`, settlement সমন্বয়
- [ ] একটি দিনের ক্যাশবুক বন্ধ (পার্থক্যসহ), বন্ধ দিনে লেনদেন 409, reopen কারণসহ audit-এ
- [ ] দিনের ক্যাশবুক-রিপোর্টের নগদ-ইন/আউট ফি, স্টোর, বেতন ও ফেরতের আলাদা রিপোর্টের যোগফলের সাথে হাতে মেলে

## ৭. সীমা
Gateway-র refund API, রিফান্ডের সময়/ফি, ও প্ল্যাটফর্ম-মোডে অর্থ-ফেরতের আইনি দায় অযাচাইকৃত। চেক/ব্যাংক-ক্লিয়ারিং, বৈদেশিক মুদ্রা, বহু-ক্যাশ-ড্রয়ার (একাধিক কাউন্টার) এই সংস্করণে নেই।
