# SaaS Subscription System

> **⚠ D47 — এই নথির plan-ভিত্তিক মডেল (Tutor/Coaching/Basic/Pro/Enterprise), `max_students`/`max_teachers`/`max_batches` সীমা ও plan-ভিত্তিক বিলিং বাতিল হয়েছে।** সাবস্ক্রিপশন এখন মডিউল-ভিত্তিক, সংখ্যা/স্টোরেজের সীমা নেই। নিচের বর্ণনা **পুরনো, পুনর্লিখনের অপেক্ষায়** (`docs/PRICING-MODEL.md` PM-1)। এই নথি দেখে সীমা বা plan বানাবেন না।


## Plans (Revision 6)
| Plan | institution_type | Price/Month | Students | Teachers | Batches | SMS/Month |
|------|------------------|-------------|----------|----------|---------|-----------|
| Tutor | `private_batch` | BDT ২৯৯ | ১০০ | ১ | ১০ | ২০০ |
| Coaching | `coaching` | BDT ৭৯৯ | ৫০০ | ১০ | ৪০ | ৫০০ |
| Basic | সব type | BDT ৯৯৯ | ৫০০ | ২০ | ∞ | ১০০০ |
| Pro | সব type | BDT ১৯৯৯ | ২০০০ | ৮০ | ∞ | ৫০০০ |
| Enterprise | সব type | BDT ৪৯৯৯ | ∞ | ∞ | ∞ | ∞ |

- Signup ও upgrade পেজে দেখায়: `subscription_plans where institution_type = <tenant type> OR institution_type IS NULL`, `sort_order` অনুযায়ী।
- দাম ও সীমা seed-এর প্রাথমিক মান; Super Admin → Plans থেকে code ছাড়াই বদলানো যায়। Tutor ও Coaching-এর দাম বাজার যাচাই করে চূড়ান্ত করুন।
- বার্ষিক: ২ মাস ফ্রি (মাসিক মূল্য × ১০)।
- অতিরিক্ত SMS: prepaid credit (`institutions.sms_balance`) — `docs/modules/coaching-private-batch.md` "SMS Credits"।
- Trial: ১৪ দিন; trial চলাকালীন tenant type-এর সর্বোচ্চ প্রযোজ্য plan-এর feature (private_batch → Tutor, coaching → Pro, school/college → Pro)।

## Lifecycle
Trial (14d) → Paid → Active → Renewal Reminder (7d আগে) → Expired → Grace (3d) → Suspended → Data Delete (30d)

## Limit Enforcement
```php
// SubscriptionCheck Middleware
if ($institution->subscription_expires_at->isPast()) return 403;
if ($request->routeIs('students.store') && $plan->max_students !== -1 && $activeStudents >= $plan->max_students) return 403;
if ($request->routeIs('batches.store')  && $plan->max_batches  !== -1 && $openBatches    >= $plan->max_batches)  return 403;
// R6: feature/module checks are NOT done here any more — use Route::middleware('module:hostel')
//     (ModuleGate: type ∩ plan ∩ Super Admin override). See docs/modules/institution-types.md
```

## Onboarding (New Institution)
1. সাইনআপ (central host `schoolapp.com/signup`) → প্রতিষ্ঠানের ধরন নির্বাচন → Institution + Admin User তৈরি → `https://{slug}.schoolapp.com/login`-এ redirect
2. Trial শুরু (14 দিন Pro features)
3. Welcome Email + SMS
4. Onboarding Wizard (ক্লাস, শিক্ষক, ফি সেটআপ)
5. Trial শেষে Plan সিলেক্ট + Payment

## Scheduler
```php
// Daily 08:00 — renewal reminder
// Daily midnight — suspend expired institutions
// 1st of month 09:00 — due fee SMS
// Every 5 min  — ReconcileOnlinePayments (docs/modules/online-fee-payment.md)
// Monday 09:00 — settlements:draft (drafts only; approval and payout are manual)
// Daily 02:00  — expire stale 'initiated' online_payments; clear public_site cache keys of changed institutions
```

## Subscription Plan features JSON structure
```json
{
  "hostel": false,
  "transport": true,
  "library": true,
  "hr_payroll": true,
  "online_class": false,
  "white_label": false,
  "custom_domain": false,
  "custom_subdomain": true,
  "priority_support": false,
  "advanced_reports": true,
  "ai_assistant": false,
  "analytics": false,
  "gps": false,
  "cpd": false
}
```

## Institution Registration Auto-Setup
```php
public function register(array $data): array {
    // 1. Create Institution
    $institution = Institution::create([
        ...$data,
        'institution_type' => $data['institution_type'],          // R6: school|college|coaching|private_batch
        'slug'   => $this->uniqueSlug($data['slug'] ?? $data['name']), // not in reserved_slugs, unique
        'status' => 'trial',
        'subscription_expires_at' => now()->addDays(14),
    ]);
    // 2. Create Admin user
    $admin = User::create([
        'institution_id' => $institution->id,
        'role'      => 'admin',
        'password'  => bcrypt($data['password']),
        ...$data,
    ]);
    // 3. R6: type-specific defaults + default theme preset
    // Signup arrives on the central host (no tenant bound), so everything tenant-scoped runs as the new institution:
    \App\Support\Tenancy::as($institution, function () use ($institution, $admin) {
        app(OnboardingService::class)->applyDefaults($institution);      // docs/modules/institution-types.md
        app(ThemeService::class)->applyPreset($institution,
            ThemePreset::where('key', config("institution_types.{$institution->institution_type}.default_preset"))->first(), $admin->id);
    });

    // 4. Welcome notification
    $admin->notify(new WelcomeNotification($institution));
    return compact('institution', 'admin');
}
```

## Upgrade/Downgrade Logic
```
Upgrade (Basic → Pro):
  - তাৎক্ষণিক কার্যকর
  - বাকি দিনের proportional charge
  - নতুন features অবিলম্বে উন্মুক্ত

Downgrade (Pro → Basic):
  - পরের billing cycle থেকে কার্যকর
  - বর্তমান মেয়াদ শেষ হলে downgrade
  - লিমিট অতিক্রম করা ডেটা (extra students) delete হবে না
    কিন্তু নতুন যোগ করা যাবে না
```
