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
