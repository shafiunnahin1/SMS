# Folder & File Structure

> **Revision 7 — রিপো-রুট:** `LMS/` এর ভিতরে `docs/`, `themes/`, `infra/`, `.cursor/rules/` (স্পেক ও কনফিগ) এবং পাশাপাশি `api/` (Laravel) ও `frontend/` (React)। নিচের ট্রি `api/` ও `frontend/`-এর ভিতরের গঠন। রুট-গঠনের পূর্ণ চিত্র: `README.md`, `docs/ARCHITECTURE.md` §২। `infra/check-theme-rules.mjs` → `frontend/scripts/`, `infra/Caddyfile`/`nginx.conf` সার্ভারে (deployment), `infra/github-actions-cicd.yml` → `.github/workflows/`।

## Laravel Backend (edu-saas-api/)
```
edu-saas-api/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── SuperAdmin/
│   │   │   │   ├── InstitutionController.php
│   │   │   │   ├── PlanController.php
│   │   │   │   ├── PaymentController.php
│   │   │   │   └── ReportController.php
│   │   │   ├── Admin/
│   │   │   │   ├── StudentController.php
│   │   │   │   ├── TeacherController.php
│   │   │   │   ├── ProgramController.php
│   │   │   │   ├── SubjectController.php
│   │   │   │   ├── ExamController.php
│   │   │   │   ├── ResultController.php
│   │   │   │   ├── FeeController.php
│   │   │   │   ├── AttendanceController.php
│   │   │   │   ├── NoticeController.php
│   │   │   │   └── DashboardController.php
│   │   │   ├── Teacher/
│   │   │   │   ├── AttendanceController.php
│   │   │   │   ├── MarkController.php
│   │   │   │   └── HomeworkController.php
│   │   │   └── Auth/
│   │   │       ├── LoginController.php
│   │   │       └── PasswordResetController.php
│   │   ├── Middleware/
│   │   │   ├── TenantMiddleware.php      ← institution_id inject
│   │   │   ├── RoleMiddleware.php         ← role check
│   │   │   └── SubscriptionCheck.php     ← মেয়াদ ও লিমিট চেক
│   │   ├── Requests/
│   │   │   ├── StoreStudentRequest.php
│   │   │   ├── StoreFeeRequest.php
│   │   │   └── BulkAttendanceRequest.php
│   │   └── Resources/
│   │       ├── StudentResource.php
│   │       ├── ResultResource.php
│   │       └── FeeResource.php
│   ├── Models/
│   │   ├── Institution.php
│   │   ├── User.php
│   │   ├── Student.php
│   │   ├── Teacher.php
│   │   ├── Program.php
│   │   ├── Batch.php
│   │   ├── Subject.php
│   │   ├── Exam.php
│   │   ├── Result.php
│   │   ├── Attendance.php
│   │   ├── FeePayment.php
│   │   ├── FeeCategory.php
│   │   ├── Notice.php
│   │   └── Subscription.php
│   ├── Services/
│   │   ├── TenantService.php
│   │   ├── StudentService.php
│   │   ├── ResultService.php
│   │   ├── FeeService.php
│   │   ├── SmsService.php
│   │   ├── PdfService.php
│   │   └── NotificationService.php
│   ├── Jobs/
│   │   └── SendSmsJob.php
│   ├── Notifications/
│   │   ├── AbsentAlert.php
│   │   ├── ResultPublished.php
│   │   └── RenewalReminder.php
│   └── Traits/
│       └── BelongsToInstitution.php
├── database/
│   ├── migrations/
│   └── seeders/
│       ├── DatabaseSeeder.php
│       ├── SuperAdminSeeder.php
│       ├── DemoInstitutionSeeder.php
│       └── PlanSeeder.php
├── routes/
│   └── api.php
├── resources/views/pdf/
│   ├── marksheet.blade.php
│   ├── receipt.blade.php
│   ├── id-card.blade.php
│   └── salary-slip.blade.php
└── .env
```

## React Frontend (edu-saas-frontend/)
```
edu-saas-frontend/
├── src/
│   ├── api/
│   │   ├── axios.js           ← base URL, interceptor, token
│   │   ├── authApi.js
│   │   ├── studentApi.js
│   │   ├── attendanceApi.js
│   │   ├── examApi.js
│   │   ├── feeApi.js
│   │   ├── noticeApi.js
│   │   └── reportApi.js
│   ├── components/common/
│   │   ├── DataTable.jsx
│   │   ├── StatCard.jsx
│   │   ├── ConfirmModal.jsx
│   │   ├── FileUpload.jsx
│   │   ├── PrintButton.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── DateRangePicker.jsx
│   │   ├── Loader.jsx
│   │   ├── EmptyState.jsx
│   │   ├── PageHeader.jsx
│   │   ├── Toast.jsx
│   │   └── Can.jsx
│   ├── layouts/                  ← AppShell + registry + 4 layouts + PublicLayout + AuthLayout (see "Folder Structure Additions")
│   ├── pages/
│   │   ├── auth/Login.jsx
│   │   ├── super-admin/{Dashboard,Institutions,Plans,Billing}.jsx
│   │   ├── admin/{Dashboard,students/,academic/,exam/,fees/,Attendance,Notices}.jsx
│   │   ├── teacher/{Dashboard,Attendance,MarkEntry,Homework}.jsx
│   │   ├── student/{Dashboard,Results,Fees,Routine}.jsx
│   │   ├── parent/{Dashboard,ChildMonitor,Fees}.jsx
│   │   └── accountant/{Dashboard,FeeCollection,Reports}.jsx
│   ├── store/
│   │   ├── authStore.js       ← token, user, role
│   │   ├── institutionStore.js     ← current institution info
│   │   └── uiStore.js         ← sidebar, modal, toast
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useTenant.js
│   │   ├── usePrint.js
│   │   └── usePermission.js
│   ├── router/
│   │   ├── index.jsx
│   │   └── ProtectedRoute.jsx
│   └── utils/
│       ├── formatDate.js
│       ├── formatCurrency.js
│       └── constants.js
└── .env
```

---

## Updated Laravel Folder Structure (Revision 5)

```
app/
├── Services/
│   ├── TenantService.php
│   ├── StudentService.php        ← ID generation, enrollment, parent link
│   ├── AttendanceService.php     ← Bulk save, absent SMS, monthly report
│   ├── ResultService.php         ← Grade calculation, GPA, class position
│   ├── FeeService.php            ← Collection, due list, receipt, waiver, late fee
│   ├── PdfService.php            ← Marksheet, receipt, ID card, TC, report card
│   ├── SmsService.php            ← SSL Wireless integration
│   ├── WhatsAppService.php       ← WATI.io WhatsApp API
│   ├── NotificationService.php   ← SMS + Push + In-App unified
│   ├── BkashService.php          ← bKash Merchant API
│   ├── NagadService.php          ← Nagad API
│   ├── ZoomService.php           ← Zoom API auto-create meeting
│   ├── SalaryService.php         ← Salary calculation, payslip
│   ├── LibraryService.php        ← Book issue, return, fine
│   ├── HostelService.php         ← Room allocation, checkout
│   ├── TransportService.php      ← Route, stop, student assignment
│   ├── CertificateService.php    ← Generate certificate PDF
│   ├── QrCodeService.php         ← Student QR code generation
│   ├── OnlineExamService.php     ← Quiz create, grade, leaderboard
│   ├── ImportService.php         ← Excel student/mark import
│   └── ReportCardService.php     ← Progress report generation

├── Http/
│   ├── Middleware/
│   │   ├── TenantMiddleware.php       ← Domain → institution_id
│   │   ├── RoleMiddleware.php         ← Role check
│   │   ├── SubscriptionCheck.php      ← Expiry, limit, feature flag
│   │   └── AcademicYearMiddleware.php ← Current year inject

├── Jobs/
│   ├── SendSmsJob.php            ← Background SMS (3 retries)
│   ├── SendPushJob.php           ← FCM push notification
│   ├── SendWhatsAppJob.php       ← WhatsApp message
│   ├── SendBulkReminderJob.php   ← Bulk fee reminder
│   ├── GeneratePdfJob.php        ← Heavy PDF (background)
│   ├── MarkImportComplete.php    ← After Excel import Queue
│   └── SendMarksheetEmailJob.php ← Report card email delivery

├── Imports/
│   ├── StudentImport.php         ← Excel student bulk import
│   └── MarkImport.php            ← Excel mark bulk upload

├── Exports/
│   ├── StudentImportTemplate.php ← Download template
│   ├── StudentExport.php
│   ├── FeeCollectionExport.php
│   ├── AttendanceExport.php
│   ├── ResultExport.php
│   └── SalaryExport.php

├── Notifications/
│   ├── AbsentAlert.php
│   ├── FeePaid.php
│   ├── ResultPublished.php
│   ├── RenewalReminder.php
│   ├── WelcomeInstitution.php
│   └── GeneralNotification.php

└── Observers/
    ├── StudentObserver.php       ← Cache invalidation
    ├── FeePaymentObserver.php    ← Dashboard cache clear
    └── ExamObserver.php          ← Result cache clear
```

## Updated React Folder Structure (Revision 5)

```
src/
├── pages/
│   ├── auth/
│   │   ├── Login.jsx             ← Full code (with 2FA support)
│   │   ├── ForgotPassword.jsx
│   │   ├── ResetPassword.jsx
│   │   └── ChangePassword.jsx
│   ├── admin/
│   │   ├── Dashboard.jsx         ← Full code
│   │   ├── students/
│   │   │   ├── StudentList.jsx   ← Full code
│   │   │   ├── StudentAdd.jsx
│   │   │   ├── StudentProfile.jsx
│   │   │   ├── StudentImport.jsx ← Excel import (full code)
│   │   │   ├── BulkIdCards.jsx
│   │   │   └── StudentQR.jsx
│   │   ├── fees/
│   │   │   ├── FeeCollect.jsx    ← Full code (accountant too)
│   │   │   ├── DueList.jsx
│   │   │   ├── WaiverList.jsx
│   │   │   └── Installments.jsx
│   │   └── ...
│   ├── teacher/
│   │   ├── Attendance.jsx        ← Full code
│   │   ├── MarkEntry.jsx
│   │   ├── Homework.jsx
│   │   └── Submissions.jsx
│   └── ...
├── components/
│   ├── common/
│   │   ├── DataTable.jsx         ← Full code
│   │   ├── StatCard.jsx
│   │   ├── NotificationBell.jsx  ← Full code (30s polling)
│   │   ├── ConfirmModal.jsx
│   │   ├── FileUpload.jsx
│   │   ├── DateRangePicker.jsx
│   │   ├── PrintButton.jsx
│   │   ├── ExportButton.jsx
│   │   ├── Toast.jsx
│   │   ├── EmptyState.jsx
│   │   ├── Loader.jsx
│   │   ├── Can.jsx
│   │   ├── StatusBadge.jsx
│   │   └── PageHeader.jsx
│   └── charts/
│       ├── BarChart.jsx
│       ├── LineChart.jsx
│       └── DonutChart.jsx
├── hooks/
│   ├── usePrint.js               ← Full code (download + preview)
│   ├── useAuth.js
│   ├── useTenant.js
│   └── usePermission.js
└── utils/
    ├── formatDate.js
    ├── formatCurrency.js
    └── constants.js
```

---

## Folder Structure Additions (Revision 6)

### Laravel
```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Public/            BootstrapController, SignupController, ManifestController
│   │   ├── Internal/          TlsCheckController
│   │   ├── Admin/             BatchController, EnrollmentController, LeadController,
│   │   │                      TeacherPayoutController, DomainController, ThemeController,
│   │   │                      TerminologyController, SmsCreditController
│   │   └── SuperAdmin/        ThemePresetController, DomainApprovalController
│   └── Middleware/            ModuleMiddleware, FeatureMiddleware   (+ existing four)
├── Models/                    Program, Batch, Enrollment, BatchTeacher, TeacherPayout, AdmissionLead,
│                              SmsCreditTransaction, ThemePreset, InstitutionDomain
├── Services/
│   ├── ModuleGate.php  EnrollmentService.php  OnboardingService.php  TeacherPayoutService.php
│   └── Tenancy/               TenantResolver.php  DomainService.php
├── Jobs/                      VerifyPendingDomains, RecheckActiveDomains, WarmDomainCertificate
├── Rules/                     ThemeTokensRule.php
└── Support/                   Terms.php (term() helper — autoload via composer "files")
config/
├── institution_types.php
└── tenancy.php
```
`ClassRoom`/`Section` model, `ClassController`/`SectionController` আর নেই — `Program`/`Batch`, `ProgramController`/`BatchController`।

### React
```
src/
├── theme/                     ThemeProvider.jsx, tokens.css, fonts.js
├── layouts/                   AppShell.jsx, registry.js, SidebarClassicLayout.jsx, SidebarMiniLayout.jsx,
│   │                          TopNavLayout.jsx, MobileCompactLayout.jsx
│   └── parts/                 BrandLogo, NavItem, UserMenu, PlanBanner, PoweredBy
├── nav/                       menu.js
├── hooks/                     useTerms.js, useModules.js   (useTheme.js removed)
├── pages/
│   ├── public/                Landing.jsx, Signup.jsx                (central host only)
│   ├── auth/login-templates/  CenteredLogin.jsx, SplitLogin.jsx, CoverLogin.jsx
│   ├── admin/batches/         BatchList.jsx, BatchDetail.jsx
│   ├── admin/leads/           LeadList.jsx
│   ├── admin/payouts/         TeacherPayouts.jsx
│   ├── admin/settings/        Appearance.jsx, Domain.jsx, Terminology.jsx
│   └── super-admin/           ThemePresets.jsx, Domains.jsx
└── components/theme/          ThemeEditor.jsx, ThemePreview.jsx
```
আগের `layouts/AdminLayout.jsx`, `TeacherLayout.jsx` ইত্যাদি ৬টি role layout বানাবেন না।

---

## Folder Structure Additions (Revision 8 — UI Packs)
```
frontend/src/
├── features/<area>/use<Thing>.js          ← hook: ডেটা, actions, validation (সব pack-এ এক)
├── features/<area>/views/<Thing>View.jsx  ← default view
├── ui/
│   ├── UIProvider.jsx  useUI.js  PageSlot.jsx  packs.js
│   ├── variants/   Tabs.jsx  Modal.jsx  StatCard.jsx  List.jsx
│   └── packs/      classic/manifest.js · fresh/{manifest.js,views/} · mobile/{manifest.js,views/}
api/config/ui_packs.php                    ← pack → সঙ্গত layouts
```
`pages/*` এখন পাতলা: hook ডেকে `<PageSlot name="…" {...hook} />`। `layouts/AdminLayout`-ধরনের ফাইল এখনো নেই (AppShell)। বিস্তারিত: `docs/UI-PACKS.md` §৪।

## Folder Structure Additions (Revision 9 — Languages & RTL)
```
frontend/src/
├── i18n/            index.js  locales.js  format.js  bn.json  en.json  ar.json
├── ui/I18nProvider.jsx
├── components/      DirIcon.jsx  LanguageSwitcher.jsx  bidi/{PlainText,Ltr}.jsx
api/
├── config/          i18n.php  terminology_presets.php        (+ 'ar' in institution_types.php terms)
├── lang/            {bn,en,ar}/{messages,validation,errors,export,sms,pdf}.php
├── app/Http/Middleware/SetLocale.php
└── app/Support/SmsSegments.php
```
বিস্তারিত: `docs/I18N.md`।

## Folder Structure Additions (Revision 6.2)
```
app/
├── Http/Controllers/
│   ├── Admin/       PaymentSettingsController, OnlinePaymentController, SmsSenderController, WebsiteSettingsController
│   ├── Parent/      FeePaymentController, FeePaymentCallbackController
│   ├── Public/      PublicSiteController, PublicAdmissionController, PublicShellController
│   └── SuperAdmin/  SettlementController, PayoutAccountController, SmsSenderApprovalController, OnlinePaymentReportController
├── Models/          InstitutionPaymentGateway, InstitutionPayoutAccount, OnlinePayment, Settlement
├── Services/Payments/   GatewayRegistry, PaymentRouter, OnlinePaymentService, SettlementService, GatewayInterface
│   └── Gateways/        BkashGateway, SslCommerzGateway, FakeQrGateway (dev/test only)   ← BanglaQrGateway is added here later
├── Jobs/            ReconcileOnlinePayments, SendOnlinePaymentReceipt, SendSmsJob (institutionId aware)
├── Console/Commands/  DraftSettlements (settlements:draft), ReencryptPaymentSecrets (payments:reencrypt)
└── Http/Requests/   PublicAdmissionRequest
config/payments.php
routes/public.php
```
```
src/pages/
├── public/        PublicHome, PublicNotices, PublicAdmission   (layout: layouts/PublicLayout.jsx)
├── parent/        FeePayment.jsx (replaces the old single-gateway example)
├── components/payments/  PaymentFlow.jsx, QrPaymentPanel.jsx   (flow-driven renderers)
├── admin/settings/ PaymentSettings.jsx, SmsSender.jsx, WebsiteSettings.jsx
├── admin/payments/ OnlinePayments.jsx, Settlements.jsx
└── super-admin/   Settlements.jsx, PayoutAccounts.jsx, SmsSenders.jsx
```
