# UI/UX Flow & User Journeys

## Complete Route Structure

```
/login                              ← সব রোলের জন্য একটি পেজ
/forgot-password
/reset-password

/super-admin/dashboard
/super-admin/institutions                ← list
/super-admin/institutions/add
/super-admin/institutions/:id            ← detail
/super-admin/plans
/super-admin/billing
/super-admin/settings
/super-admin/reports

/admin/dashboard
/admin/students                     ← list (search, filter by class/batch)
/admin/students/add                 ← enrollment form
/admin/students/:id                 ← profile + actions
/admin/teachers
/admin/teachers/add
/admin/teachers/:id
/admin/academic/programs
/admin/academic/batches
/admin/academic/subjects
/admin/academic/routine
/admin/exams
/admin/exams/add
/admin/exams/:id                    ← detail + mark entry
/admin/exams/:id/marks              ← subject-wise mark entry
/admin/fees/categories
/admin/fees/collect                 ← fee collection form
/admin/fees/dues                    ← due list
/admin/fees/payments                ← payment history
/admin/attendance                   ← date + class selector
/admin/hr/staff
/admin/hr/salary
/admin/notices
/admin/reports

/teacher/dashboard
/teacher/attendance                 ← take attendance
/teacher/marks                      ← mark entry
/teacher/homework                   ← create/manage
/teacher/materials                  ← upload notes/PDF
/teacher/online-class
/teacher/messages

/student/dashboard
/student/routine
/student/attendance
/student/results
/student/homework
/student/materials
/student/fees
/student/notices

/parent/dashboard
/parent/child/:id                   ← child monitoring (multiple children)
/parent/fees
/parent/messages
/parent/notices
/parent/transport

/accountant/dashboard
/accountant/fee-collection
/accountant/dues
/accountant/expenses
/accountant/salary
/accountant/reports
```

## 1. Login Flow
```
User → /login পেজ লোড
     → login (email / phone / student ID) + password
     → POST /api/auth/login
     → TenantMiddleware: request Host থেকে institution খোঁজে (subdomain slug বা active custom domain)
     → Sanctum: token generate করে
     → Response: { token, user, role, institution }
     → Zustand authStore: token ও user সংরক্ষণ
     → Role অনুযায়ী redirect:
         super_admin → /super-admin/dashboard
         admin       → /admin/dashboard
         teacher     → /teacher/dashboard
         student     → /student/dashboard
         parent      → /parent/dashboard
         accountant  → /accountant/dashboard
```

## 2. Student Enrollment Flow (Admin)
```
/admin/students (লিস্ট পেজ)
  → DataTable: ক্লাস/সেকশন ফিল্টার, সার্চ
  → "ভর্তি করুন" বাটন
    → /admin/students/add
      → ব্যক্তিগত তথ্য (নাম, DOB, লিঙ্গ, রক্তের গ্রুপ)
      → অভিভাবকের তথ্য (পিতা, মাতা, ফোন)
      → একাডেমিক (ক্লাস, সেকশন, রোল)
      → ছবি ও ডকুমেন্ট আপলোড (FileUpload component)
      → react-hook-form + zod validation
      → POST /api/students
        → StudentService::create()
          → Student record তৈরি
          → User account তৈরি (password = student_id)
          → Welcome SMS পাঠানো (Queue)
        → Toast: "ভর্তি সফল হয়েছে"
        → /admin/students/:id (profile page) তে redirect
          → প্রোফাইল দেখা, আইডি কার্ড প্রিন্ট বাটন
```

## 3. Taking Attendance (Teacher)
```
/teacher/dashboard
  → "আজকের ক্লাস" রুটিন দেখা
  → "উপস্থিতি নিন" বাটন
    → /teacher/attendance
      → ক্লাস + সেকশন সিলেক্ট
      → তারিখ সিলেক্ট (ডিফল্ট আজ)
      → GET /students?program_id=X&batch_id=Y → ছাত্র লিস্ট লোড
      → "সবাই Present" বাটন (one-click)
      → প্রতিটি ছাত্রের পাশে Present/Absent/Late/Leave বাটন
      → "সাবমিট করুন" বাটন
        → ConfirmModal: "উপস্থিতি সাবমিট করবেন?"
          → POST /api/attendance (bulk)
            → অনুপস্থিতদের অভিভাবককে SMS (Queue)
          → Toast: "উপস্থিতি সংরক্ষণ হয়েছে"
```

## 4. Fee Collection (Accountant)
```
/accountant/dashboard
  → আজকের কালেকশন সারসংক্ষেপ, বকেয়া অ্যালার্ট
  → "ফি নিন" শর্টকাট বাটন
    → /accountant/fee-collection
      → ছাত্রের নাম/ID দিয়ে সার্চ
      → ছাত্র সিলেক্ট করলে:
          → GET /fees/dues?student_id=X → বকেয়া লোড
          → মাস ও ক্যাটাগরি অনুযায়ী বকেয়া দেখানো
          → পরিমাণ + ডিসকাউন্ট (যদি থাকে)
          → পেমেন্ট মেথড: Cash / bKash / Nagad / Card
          → "কালেকশন করুন" বাটন
            → POST /api/fees/collect
              → Receipt number তৈরি
              → SMS পাঠানো অভিভাবককে
              → রসিদ PDF লোড → প্রিন্ট বা ডাউনলোড
```

## 5. Result Publish (Admin)
```
/admin/exams (পরীক্ষা লিস্ট)
  → "নতুন পরীক্ষা" বাটন
    → নাম, ক্লাস, তারিখ → POST /api/exams
  → পরীক্ষায় ক্লিক → /admin/exams/:id
    → বিষয়ভিত্তিক মার্ক এন্ট্রি স্ট্যাটাস দেখা
    → Teacher Panel থেকে মার্ক এন্ট্রি:
        /teacher/marks
          → পরীক্ষা + বিষয় সিলেক্ট
          → প্রতিটি ছাত্রের মার্ক এন্ট্রি ফর্ম
          → POST /api/results/bulk
    → সব বিষয়ের মার্ক এন্ট্রি হলে Admin দেখেন
    → "রেজাল্ট পাবলিশ করুন" বাটন
      → ConfirmModal: "পাবলিশের পর মার্ক সম্পাদনা বন্ধ হবে"
        → POST /api/exams/:id/publish
          → status = 'published', মার্ক LOCK
          → সব অভিভাবককে SMS (Queue)
          → In-App notification
      → Student/Parent এখন রেজাল্ট দেখতে পাবে
```

## 6. Online Fee Payment (Parent)
```
/parent/dashboard
  → বকেয়া ফি অ্যালার্ট কার্ড
  → "পেমেন্ট করুন" বাটন
    → /parent/fees
      → বকেয়া মাস ও পরিমাণের তালিকা
      → পেমেন্ট মেথড সিলেক্ট: bKash / Nagad
      → "পেমেন্ট করুন" বাটন
        → POST /api/v1/fees/payment/{gateway}/create   (dues keys; amount computed server-side; mode institution|platform — docs/modules/online-fee-payment.md)
          → bKash token → paymentID → URL
        → window.location.href = bkash_url
          → bKash পেজে PIN দেওয়া
          → bKash → GET /api/fees/payment/bkash/callback
            → Execute → Verify → DB Save
            → রসিদ তৈরি, SMS পাঠানো
        → /parent/fees?success=1
          → "পেমেন্ট সফল হয়েছে" toast
          → রসিদ ডাউনলোড বাটন
```

## 7. Subscription Renewal (Institution Admin)
```
/admin/settings (subscription tab)
  → বর্তমান প্ল্যান ও মেয়াদ দেখা
  → "প্ল্যান আপগ্রেড" বা "Renew" বাটন
    → প্ল্যান সিলেক্ট পেজ (Basic/Pro/Enterprise)
    → মাসিক/বার্ষিক সিলেক্ট
    → "পেমেন্ট করুন"
      → POST /api/billing/initiate
        → SSLCommerz session → GatewayPageURL
      → SSLCommerz পেজে redirect
        → Card/bKash/Nagad পেমেন্ট
        → Success → /billing/ssl/success
          → Verify → subscription_expires_at আপডেট
          → Invoice ইমেইল পাঠানো
```

## 8. Custom Domain Setup (Revision 6)
```
Institution Admin → Settings → Domain → "Add custom domain"
  → domain টাইপ করে submit (portal.school.edu.bd)        → status: pending_dns
  → স্ক্রিনে DNS নির্দেশনা দেখায় (CNAME → domains.schoolapp.com অথবা A → server IP)
  → Institution নিজের DNS panel-এ record যোগ করে
  → "Verify now" বাটন অথবা auto re-check job                → status: dns_verified
  → Super Admin → Institutions → Domain Requests → Approve   → status: active
  → প্রথম HTTPS request-এ Caddy স্বয়ংক্রিয় SSL certificate ইস্যু করে
  → এখন portal.school.edu.bd দিয়ে অ্যাক্সেস; পুরনো subdomain-ও চালু থাকে
```
সম্পূর্ণ flow, state machine, DNS নির্দেশনা ও troubleshooting: `docs/modules/custom-domain.md`

## Component → Page Mapping
| Component | Used In Pages |
|-----------|-------------|
| DataTable | সব লিস্ট পেজ (students, teachers, fees, results) |
| StatCard | সব dashboard পেজ |
| ConfirmModal | Delete, Publish, TC issue, Logout |
| PrintButton | Marksheet, Receipt, ID Card, Salary Slip |
| FileUpload | Student add, Teacher add, Homework, Materials |
| DateRangePicker | সব Report পেজ |
| Can | Admin-only buttons, Accountant-only tabs |
| Toast | সব সফল/ব্যর্থ action-এর পর |
| StatusBadge | Student list, Fee list, Exam list |
| EmptyState | কোনো ডেটা না থাকলে |
