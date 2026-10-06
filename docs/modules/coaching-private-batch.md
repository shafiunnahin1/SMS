# Coaching Center & Private Batch Features (Revision 6)

## Overview
coaching ও private_batch type-এর জন্য বাড়তি feature। ভিত্তি (Program/Batch/Enrollment, fee resolution, attendance) আছে `docs/modules/academic-structure.md`-এ — এখানে শুধু এই দুই type-এর নিজস্ব অংশ।

| Module key | coaching | private_batch | What |
|---|---|---|---|
| `leads` | ✅ | — | ভর্তি-ইচ্ছুকদের তালিকা ও follow-up |
| `teacher_payouts` | ✅ | — | ক্লাসপ্রতি / শতাংশভিত্তিক শিক্ষক পেমেন্ট |
| `merit_list` | ✅ | — (exam result list-ই যথেষ্ট) | পরীক্ষার rank list ও SMS |
| Lite Dashboard | — | ✅ | এক স্ক্রিনে আজকের সব কাজ |

Tables: `batch_teachers`, `teacher_payouts`, `admission_leads`, `sms_credit_transactions` (`docs/database/schema.sql`, Revision 6 section)।

---

## Multi-Batch Enrollment UX
- Student profile-এ "Batches" tab: active enrollment-এর list, প্রতিটির মাসিক ফি (resolved amount), "Add to batch" ও "Remove" (= `end` with `dropped`)।
- ভর্তি form-এ একসাথে একাধিক batch নির্বাচন করা যায়; প্রতিটির জন্য আলাদা `fee_override` input (ঐচ্ছিক)।
- Fee collection স্ক্রিনে student খুললে enrollment অনুযায়ী due আলাদা সারিতে; একসাথে একাধিক সারি পরিশোধ করলে **একটি receipt**, ভেতরে প্রতিটি সারি আলাদা line (`fee_payments`-এ প্রতি line এক row, একই `receipt_no`)।

## Leads (Admission Inquiry)
```
GET    /leads?status=&follow_up_date=       [admin, accountant]
POST   /leads | PUT /leads/{id} | DELETE /leads/{id}
POST   /leads/{id}/convert                  → { batch_ids: [], ...student fields } → creates Student + Enrollments
```
- Status flow: `new → contacted → visited → enrolled | lost`। `convert` সফল হলে `status = enrolled`, `converted_student_id` সেট।
- Dashboard card: "আজকের follow-up" (`follow_up_date = today` এবং status `new`/`contacted`/`visited`)।
- Bulk SMS: নির্বাচিত lead-দের কাছে (নতুন batch শুরুর ঘোষণা) — `NotificationService::sendBulkSms()`।

## Teacher Payouts
`batch_teachers.pay_type` অনুযায়ী মাস শেষে হিসাব:

| pay_type | Formula |
|---|---|
| `salary` | Payout তৈরি হয় না — `hr_payroll` module-এর মাসিক বেতন |
| `fixed_monthly` | `pay_rate` |
| `per_class` | `classes_taken × pay_rate`; `classes_taken` = ওই মাসে ওই batch-এ যে ভিন্ন ভিন্ন `date`-এ attendance নেওয়া হয়েছে তার সংখ্যা |
| `percentage` | `collection_base × pay_rate / 100`; `collection_base` = ওই মাসের জন্য ওই batch-এর `fee_payments.paid_amount`-এর যোগফল (tuition category) |

```
GET    /teacher-payouts?month=2026-10        [admin, accountant]
POST   /teacher-payouts/generate             → { month } → draft rows for every batch_teachers (idempotent: unique teacher+batch+month)
PUT    /teacher-payouts/{id}                 → amount/note (only while draft)
POST   /teacher-payouts/{id}/approve | /pay  → on pay: creates an `expenses` row (category "Teacher Payout")
```
`generate` আবার চালালে শুধু `draft` row পুনর্গণনা হয়; `approved`/`paid` row বদলায় না।

## Merit List
- `GET /exams/{id}/merit-list?batch_id=` → rank, student, total, percentage; tie হলে একই rank।
- PDF export + "ফলাফল SMS পাঠান" (প্রতি guardian-কে: নাম, নম্বর, rank)।

---

## Private Batch — Lite Mode
একজন শিক্ষক মোবাইল থেকে পুরো ব্যবসা চালান। Default layout `mobile-compact` (bottom tab bar), মেনু মাত্র ৫টি:

| Tab | Page | Content |
|---|---|---|
| Home | `/admin/dashboard` | আজকের batch (schedule অনুযায়ী) → এক ট্যাপে attendance; এই মাসের collection ও বকেয়া; বকেয়া student list (কল/SMS বাটন) |
| Batches | `/admin/batches` | Batch card: সময়, student সংখ্যা, মাসিক ফি |
| Students | `/admin/students` | Search + batch filter; দ্রুত ভর্তি form (নাম, guardian phone, batch, ফি) |
| Fees | `/admin/fees` | মাস নির্বাচন → paid/unpaid list → এক ট্যাপে "Paid" (cash) + SMS receipt |
| More | `/admin/more` | Exam, SMS, Expense, Report, Settings, Subscription |

নিয়ম:
- এগুলো **নতুন page নয়** — coaching/school-এর একই page ও একই API; পার্থক্য শুধু layout, মেনু ও লুকানো field (Program, Section, Academic Year, Roll)।
- দ্রুত ভর্তি form-এ বাধ্যতামূলক field মাত্র তিনটি: নাম, `guardian_phone`, batch। `student_id` স্বয়ংক্রিয় তৈরি হয়।
- Student/Parent portal default বন্ধ; চালু করলে student `username` = `student_id` দিয়ে login করে।
- Fee reminder: "সব বকেয়াকে SMS" এক বাটন; SMS quota/credit শেষ হলে credit কেনার prompt।

## SMS Credits
কোচিং ও ব্যাচে SMS-ই মূল খরচ, তাই plan quota-র পাশাপাশি prepaid credit।
- পাঠানোর সিদ্ধান্ত (`SmsService::canSend()`): চলতি মাসে `sms_logs` count `< plan.max_sms` হলে quota থেকে; নয়তো `institutions.sms_balance > 0` হলে balance থেকে ১ কমে (`sms_credit_transactions` type `usage`); দুটোই শেষ হলে `402 { error: "sms_quota_exceeded" }`।
- কেনা: `POST /subscription/sms-credits { quantity }` → SSLCommerz/bKash (`docs/modules/payment-gateways.md`-এর subscription flow) → সফল হলে `sms_balance += quantity`, ledger type `purchase`।
- Super Admin: `POST /super/institutions/{id}/sms-credits { quantity, note }` (type `adjustment`)।
- দাম: `SMS_CREDIT_PRICE_BDT` × quantity; প্যাক: ৫০০ / ১০০০ / ৫০০০।

## Notes / Edge Cases
- **private_batch → coaching upgrade:** Super Admin type বদলালে data একই থাকে; `teacher`/`accountant` role চালু হয়, Program দৃশ্যমান হয়।
- **একই guardian phone-এ একাধিক student** (ভাইবোন): অনুমোদিত — `students.guardian_phone` unique নয়; Parent user একটিই, `parent_student`-এ দুজনই যুক্ত।
- **Batch শেষ হলে:** `status = completed` করলে সব active enrollment `completed` হয় (`EnrollmentService::end`), আর due তৈরি হয় না।
