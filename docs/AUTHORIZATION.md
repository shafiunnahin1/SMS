# Authentication System Design

## Login Flow
1. React Login পেজ → POST /api/v1/auth/login (`login` + `password`) — `login` = email / phone / student ID (নিচে "Login Identifier (Revision 6)")
2. TenantMiddleware → institution শনাক্ত
3. Sanctum → Token generate
4. Response: { token, user, role, institution }
5. Zustand authStore → সংরক্ষণ
6. Role অনুযায়ী redirect

## Middleware Chain (Every Request)
1. TenantMiddleware → request Host → TenantResolver → currentInstitution bind → fail: 404
2. auth:sanctum → Bearer token → fail: 401
3. SubscriptionCheck → মেয়াদ ও ফিচার লিমিট → fail: 403
4. RoleMiddleware → role check → fail: 403
5. Controller → Response: 200

## Role → Dashboard Redirect
| Role | Redirect |
|------|----------|
| super_admin | /super-admin/dashboard |
| admin | /admin/dashboard |
| teacher | /teacher/dashboard |
| student | /student/dashboard |
| parent | /parent/dashboard |
| accountant | /accountant/dashboard |

## Token Strategy & Session Lifetime (Revision 7)
Bearer token (Sanctum) `localStorage`-এ। XSS হলে token চুরি যায় — তাই ক্ষতি সীমিত রাখতে **মেয়াদ, idle-timeout, সংখ্যা-সীমা ও জোর-করে-বাতিল** আবশ্যক (আগে মেয়াদ ছিল না: হারানো ফোন বা সাবেক কর্মীর token অনির্দিষ্টকাল বৈধ থাকত)। XSS ঠেকানো আলাদা স্তর: `lint:theme`-এর `dangerouslySetInnerHTML` নিষেধ, ও Caddy-র CSP (`infra/Caddyfile`)।

### মেয়াদ (role অনুযায়ী; সবকটি `.env`-এ বদলানো যায়)
| Role | Absolute (লগইন থেকে সর্বোচ্চ) | Idle (শেষ ব্যবহার থেকে) | কেন |
|---|---|---|---|
| super_admin | ৮ ঘণ্টা | ৩০ মিনিট | সব প্রতিষ্ঠানের ডেটা ও টাকা |
| admin, accountant | ১২ ঘণ্টা | ৬০ মিনিট | টাকা, ব্যক্তিগত তথ্য |
| teacher | ২৪ ঘণ্টা | ২ ঘণ্টা | ছাত্র-তথ্য, নম্বর |
| student | ৭ দিন | ২৪ ঘণ্টা | সীমিত নিজস্ব তথ্য |
| parent | ৩০ দিন | ৭ দিন | মোবাইলে মাঝে মাঝে ব্যবহার; ছোট মেয়াদে বারবার OTP/পাসওয়ার্ড বিরক্তিকর |
এগুলো সংরক্ষণশীল শুরুর মান (বাজার/ব্যবহারকারী-প্রতিক্রিয়ায় বদলাবে)। প্রতি ব্যবহারকারীর সর্বোচ্চ **৫টি** সক্রিয় token (`TOKEN_MAX_PER_USER`); ৬ষ্ঠ লগইনে সবচেয়ে পুরনোটি বাতিল।

```php
// config/auth_policy.php
return [
    'tokens' => [   // minutes: [absolute, idle]
        'super_admin' => [(int) env('TOKEN_ABS_SUPER_ADMIN', 480),   (int) env('TOKEN_IDLE_SUPER_ADMIN', 30)],
        'admin'       => [(int) env('TOKEN_ABS_ADMIN', 720),         (int) env('TOKEN_IDLE_ADMIN', 60)],
        'accountant'  => [(int) env('TOKEN_ABS_ACCOUNTANT', 720),    (int) env('TOKEN_IDLE_ACCOUNTANT', 60)],
        'teacher'     => [(int) env('TOKEN_ABS_TEACHER', 1440),      (int) env('TOKEN_IDLE_TEACHER', 120)],
        'student'     => [(int) env('TOKEN_ABS_STUDENT', 10080),     (int) env('TOKEN_IDLE_STUDENT', 1440)],
        'parent'      => [(int) env('TOKEN_ABS_PARENT', 43200),      (int) env('TOKEN_IDLE_PARENT', 10080)],
    ],
    'max_tokens_per_user' => (int) env('TOKEN_MAX_PER_USER', 5),
];

// app/Services/Auth/TokenService.php
class TokenService
{
    public function issue(User $user, Request $request): string
    {
        [$abs] = config("auth_policy.tokens.{$user->role}");
        $new = $user->createToken('web', ['*'], now()->addMinutes($abs));     // expiresAt: Sanctum >= 3.x/4 (confirm in the installed version)
        $new->accessToken->forceFill(['device' => Str::limit($request->userAgent(), 120, ''), 'ip_hash' => hash('sha256', $request->ip() . config('app.key'))])->save();

        // keep at most N: delete the oldest beyond the limit
        $ids = $user->tokens()->orderByDesc('id')->pluck('id');
        $user->tokens()->whereIn('id', $ids->slice(config('auth_policy.max_tokens_per_user')))->delete();
        return $new->plainTextToken;
    }

    public function revokeAll(User $user, ?int $exceptTokenId = null): void
    {
        $user->tokens()->when($exceptTokenId, fn ($q) => $q->where('id', '!=', $exceptTokenId))->delete();
    }
}

// app/Providers/AppServiceProvider.php::boot()  - IDLE timeout.
// Must live in Sanctum's authentication callback, NOT in a middleware: Sanctum overwrites last_used_at BEFORE middleware runs, so a
// middleware would always see "just now". The callback receives the token before that update.
\Laravel\Sanctum\Sanctum::authenticateAccessTokensUsing(function ($accessToken, bool $isValid) {
    if (!$isValid) return false;
    $user = $accessToken->tokenable;
    if (!$user || !($user->is_active ?? true)) return false;                          // deactivated users are cut off at once
    [, $idle] = config("auth_policy.tokens.{$user->role}") ?? [null, 60];
    return !($accessToken->last_used_at && $accessToken->last_used_at->lt(now()->subMinutes($idle)));
});
```
`personal_access_tokens` (framework table) পায় দুটি অতিরিক্ত কলাম: `device VARCHAR(120) NULL`, `ip_hash CHAR(64) NULL` (migration `add_session_metadata_to_personal_access_tokens`, `docs/database/migrations.md`) — IP কখনো plain সংরক্ষিত নয়।

### কখন সব token বাতিল (`UserObserver::updated`)
`password` বদলালে (নিজের পাসওয়ার্ড বদলে বর্তমান token বাদে), `role` বদলালে, `is_active=false` হলে (কর্মী চলে গেছেন), 2FA বন্ধ/চালু হলে, Admin "Force logout" করলে, ইমেইল/ফোন (লগইন identifier) বদলালে, লকআউট শুরু হলে। Password reset সফল হলে সব token (হারানো ডিভাইসের জন্য)।

### Session API (ব্যবহারকারী নিজের)
```
GET    /auth/sessions                → [{id, device, created_at, last_used_at, is_current}]     (ip নয়)
DELETE /auth/sessions/{id}           → একটি ডিভাইস থেকে লগআউট (নিজের token হলে)
POST   /auth/logout-all              → সব ডিভাইস (বর্তমানটি সহ)
POST   /admin/users/{id}/force-logout  [admin, শুধু নিজের প্রতিষ্ঠানের user]  → সব token বাতিল
POST   /admin/users/{id}/unlock        [admin]                                 → locked_until = NULL
```
React: 401 (`session_expired` / `unauthenticated`) এ আগের মতো `clearAuth` ও `/login`, কিন্তু বার্তা "সেশন শেষ, আবার লগইন করুন" (বার্তা ভিন্ন করা যাবে না যাতে কোন কারণে বাতিল হলো তা বাইরের কেউ বুঝতে না পারে — শুধু ব্যবহারকারীর UI-তে একটি সাধারণ বার্তা)।

### XSS/CSP (token চুরির বিরুদ্ধে অতিরিক্ত স্তর)
Caddy-তে `Content-Security-Policy` (draft, `Caddyfile`): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`। ফন্ট গুগল থেকে নয়, অ্যাপের সাথে bundle (`@fontsource/*`) — নইলে `font-src`/`style-src` খুলতে হয় আর অভিভাবকের IP গুগলে যায়। Public site-এর hero ছবি `https:` থেকে আসে (storage), তাই `img-src https:`। প্রথম deploy-তে `Content-Security-Policy-Report-Only` দিয়ে লঙ্ঘন দেখে তারপর enforce।

> **খোলা বিকল্প (spike-এ মূল্যায়ন):** SPA ও API একই origin, তাই Sanctum-এর *cookie-ভিত্তিক SPA auth* (httpOnly session cookie + CSRF) সম্ভব — XSS-এ token চুরি যায় না। Phase 10-এর মোবাইল অ্যাপ তখনও bearer ব্যবহার করবে। এই plan bearer-এ এগোয় (সরল, বিদ্যমান সব কোড তাই), কিন্তু `docs/spike/walking-skeleton.md` ধাপ ৭-এ দুটির তুলনা মাপা হবে।

## Laravel Code
```php
// TenantMiddleware.php — full code: docs/templates/laravel-core-files.md
// Tenant is resolved ONLY from the request Host via TenantResolver
// (subdomain slug or institution_domains). See docs/modules/custom-domain.md
```

## React Code
```javascript
// api/axios.js
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(null, error => {
  if (error.response?.status === 401) {
    useAuthStore.getState().clearAuth()
    window.location.href = '/login'
  }
  return Promise.reject(error)
})
```

---

## Password Reset Flow
```
১. POST /api/auth/forgot-password { email }
   → DB-তে password_reset_tokens তৈরি (token + expiry 60min)
   → Email পাঠানো (reset link সহ)

২. GET /reset-password?token=xxx&email=yyy
   → React পেজ: নতুন পাসওয়ার্ড ফর্ম

৩. POST /api/auth/reset-password { token, email, password, password_confirmation }
   → Token যাচাই (expired? used?)
   → পাসওয়ার্ড আপডেট
   → Token মুছে ফেলা
   → সফল → Login পেজে redirect
```

## First Login Password Change
```php
// In users table: must_change_password TINYINT(1) DEFAULT 0
// On new student/teacher creation → must_change_password = 1

// Auth Middleware check:
if (auth()->user()->must_change_password) {
    return response()->json(['error'=>'must_change_password'], 403);
}

// React: when 403 + error=must_change_password
// → redirect to /change-password page
// → submit new password → PATCH /api/auth/change-password
// → must_change_password = 0 → dashboard
```

## Role-Based Navigation — Authoritative Menu Data (Revision 7)
এটিই `src/nav/menu.js`-এর **সম্পূর্ণ বিষয়বস্তু**। আলাদা role layout নেই (`AppShell` + layout registry, `docs/THEMING.md`); plan নয়, **module** দিয়ে লুকানো (`ModuleGate`, `docs/modules/institution-types.md`)। `label` = `{term:'batches'}` হলে `useTerms()` থেকে, নইলে বাংলা লেবেল (i18n key)। `primary: true` = `mobile-compact`-এর নিচের বারে (প্রতি role-এ সর্বোচ্চ ৪টি)। আইকন `lucide-react` (emoji নয়)।
```javascript
// src/nav/menu.js  (data only - no JSX, no colours)
const it = (key, path, label, extra = {}) => ({ key, path, label, ...extra })

// (R16) hide what this build has not shipped. `since` = the first release that contains the screen; the build's release comes from GET /bootstrap -> release.id.
// Items that name a `module` are already hidden by ModuleGate (config/release.php); `since` is for screens that sit inside a shipped module or have no module key.
const ORDER = ['R1', 'R1.1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']
export const shipped = (since, current) => !since || ORDER.indexOf(since) <= ORDER.indexOf(current)

export const MENU = {
  admin: [
    it('dashboard', '/admin/dashboard', 'ড্যাশবোর্ড', { icon: 'LayoutDashboard', primary: true }),
    it('students',  '/admin/students',  'ছাত্রছাত্রী', { icon: 'Users', module: 'students', primary: true }),
    it('teachers',  '/admin/teachers',  'শিক্ষক', { icon: 'GraduationCap', roleNeeds: 'teacher' }),
    { key: 'academic', label: 'একাডেমিক', icon: 'Layers', children: [
      it('programs', '/admin/academic/programs', { term: 'programs' }, { hideWhen: s => s.use_programs === false }),
      it('batches',  '/admin/batches',           { term: 'batches' }, { module: 'enrollments', primary: true }),
      it('subjects', '/admin/academic/subjects', 'বিষয়'),
      it('routine',  '/admin/academic/routine',  'রুটিন', { module: 'routine' }),
      it('substitution','/admin/academic/substitutions','বদলি শিক্ষক', { module: 'substitution' }),
      it('calendar', '/admin/academic/calendar', 'একাডেমিক ক্যালেন্ডার', { module: 'academic_calendar' }),
      it('syllabus', '/admin/academic/syllabus', 'সিলেবাস ও পাঠ-পরিকল্পনা', { module: 'syllabus' }),
      it('promotion','/admin/academic/promotion','প্রমোশন ও TC', { module: 'promotion_tc' }),
    ]},
    it('attendance', '/admin/attendance', 'উপস্থিতি', { icon: 'CalendarCheck', module: 'attendance' }),
    it('period-att', '/admin/attendance/periods', 'Period হাজিরা', { icon: 'ListChecks', module: 'period_attendance' }),
    it('exams',      '/admin/exams',      'পরীক্ষা ও ফলাফল', { icon: 'FileText', module: 'exams' }),
    it('question-bank','/admin/question-bank','প্রশ্নব্যাংক', { icon: 'Library', module: 'question_bank' }),
    it('qb-spending','/admin/question-bank/spending','প্রশ্নব্যাংকের খরচ', { icon: 'Wallet', module: 'question_bank' }),
    it('qb-papers','/admin/question-bank/papers','প্রশ্নপত্র', { icon: 'FileText', module: 'question_bank' }),
    it('admit-cards','/admin/exams/admit-cards','প্রবেশপত্র', { icon: 'IdCard', module: 'admit_card' }),
    it('merit-list','/admin/exams/merit-list','মেধা তালিকা', { icon: 'Medal', module: 'merit_list' }),
    it('result-sheets','/admin/exams/result-sheets','ফাইনাল ফলাফল ও Tabulation', { icon: 'Trophy', module: 'result_sheets' }),
    it('student-leave','/admin/leave/students','ছাত্রের ছুটি', { icon: 'CalendarOff', module: 'student_leave' }),
    { key: 'fees', label: 'ফি', icon: 'Wallet', module: 'fees', children: [
      it('collect',     '/admin/fees/collect',     'ফি আদায়', { primary: true }),
      it('dues',        '/admin/fees/dues',        'বকেয়া'),
      it('categories',  '/admin/fees/categories',  'ফি-র খাত'),
      it('waivers',     '/admin/fees/waivers',     'মওকুফ', { since: 'R2' }),
      it('installments','/admin/fees/installments','কিস্তি', { module: 'fee_installment' }),
      it('online',      '/admin/payments',         'অনলাইন পেমেন্ট', { module: 'online_payment' }),
      it('cashbook',   '/admin/fees/cashbook',   'ক্যাশবুক',  { module: 'cashbook' }),
      it('refunds',    '/admin/fees/refunds',    'রিফান্ড', { since: 'R3' }),
    ]},
    it('expenses',   '/admin/expenses',   'আয়-ব্যয়', { icon: 'Receipt', module: 'expenses' }),
    it('inventory',  '/admin/inventory',  'স্টোর / ইনভেন্টরি', { icon: 'Package', module: 'inventory' }),
    it('id-cards',   '/admin/students/id-cards', 'আইডি কার্ড', { icon: 'IdCard', module: 'id_cards' }),
    it('leads',      '/admin/leads',      'ভর্তি-আবেদন', { icon: 'UserPlus', module: 'leads' }),
    it('admission',  '/admin/admission',  'ভর্তি-চক্র (পরীক্ষা/তালিকা/লটারি)', { icon: 'ClipboardList', module: 'admission_cycle' }),
    it('payouts',    '/admin/teacher-payouts', 'শিক্ষক পেমেন্ট', { icon: 'Banknote', module: 'teacher_payouts' }),
    { key: 'hr', label: 'HR ও বেতন', icon: 'Briefcase', module: 'hr_payroll', children: [
      it('hr-staff',      '/admin/hr/staff',             'কর্মচারী'),
      it('hr-components', '/admin/hr/salary-components', 'বেতন-উপাদান'),
      it('hr-revisions',  '/admin/hr/revisions',         'ইনক্রিমেন্ট ও পরিবর্তন'),
      it('hr-increments', '/admin/hr/increments',        'বাৎসরিক ইনক্রিমেন্ট'),
      it('hr-bonus',      '/admin/hr/bonus',             'বোনাস'),
      it('hr-adjustments','/admin/hr/adjustments',       'সমন্বয় (জরিমানা/ওভারটাইম)'),
      it('hr-advances',   '/admin/hr/advances',          'অগ্রিম ও ঋণ'),
      it('hr-payroll',    '/admin/hr/payroll',           'বেতন প্রদান (Payroll)'),
      it('hr-pf',         '/admin/hr/pf',                'ভবিষ্যৎ তহবিল'),
      it('leave',         '/admin/hr/leave',             'ছুটি'),
      it('t-att',         '/admin/hr/attendance',        'শিক্ষক-কর্মচারী উপস্থিতি', { module: 'teacher_attendance' }),
      it('hr-reports',    '/admin/hr/reports',           'বেতন-রিপোর্ট'),
      it('cpd',           '/admin/hr/training',          'শিক্ষক-প্রশিক্ষণ (CPD)', { module: 'cpd' }),
    ]},
    { key: 'accounting', label: 'হিসাব-খাতা', icon: 'Landmark', module: 'accounting', children: [
      it('acc-vouchers', '/admin/accounting/vouchers', 'ভাউচার'),
      it('acc-accounts', '/admin/accounting/accounts', 'অ্যাকাউন্ট-চার্ট'),
      it('acc-budgets',  '/admin/accounting/budgets',  'বাজেট'),
      it('acc-bank',     '/admin/accounting/bank',     'ব্যাংক মিলান'),
      it('acc-reports',  '/admin/accounting/reports',  'হিসাব-রিপোর্ট'),
    ]},
    { key: 'donations', label: 'দান ও অনুদান', icon: 'HandHeart', module: 'donations', children: [
      it('don-donors',    '/admin/donations/donors',    'দাতা'),
      it('don-funds',     '/admin/donations/funds',     'তহবিল'),
      it('don-campaigns', '/admin/donations/campaigns', 'প্রচারণা'),
      it('don-list',      '/admin/donations',           'দান ও রসিদ'),
    ]},
    { key: 'campus', label: 'ক্যাম্পাস', icon: 'Building2', children: [
      it('library', '/admin/library', 'লাইব্রেরি', { module: 'library' }),
      it('transport','/admin/transport','পরিবহন', { module: 'transport' }),
      it('gps','/admin/transport/live','বাস ট্র্যাকিং (লাইভ)', { module: 'gps' }),
      it('devices','/admin/devices','উপস্থিতি-ডিভাইস (RFID/QR)', { module: 'attendance_devices' }),
      it('hostel',  '/admin/hostel',   'হোস্টেল', { module: 'hostel' }),
    ]},
    { key: 'learning', label: 'শিক্ষা-সহায়ক', icon: 'BookOpen', children: [
      it('homework', '/admin/homework', 'হোমওয়ার্ক', { module: 'homework' }),
      it('online-class', '/admin/online-class', 'অনলাইন ক্লাস', { module: 'online_class' }),
      it('quiz', '/admin/quiz', 'অনলাইন পরীক্ষা', { module: 'online_quiz' }),
    ]},
    { key: 'welfare', label: 'শিক্ষার্থী কল্যাণ', icon: 'HeartHandshake', children: [
      it('behavior', '/admin/behavior', 'আচরণ', { module: 'behavior' }), it('health', '/admin/health', 'স্বাস্থ্য', { module: 'health' }),
      it('hifz', '/admin/hifz', 'হিফজ', { module: 'hifz' }),
      it('certificates', '/admin/certificates', 'সনদ', { module: 'certificates' }), it('visitors', '/admin/visitors', 'ভিজিটর', { module: 'visitors' }),
      it('meetings', '/admin/meetings', 'অভিভাবক সভা', { module: 'parent_meeting' }),
      it('scholarships', '/admin/scholarships', 'বৃত্তি', { module: 'scholarships' }), it('events', '/admin/events', 'ইভেন্ট', { module: 'events' }),
      it('alumni', '/admin/alumni', 'প্রাক্তন শিক্ষার্থী', { module: 'alumni' }),
    ]},
    it('notices', '/admin/notices', 'নোটিশ', { icon: 'Megaphone', module: 'notices' }),
    it('sms',     '/admin/sms',     'SMS', { icon: 'MessageSquare', module: 'sms' }),
    it('sms-templates', '/admin/sms/templates', 'SMS টেমপ্লেট', { module: 'sms', since: 'R2' }),
    it('sms-campaigns', '/admin/sms/campaigns', 'SMS ক্যাম্পেইন', { module: 'sms', since: 'R2' }),
    it('emergency', '/admin/sms/emergency', 'জরুরি বার্তা', { icon: 'Siren', module: 'sms', since: 'R2' }),
    it('reports', '/admin/reports', 'রিপোর্ট', { icon: 'BarChart3', module: 'reports' }),
    it('analytics','/admin/analytics','বিশ্লেষণ', { icon: 'LineChart', module: 'analytics' }),
    it('risk','/admin/risk','সহায়তা প্রয়োজন (ছাত্র-সতর্কতা)', { icon: 'LifeBuoy', module: 'risk_alerts' }),
    it('ai','/admin/ai','AI সহকারী', { icon: 'Sparkles', module: 'ai_assistant' }),
    { key: 'settings', label: 'সেটিংস', icon: 'Settings', children: [
      it('general',   '/admin/settings/general',   'সাধারণ'),
      it('branches',  '/admin/settings/branches',  'শাখা/ক্যাম্পাস', { module: 'multi_branch' }),
      it('appearance','/admin/settings/appearance','থিম ও চেহারা', { since: 'R2' }),
      it('website',   '/admin/settings/website',   'ওয়েবসাইট', { module: 'public_site' }),
      it('domain',    '/admin/settings/domain',    'ডোমেইন', { feature: 'custom_subdomain', since: 'R2' }),
      it('payments',  '/admin/settings/payments',  'পেমেন্ট সেটআপ', { module: 'online_payment' }),
      it('sms-sender','/admin/settings/sms',       'SMS Sender ID', { since: 'R2' }),
      it('terms',     '/admin/settings/terminology','শব্দ-কোষ'),
      it('imports',  '/admin/settings/imports',  'ডেটা আমদানি (পুরনো সিস্টেম থেকে)', { module: 'data_migration' }),
      it('exports',  '/admin/settings/exports',  'এক্সপোর্ট / ব্যাকআপ', { since: 'R1.1' }),
      it('support',  '/admin/support',           'সাপোর্ট', { icon: 'LifeBuoy', module: 'support' }),
      it('subscription','/admin/subscription',     'সাবস্ক্রিপশন'),
    ]},
  ],
  teacher: [
    it('dashboard','/teacher/dashboard','ড্যাশবোর্ড',{icon:'LayoutDashboard',primary:true}),
    it('batches','/teacher/batches',{term:'batches'},{icon:'Layers',primary:true}),
    it('attendance','/teacher/attendance','উপস্থিতি',{icon:'CalendarCheck',module:'attendance',primary:true}),
    it('marks','/teacher/marks','নম্বর এন্ট্রি',{icon:'FileText',module:'exams',primary:true}),
    it('question-bank','/teacher/question-bank','প্রশ্নব্যাংক',{icon:'Library',module:'question_bank'}),
    it('qb-papers','/teacher/question-bank/papers','প্রশ্নপত্র',{icon:'FileText',module:'question_bank'}),
    it('homework','/teacher/homework','হোমওয়ার্ক',{icon:'BookOpen',module:'homework'}),
    it('routine','/teacher/routine','রুটিন',{icon:'Clock',module:'routine'}),
    it('materials','/teacher/materials','শিক্ষা-উপকরণ', {icon:'Folder', since: 'R2' }),
    it('messages','/teacher/messages','বার্তা', {icon:'MessageCircle', since: 'R2' }),
    it('notices','/notices','নোটিশ',{icon:'Megaphone',module:'notices'}),
    it('salary','/teacher/salary','আমার বেতন',{icon:'Banknote',module:'hr_payroll'}),
    it('leave','/teacher/leave','ছুটি',{icon:'Plane',module:'hr_payroll'}),
    it('periods','/teacher/periods','আমার period',{icon:'ListChecks',module:'period_attendance'}),
    it('syllabus','/teacher/syllabus','সিলেবাস-অগ্রগতি',{icon:'ListTree',module:'syllabus'}),
    it('hifz','/teacher/hifz','হিফজ',{icon:'BookOpen',module:'hifz'}),
    it('risk','/teacher/risk','সহায়তা প্রয়োজন',{icon:'LifeBuoy',module:'risk_alerts'}),
    it('student-leave','/teacher/leave/students','ছাত্রের ছুটি',{icon:'CalendarOff',module:'student_leave'}),
  ],
  student: [
    it('dashboard','/student/dashboard','ড্যাশবোর্ড',{icon:'LayoutDashboard',primary:true}),
    it('routine','/student/routine','রুটিন',{icon:'Clock',module:'routine',primary:true}),
    it('results','/student/results','ফলাফল',{icon:'FileText',module:'exams',primary:true}),
    it('fees','/student/fees','ফি',{icon:'Wallet',module:'fees',primary:true}),
    it('attendance','/student/attendance','উপস্থিতি',{icon:'CalendarCheck',module:'attendance'}),
    it('homework','/student/homework','হোমওয়ার্ক',{icon:'BookOpen',module:'homework'}),
    it('quiz','/student/quiz','অনলাইন পরীক্ষা',{icon:'ClipboardCheck',module:'online_quiz'}),
    it('materials','/student/materials','শিক্ষা-উপকরণ',{icon:'Folder'}),
    it('library','/student/library','লাইব্রেরি',{icon:'Library',module:'library'}),
    it('notices','/notices','নোটিশ',{icon:'Megaphone',module:'notices'}),
  ],
  parent: [
    it('dashboard','/parent/dashboard','ড্যাশবোর্ড',{icon:'LayoutDashboard',primary:true}),
    it('fees','/parent/fees','ফি ও পেমেন্ট',{icon:'Wallet',module:'fees',primary:true}),
    it('results','/parent/results','ফলাফল',{icon:'FileText',module:'exams',primary:true}),
    it('attendance','/parent/attendance','উপস্থিতি',{icon:'CalendarCheck',module:'attendance',primary:true}),
    it('homework','/parent/homework','হোমওয়ার্ক',{icon:'BookOpen',module:'homework'}),
    it('meetings','/parent/meetings','সভা',{icon:'Users',module:'parent_meeting'}),
    it('leave','/parent/leave','ছুটির আবেদন',{icon:'CalendarOff',module:'student_leave'}),
    it('transport','/parent/transport','পরিবহন',{icon:'Bus',module:'transport'}),
    it('behavior','/parent/child/behavior','আচরণ',{icon:'Smile',module:'behavior'}),
    it('health','/parent/child/health','স্বাস্থ্য',{icon:'HeartPulse',module:'health'}),
    it('messages','/parent/messages','বার্তা', {icon:'MessageCircle', since: 'R2' }),
    it('notices','/notices','নোটিশ',{icon:'Megaphone',module:'notices'}),
  ],
  accountant: [
    it('dashboard','/accountant/dashboard','ড্যাশবোর্ড',{icon:'LayoutDashboard',primary:true}),
    it('collect','/accountant/fees/collect','ফি আদায়',{icon:'Wallet',module:'fees',primary:true}),
    it('dues','/accountant/fees/dues','বকেয়া',{icon:'AlertCircle',module:'fees',primary:true}),
    it('online','/admin/payments','অনলাইন পেমেন্ট',{icon:'CreditCard',module:'online_payment'}),
    it('expenses','/accountant/expenses','আয়-ব্যয়',{icon:'Receipt',module:'expenses'}),
    it('payroll','/accountant/hr/payroll','বেতন প্রদান',{icon:'Banknote',module:'hr_payroll'}),
    it('hr-advances','/accountant/hr/advances','অগ্রিম',{icon:'HandCoins',module:'hr_payroll'}),
    it('hr-adjustments','/accountant/hr/adjustments','সমন্বয়',{icon:'SlidersHorizontal',module:'hr_payroll'}),
    it('hr-revisions','/accountant/hr/revisions','ইনক্রিমেন্ট প্রস্তাব',{icon:'TrendingUp',module:'hr_payroll'}),
    it('cashbook','/accountant/cashbook','ক্যাশবুক',{icon:'BookOpenCheck',module:'cashbook'}),
    it('refunds','/accountant/refunds','রিফান্ড',{icon:'Receipt',module:'fees'}),
    it('inventory','/accountant/inventory','স্টোর',{icon:'Package',module:'inventory'}),
    it('accounting','/accountant/accounting','হিসাব-খাতা',{icon:'Landmark',module:'accounting'}),
    it('donations','/accountant/donations','দান ও অনুদান',{icon:'HandHeart',module:'donations'}),
    it('reports','/accountant/reports','রিপোর্ট',{icon:'BarChart3',module:'reports',primary:true}),
  ],
  content_writer: [
    it('questions','/writer/questions','প্রশ্ন',{icon:'FileText'}),
    it('concepts','/writer/concepts','কনসেপ্ট',{icon:'Sparkles'}),
    it('resources','/writer/resources','স্লাইড, বই ও PDF',{icon:'Folder'}),
  ],
  content_moderator: [
    it('review','/writer/questions','প্রশ্ন যাচাই',{icon:'ClipboardCheck'}),
    it('review-concepts','/writer/concepts','কনসেপ্ট যাচাই',{icon:'Sparkles'}),
    it('review-resources','/writer/resources','স্লাইড, বই ও PDF যাচাই',{icon:'Folder'}),
  ],
  super_admin: [
    it('dashboard','/super-admin/dashboard','ড্যাশবোর্ড',{icon:'LayoutDashboard'}),
    it('institutions','/super-admin/institutions','প্রতিষ্ঠান',{icon:'Building2'}),
    it('plans','/super-admin/plans','প্ল্যান',{icon:'Tags'}),
    it('billing','/super-admin/billing','সাবস্ক্রিপশন বিল',{icon:'Receipt'}),
    it('online','/super-admin/online-payments','অনলাইন ফি পেমেন্ট', {icon:'CreditCard', since: 'R2' }),
    it('payouts','/super-admin/payout-accounts','Payout অ্যাকাউন্ট', {icon:'Landmark', since: 'R2' }),
    it('settlements','/super-admin/settlements','Settlement', {icon:'Handshake', since: 'R2' }),
    it('senders','/super-admin/sms-senders','SMS Sender ID', {icon:'MessageSquare', since: 'R2' }),
    it('domains','/super-admin/domains','কাস্টম ডোমেইন', {icon:'Globe', since: 'R2' }),
    it('presets','/super-admin/theme-presets','থিম প্রিসেট', {icon:'Palette', since: 'R2' }),
    it('support','/super-admin/support','সাপোর্ট টিকিট', {icon:'LifeBuoy', since: 'R1.1' }),
    it('coupons','/super-admin/coupons','কুপন', {icon:'Ticket', since: 'R5' }),
    it('exports','/super-admin/exports','প্রতিষ্ঠান export / backup / import', {icon:'Archive', since: 'R1.1' }),
    it('reports','/super-admin/reports','রিপোর্ট', {icon:'BarChart3', since: 'R5' }),
    it('qb-curriculum','/super-admin/qb/curriculum','প্রশ্নব্যাংক: পাঠ্যক্রম',{icon:'BookOpen'}),
    it('qb-writers','/super-admin/qb/writers','প্রশ্নব্যাংক: লেখক',{icon:'Users'}),
    it('qb-questions','/writer/questions','প্রশ্নব্যাংক: প্রশ্ন',{icon:'FileText'}),
    it('qb-concepts','/writer/concepts','প্রশ্নব্যাংক: কনসেপ্ট',{icon:'Sparkles'}),
    it('qb-resources','/writer/resources','প্রশ্নব্যাংক: স্লাইড, বই ও PDF',{icon:'Folder'}),
    it('qb-pricing','/super-admin/qb/pricing','প্রশ্নব্যাংক: দাম ও নিয়ম',{icon:'Tags'}),
    it('settings','/super-admin/settings','সেটিংস',{icon:'Settings'}),
  ],
}
```
`buildNav()` (`docs/THEMING.md`) এটি পড়ে: `module` → `modules.includes()`, `feature` → `plan.features[...]` (module নয়, কারণ `custom_subdomain` একটি flag), `roleNeeds` → `config.roles` অনুযায়ী (private_batch-এ `teacher` role নেই), `hideWhen(settings)`। কোনো menu item-এর path-এর জন্য page না থাকলে Phase-এর Done When-এ ধরা পড়ে ("প্রতিটি role দিয়ে প্রতিটি menu item খোলে")।

## Password Policy (Revision 7 — role-ভিত্তিক)
আগের নিয়ম ("বড় হাত + সংখ্যা + বিশেষ চিহ্ন" সবার জন্য) ১০ বছরের ছাত্র ও গ্রামের অভিভাবকের জন্য অব্যবহার্য এবং বাস্তবে "Abcd@1234"-এর মতো অনুমেয় পাসওয়ার্ড তৈরি করে। এখন দৈর্ঘ্য-প্রধান, আর যে ভূমিকার ক্ষতি বেশি তার নিয়ম কড়া:
| Role | ন্যূনতম | বাড়তি নিয়ম |
|---|---|---|
| super_admin | ১২ অক্ষর | অক্ষর+সংখ্যা; 2FA **বাধ্যতামূলক** |
| admin, accountant | ১০ অক্ষর | অক্ষর+সংখ্যা; 2FA প্রস্তাবিত (Pro+ `two_factor`) |
| teacher | ৮ অক্ষর | অক্ষর+সংখ্যা |
| student, parent | ৬ অক্ষর | অক্ষর বা সংখ্যা; |
সবার জন্য: ব্যবহারকারীর নাম/ফোন/ইমেইল/`username`/Student ID-এর সমান বা তা ধারণকারী নয়; সাধারণ তালিকার (`123456`, `password`, `qwerty`, ফোন-নম্বরের অংশ …) ~১০০০ প্রবেশ সংবলিত `storage/app/common-passwords.txt`-এ নেই। ঐচ্ছিক `PASSWORD_CHECK_BREACHED=false` (true করলে Laravel-এর `uncompromised()` — বাইরের k-anonymity API ডাকে, তাই default বন্ধ)। বিশেষ-চিহ্ন বাধ্যতামূলক নয়।
```php
// app/Rules/PolicyPassword.php (used by ChangePasswordRequest, ResetPasswordRequest, user-create requests)
public function __construct(private User|string $roleOrUser) {}
public function passes($attr, $value): bool
{
    $role = is_string($this->roleOrUser) ? $this->roleOrUser : $this->roleOrUser->role;
    [$min, $needs] = match ($role) {
        'super_admin' => [12, 'both'], 'admin', 'accountant' => [10, 'both'], 'teacher' => [8, 'both'], default => [6, 'any'],
    };
    if (mb_strlen($value) < $min) return false;
    if ($needs === 'both' && !(preg_match('/\p{L}/u', $value) && preg_match('/\d/', $value))) return false;
    $lower = mb_strtolower($value);
    foreach (array_filter([$user->name ?? null, $user->phone ?? null, $user->email ?? null, $user->username ?? null]) as $bad) {
        if (mb_strlen($bad) >= 4 && str_contains($lower, mb_strtolower($bad))) return false;
    }
    return !in_array($lower, $this->commonPasswords(), true);          // cached file read
}
// Default password = Student ID: allowed ONLY with must_change_password = 1 (forced change on first login, `docs/AUTHORIZATION.md` "First Login Password Change")
```
Student/parent-এর জন্য ছোট পাসওয়ার্ডের ঝুঁকি কমাতে আছে: লকআউট (নিচে), IP-ভিত্তিক rate limit, এবং তাদের ডেটা সীমিত (নিজের/সন্তানের)।

## Login Attempt Lockout (Revision 7)
আগের কোড `User::where('email', …)` ধরত (শুধু ইমেইল, tenant ছাড়া — একই ইমেইল দুই প্রতিষ্ঠানে থাকতে পারে, এবং ফোন/Student ID-তে লগইন চলত না) ও লক হলে ভিন্ন বার্তা দিত (অ্যাকাউন্ট আছে কি না ফাঁস)। এখন: identifier-ভিত্তিক, tenant-সীমিত, একই বার্তা।
```php
// LoginController::login (identifier resolution as in "Login Identifier (Revision 6)")
$user = $this->findUser($request->input('login'));            // User::inTenant() on a tenant host, User::platform() on the central host

$generic = ['error' => 'invalid_credentials', 'message' => 'লগইন তথ্য ভুল, অথবা অ্যাকাউন্ট সাময়িকভাবে বন্ধ। কিছুক্ষণ পরে চেষ্টা করুন।'];

if ($user?->locked_until && now()->lt($user->locked_until)) return response()->json($generic, 401);   // same answer as a wrong password

if (!$user || !Hash::check($request->input('password'), $user->password) || !$user->is_active) {
    Hash::check($request->input('password'), $this->dummyHash);     // constant-time-ish: same work whether or not the user exists
    if ($user) {
        $user->increment('failed_login_attempts');
        if ($user->failed_login_attempts >= 5) {                    // 5 wrong -> 30 minutes
            $user->update(['locked_until' => now()->addMinutes(30)]);
            app(TokenService::class)->revokeAll($user);
            AuditLog::record('auth.locked', $user);
        }
    }
    return response()->json($generic, 401);
}

$user->update(['failed_login_attempts' => 0, 'locked_until' => null, 'last_login_at' => now()]);
// 2FA / must_change_password branches as in the sections above, then:
return response()->json(['token' => app(TokenService::class)->issue($user, $request), 'user' => new UserResource($user)]);
```
- সঙ্গে IP+identifier throttle `throttle:login` (৫/মিনিট) — লকআউটের আগেই বাইরে থেকে ধীর করে।
- **লকআউট দিয়ে অন্যকে আটকে দেওয়ার (DoS) ঝুঁকি আছে:** আক্রমণকারী ৫ বার ভুল দিয়ে যে কারও অ্যাকাউন্ট ৩০ মিনিট বন্ধ করতে পারে। সীমিত করা: ৩০ মিনিট (বেশি নয়), IP throttle, Admin-এর `unlock`, এবং 2FA/Password reset (OTP) তখনও খোলা।
- লগইন ব্যর্থতার সংখ্যা/lock `audit_logs`-এ (`auth.failed` ব্যাচ আকারে নয়, শুধু `auth.locked`); ব্যর্থ পাসওয়ার্ড কখনো log-এ নয়।

## Two-Factor Authentication (Optional — Phase 3+)
```php
// SMS OTP via SSL Wireless
// In users table: two_factor_enabled TINYINT(1) DEFAULT 0

// If 2FA is enabled after login:
// 1. Generate OTP → send SMS
// 2. Redirect to /verify-otp page
// 3. Verify OTP → issue token

// otp_tokens table:
// user_id, otp, expires_at (5 min), used_at
```

---

## Login Identifier (Revision 6)
বাংলাদেশে অনেক অভিভাবক, কোচিং শিক্ষার্থী ও প্রাইভেট শিক্ষকের ইমেইল নেই। তাই `users.email` আর বাধ্যতামূলক বা globally unique নয়; identifier প্রতিষ্ঠানের ভেতরে unique (`schema.sql` → `users`)।

| Role | Logs in with | Stored in |
|---|---|---|
| super_admin | email (শুধু `SUPER_ADMIN_DOMAIN`-এ) | `users.email` |
| admin, teacher, accountant | phone বা email | `users.phone` / `users.email` |
| parent | phone | `users.phone` |
| student | student ID | `users.username` (= `students.student_id`); `users.phone` NULL |

```php
// LoginController — resolve the user inside the CURRENT tenant only
$login = trim($request->input('login'));
$field = str_contains($login, '@') ? 'email'
       : (preg_match('/^(\+?88)?01[3-9]\d{8}$/', $login) ? 'phone' : 'username');
if ($field === 'phone') $login = substr(preg_replace('/\D/', '', $login), -11);   // normalise to 01XXXXXXXXX

// Tenant host -> User::inTenant() (fail-closed, current institution only); central host -> User::platform() (Super Admin only)
$query = app()->bound('currentInstitution') ? User::inTenant() : User::platform();
$user  = $query->where($field, $login)->first();
// then: is_active check, lockout check, Hash::check, 2FA — unchanged (sections above)
```
- Phone সবসময় `01XXXXXXXXX` (১১ digit) আকারে সংরক্ষণ — `User` model-এর mutator-এ normalise করুন; SMS পাঠানোর সময় `88` যোগ হয়।
- Validation: user তৈরিতে `email` বা `phone` বা `username` — অন্তত একটি থাকতেই হবে; প্রতিটি `Rule::unique('users')->where('institution_id', …)`।
- Password reset: ইমেইল থাকলে ইমেইল লিংক; না থাকলে phone-এ OTP (`otp_tokens`, বিদ্যমান 2FA OTP mechanism)। Student-এর password Admin/Teacher reset করে দেয় (default = student ID, `must_change_password = 1`)।
- Central host-এ (`currentInstitution` bind নেই) শুধু `institution_id IS NULL` user অর্থাৎ super_admin মেলে; tenant host-এ super_admin কখনো মেলে না।


---

## UserObserver — what revokes tokens (Revision 7)
```php
class UserObserver
{
    public function updated(User $u): void
    {
        $revoke = $u->wasChanged(['password', 'role', 'is_active', 'two_factor_enabled', 'email', 'phone', 'username']) || ($u->wasChanged('locked_until') && $u->locked_until);
        if (!$revoke) return;
        // a user changing their OWN password keeps the token they are using
        $keep = ($u->wasChanged('password') && auth()->id() === $u->id) ? optional($u->currentAccessToken())->id : null;
        app(\App\Services\Auth\TokenService::class)->revokeAll($u, $keep);
        \App\Models\AuditLog::record('auth.tokens_revoked', $u, ['changed' => array_keys($u->getChanges())]);
    }
    public function deleted(User $u): void { app(\App\Services\Auth\TokenService::class)->revokeAll($u); }
}
```
Register in `AppServiceProvider::boot()`: `User::observe(UserObserver::class)`. Note: user-list endpoints must use `User::inTenant()` (fail-closed) - never `User::all()`.
