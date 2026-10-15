# HR — ছুটি ব্যবস্থাপনা (Leave)

> **Revision 10:** এই ফাইলে এখন **শুধু ছুটি**। বেতন, ইনক্রিমেন্ট, বোনাস, অগ্রিম, payroll, payslip, PF, অশিক্ষক কর্মচারী — সব **`docs/modules/staff-payroll.md`**-এ। পুরনো `salary_payments`, `SalaryService::calculateSalary`, `/hr/salary/*` **মুছে ফেলা হয়েছে** (অনুপস্থিতি `user_id` দিয়ে খুঁজত — ভুল — এবং বেতনের ইতিহাস রাখত না)। টেবিলের সংজ্ঞা শুধু `docs/database/schema.sql`-এ (D13); এখানে DDL নকল করা হয় না।

Module key: `hr_payroll` (ছুটি-অংশ শিক্ষক ও কর্মচারীর জন্য; প্ল্যান-নিয়ন্ত্রিত)।

## ছুটির ধরন ও আবেদন
- `leave_types` (প্রতিষ্ঠানের নিজস্ব): নাম, `max_days_per_year`, `is_paid`। উদাহরণ: অসুস্থতা, নৈমিত্তিক, বার্ষিক। `is_paid = false` ছুটি payroll-এ **বিনা-বেতনের দিন (`lwp_days`)** হয় (`staff-payroll.md` §৭.৩)।
- `leave_applications`: আবেদনকারী হয় শিক্ষক (`user_id`) অথবা অশিক্ষক কর্মচারী (`staff_id`) — **ঠিক একটি** (service-এ যাচাই)। `from_date`, `to_date`, `total_days` (সার্ভার গণনা করে, ছুটির দিন/সাপ্তাহিক ছুটি বাদ দিয়ে), `reason`, `status` (`pending|approved|rejected`), `approved_by`।

## নিয়ম
1. **ওভারল্যাপ নিষিদ্ধ:** একই জনের দুটি `approved/pending` ছুটির সময় ছুঁতে পারে না।
2. **বার্ষিক সীমা:** সেই `leave_type`-এর ওই ক্যালেন্ডার বছরের অনুমোদিত দিন + নতুন আবেদন ≤ `max_days_per_year`; বেশি হলে 422 (Admin `override` কারণসহ দিতে পারে, audit-এ)।
3. **অনুমোদন:** Admin। (শিক্ষকের ছুটি অনুমোদনে সংশ্লিষ্ট দিনের period-গুলোর জন্য "বদলি দরকার" তালিকা তৈরি হয় — `docs/modules/academics-advanced.md` §৪.৩।)
4. **প্রভাব:** অনুমোদিত দিনে শিক্ষকের/কর্মচারীর উপস্থিতি `leave` হিসেবে গণ্য (`teacher_attendances`/`staff_attendances` স্বয়ংক্রিয় সারি নয়; সংক্ষিপ্তসারে `AttendanceSummary` ছুটি যোগ করে)। বেতন-কর্তন শুধু `is_paid = false` হলে।
5. **নোটিফিকেশন:** আবেদন → Admin; সিদ্ধান্ত → আবেদনকারী (প্রাপকের ভাষায়)।
6. **বাতিল:** আবেদনকারী `pending` থাকা অবস্থায় বাতিল করতে পারে; `approved` ছুটি বাতিল শুধু Admin (শুরুর আগে), কারণসহ।

## Endpoint
| Method | Endpoint | বর্ণনা |
|---|---|---|
| GET/POST | `/hr/leave-types` | ছুটির ধরন CRUD (Admin) |
| GET | `/hr/leaves` | ছুটির তালিকা (Admin; ফিল্টার: ধরন, স্থিতি, মাস, ব্যক্তি) |
| POST | `/hr/leaves` | ছুটির আবেদন (Admin কারো হয়ে; শিক্ষক নিজের) |
| PATCH | `/hr/leaves/{id}/approve` · `/reject` · `/cancel` | সিদ্ধান্ত |
| GET | `/hr/leaves/balance?type=&id=` | চলতি বছরের অবশিষ্ট |

## পাতা
`/admin/hr/leave` (তালিকা ও অনুমোদন), `/teacher/leave` (নিজের আবেদন ও অবশিষ্ট)।

## পরীক্ষা
`LeaveOverlapTest`, `LeaveBalanceTest` (সীমা, override, ক্যালেন্ডার-বছর সীমানা), `LeavePayrollLinkTest` (unpaid → `lwp_days`, paid → কর্তন নেই), `LeaveActorTest` (`user_id` অথবা `staff_id` ঠিক একটি)।


## D85 — approved R3.4 contract

Owner approved all seven clauses in owner/staff-leave-contract-decision.md (approved text at 3ab01cc), locked by fb56d8c. They govern R3.4 over historical wording above. Leave status includes cancelled. Pending supports approve/reject/cancel; approved cancellation requires admin, reason and a date before from_date. Teacher access to the existing transition endpoint is limited to own pending cancellation; no accountant cancellation or staff role. Identical transitions are idempotent; conflicts 409; keep application rows and audit actors/reasons.

HR dates are inclusive and institution-local. Exclude all tenant holidays and institutions.settings.hr.weekly_holidays (ISO 1..7, default []); malformed configuration fails closed. Require at least one working date; split working dates across years/months. Under institution lock, check approved annual consumption plus candidate at create and approval; pending blocks overlapping ranges but does not reserve annual allowance. Override needs admin reason/audit. Approval audit snapshots accepted dates/is_paid; balances and summaries use snapshots rather than reinterpret later calendar/type changes. total_days is the accepted count. Audit uses IDs/dates/policy evidence under privacy rules, no pay amounts/PII.

AttendanceSummary::forPayee(type,id,month) clamps to joining/leaving dates and counts each working date once: approved leave takes precedence, missing mark is absent, late is present plus late_count. Return working_days, present_days, absent_days, leave_days, lwp_days, late_count. LeavePayrollLinkTest proves unpaid input (both payees/month boundaries), not later payroll execution or payslip deduction. No frozen payroll rewrite, UI, device, future scheduling tables, app/demo DB migration or later task. Existing 18 routes and all required focused/full/reference/parity/query/deep/guard checks remain.
