# System Design Patterns

## Multi-Language Support (Bengali/English)

### Laravel Backend
```php
// config/app.php
'locale'          => 'bn',  // default বাংলা
'fallback_locale' => 'en',
'available_locales' => ['bn', 'en'],

// resources/lang/bn/messages.php
return [
    'student_created'   => 'ছাত্র সফলভাবে যোগ হয়েছে',
    'fee_collected'     => ':amount টাকা সংগ্রহ হয়েছে',
    'login_failed'      => 'ইমেইল বা পাসওয়ার্ড ভুল',
    'subscription_expired' => 'সাবস্ক্রিপশনের মেয়াদ শেষ হয়েছে',
];

// resources/lang/en/messages.php
return [
    'student_created'   => 'Student added successfully',
    'fee_collected'     => ':amount collected successfully',
    'login_failed'      => 'Invalid email or password',
    'subscription_expired' => 'Your subscription has expired',
];

// In the Controller
return response()->json([
    'message' => __('messages.student_created'),
]);

// User language preference
// users.locale VARCHAR(5) NULL (schema.sql, Revision 9) - NOT an ENUM: Arabic (RTL) was added and a new language must not need a migration.
// Middleware SetLocale (user -> Accept-Language -> institution default -> bn, restricted to the institution's enabled languages): docs/I18N.md section 6.
```

### React Frontend (i18n)
> **Revision 9:** পূর্ণ নিয়ম `docs/I18N.md` (তিন ভাষা `bn/en/ar`, RTL, bidi, ফন্ট, ফরম্যাটার, fallback চেইন, `I18nProvider`)। নিচের উদাহরণ শুধু প্রাথমিক ধারণা; ভাষা-বদল এখন `i18n.changeLanguage` + `PUT /auth/locale` + `<html lang dir>` — `I18nProvider` দেখুন।
```javascript
// npm install react-i18next i18next

// src/i18n/bn.json
{
  "dashboard": "ড্যাশবোর্ড",
  "students": "ছাত্র",
  "add_student": "ছাত্র যোগ করুন",
  "attendance": "উপস্থিতি",
  "fee": "ফি",
  "results": "ফলাফল"
}

// src/i18n/en.json
{
  "dashboard": "Dashboard",
  "students": "Students",
  "add_student": "Add Student",
  "attendance": "Attendance",
  "fee": "Fee",
  "results": "Results"
}

// Usage
import { useTranslation } from 'react-i18next'
const { t, i18n } = useTranslation()

<h1>{t('dashboard')}</h1>
<button onClick={() => i18n.changeLanguage('en')}>English</button>
<button onClick={() => i18n.changeLanguage('bn')}>বাংলা</button>
```

## Notification Preferences (Per User)

### DB Structure
```sql
-- users.notification_preferences JSON column
{
  "sms": true,
  "push": true,
  "inapp": true,
  "absent_alert": true,
  "fee_reminder": true,
  "result_published": true,
  "homework_assigned": false,
  "notice_published": true
}
```

### API
```
GET  /user/notification-preferences      → বর্তমান preferences
PUT  /user/notification-preferences      → preferences আপডেট
```

### NotificationService.php — Preference Check
```php
public function shouldSendSms(User $user, string $type): bool {
    $prefs = $user->notification_preferences ?? [];
    return ($prefs['sms'] ?? true) && ($prefs[$type] ?? true);
}

public function sendAbsentAlert(Student $student): void {
    $parent = $student->primaryParent;
    if (!$parent) return;

    if ($this->shouldSendSms($parent, 'absent_alert')) {
        SendSmsJob::dispatch($student->guardian_phone, "{$student->name} আজ অনুপস্থিত।", app('currentInstitution')->id);
    }
    if ($this->shouldSendPush($parent, 'absent_alert')) {
        $this->sendPush($parent, 'অনুপস্থিতি সতর্কতা',
            "{$student->name} আজ অনুপস্থিত।");
    }
    $parent->notify(new AbsentAlert($student));
}
```

## Soft Delete Strategy

### Which Tables Get Soft Delete?
```php
// Keep Soft Delete (deleted_at column):
// students, teachers, users, notices, homeworks, class_materials

// Use Hard Delete:
// attendances, results, sms_logs, audit_logs, messages

// Laravel Soft Delete
use Illuminate\Database\Eloquent\SoftDeletes;

class Student extends Model {
    use SoftDeletes, BelongsToInstitution;
    // Now Student::delete() → sets deleted_at
    // Student::withTrashed() → shows all including deleted
    // Student::restore($id) → restores
    // Student::forceDelete($id) → permanently deletes
}

// Migration
$table->softDeletes(); // deleted_at TIMESTAMP NULL
```

### Restore Feature (Admin)
```
GET  /students/trashed            → মুছে ফেলা ছাত্রের লিস্ট
POST /students/{id}/restore       → ছাত্র পুনরুদ্ধার
DELETE /students/{id}/force       → চিরতরে মুছে ফেলা (Super Admin only)
```

## API Versioning Strategy

### URL Prefix Versioning (Simple & Common)
```php
// routes/api.php
Route::prefix('v1')->group(function() {
    Route::middleware(['tenant','auth:sanctum','subscription'])->group(function() {
        Route::apiResource('students', Api\V1\StudentController::class);
        Route::apiResource('exams', Api\V1\ExamController::class);
        // ...all v1 routes
    });
});

// When adding v2 in the future
Route::prefix('v2')->group(function() {
    // New features with breaking changes
});

// Base URL:
// https://schoolapp.com/api/v1/students
// https://schoolapp.com/api/v2/students (future)
```

### Deprecation Strategy
```php
// When deprecating an old version
// Add response headers:
// Deprecation: true
// Sunset: Sat, 31 Dec 2025 00:00:00 GMT
// Link: <https://api.schoolapp.com/v2>; rel="successor-version"
```

## Queue Failed Jobs Handling

### Setup
```php
// php artisan queue:failed-table
// php artisan migrate

// config/queue.php
'failed' => [
    'driver'   => 'database-uuids',
    'database' => env('DB_CONNECTION', 'mysql'),
    'table'    => 'failed_jobs',
],
```

### Failed Job Monitoring
```bash
# View failed jobs
php artisan queue:failed

# Retry a specific job
php artisan queue:retry {id}

# Retry all failed jobs
php artisan queue:retry all

# Clear failed jobs
php artisan queue:flush
```

### Auto-Retry Strategy
```php
// Jobs/SendSmsJob.php  - THE definition (Revision 7). Every dispatch passes the institution id: queue workers have no request, so the
// job must carry its tenant and run inside Tenancy::as() (TenantAwareJob -> BindTenant middleware, docs/templates/laravel-core-files.md).
class SendSmsJob implements ShouldQueue
{
    use Queueable, TenantAwareJob;          // TenantAwareJob supplies public int $institutionId + the BindTenant middleware

    public $tries   = 3;
    public $backoff = [60, 300, 900];       // 1 min, 5 min, 15 min

    public function __construct(public string $phone, public string $message, int $institutionId)
    {
        $this->institutionId = $institutionId;
        $this->onQueue('sms');
    }

    public function handle(SmsService $sms): void
    {
        $sms->send($this->phone, $this->message);          // runs with the tenant bound; sender id + suffix: SmsService::compose()
    }

    public function failed(\Throwable $e): void
    {
        Log::error('SMS failed permanently', ['institution' => $this->institutionId, 'to' => substr($this->phone, 0, 5) . '******', 'error' => $e->getMessage()]);   // never log the full number or the message body
        // Alert the Super Admin when a whole institution keeps failing (sender-id monitoring card, docs/modules/notifications.md)
    }
}
```

## Email Template Designs

### Laravel Mail Classes
```
app/Mail/
├── WelcomeInstitutionMail.php        ← নতুন স্কুল welcome
├── SubscriptionRenewalMail.php  ← renewal reminder
├── SubscriptionExpiredMail.php  ← মেয়াদ শেষ
├── InvoiceMail.php              ← payment invoice
├── PasswordResetMail.php        ← password reset
└── ResultPublishedMail.php      ← result published
```

### WelcomeInstitutionMail.php
```php
class WelcomeInstitutionMail extends Mailable {
    use Queueable, SerializesModels;

    public function __construct(
        public Institution $institution,
        public User $admin,
        public string $tempPassword
    ) {}

    public function envelope(): Envelope {
        return new Envelope(subject: 'স্বাগতম! আপনার স্কুল প্রস্তুত');
    }

    public function content(): Content {
        return new Content(view: 'emails.welcome-school', with: [
            'loginUrl'   => "https://{$this->institution->slug}.schoolapp.com/login",
            'email'      => $this->admin->email,
            'password'   => $this->tempPassword,
            'trialDays'  => 14,
            'institutionName' => $this->institution->name,
        ]);
    }
}
```

### Email Template (resources/views/emails/welcome-school.blade.php)
```html
<!DOCTYPE html>
<html>
<body style="font-family: Arial; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px;">
    <div style="text-align: center; border-bottom: 2px solid #185FA5; padding-bottom: 20px;">
      <h1 style="color: #185FA5;">Education Management SaaS</h1>
    </div>
    <h2>স্বাগতম, {{ $institutionName }}!</h2>
    <p>আপনার স্কুলের অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে। আপনি {{ $trialDays }} দিনের বিনামূল্যে Trial ব্যবহার করতে পারবেন।</p>
    <div style="background: #f0f4ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p><strong>Login URL:</strong> <a href="{{ $loginUrl }}">{{ $loginUrl }}</a></p>
      <p><strong>Email:</strong> {{ $email }}</p>
      <p><strong>Password:</strong> {{ $password }}</p>
    </div>
    <p style="color: #e74c3c;">প্রথম লগিনের পর পাসওয়ার্ড পরিবর্তন করুন।</p>
    <a href="{{ $loginUrl }}" style="display: inline-block; background: #185FA5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">এখনই লগিন করুন</a>
  </div>
</body>
</html>
```

## Subscription Invoice PDF Template
```blade
{{-- resources/views/pdf/subscription-invoice.blade.php --}}
┌─────────────────────────────────────────────────────┐
│  [SaaS Logo]  Education Management SaaS                │
│               support@schoolapp.com                 │
│               schoolapp.com                         │
├─────────────────────────────────────────────────────┤
│  INVOICE                    Invoice #: INV-2025-001 │
│                             Date: 15 Jan 2025       │
├─────────────────────────────────────────────────────┤
│  Bill To:                                           │
│  ধানমন্ডি আদর্শ উচ্চ বিদ্যালয়                    │
│  principal@school.edu.bd                           │
│  01711111111                                        │
├──────────────────────┬──────────┬──────────────────┤
│  Description         │ Period   │ Amount            │
├──────────────────────┼──────────┼──────────────────┤
│  Pro Plan            │ Jan 2025 │ BDT 1,999.00     │
│                      │ Monthly  │                   │
├──────────────────────┼──────────┼──────────────────┤
│  Subtotal            │          │ BDT 1,999.00     │
│  Tax (0%)            │          │ BDT 0.00         │
│  Total               │          │ BDT 1,999.00     │
├─────────────────────────────────────────────────────┤
│  Payment Method: bKash   TrxID: BKS8X92KP1         │
│  Status: PAID ✓                                    │
└─────────────────────────────────────────────────────┘
```

## Backup Restoration Steps
```bash
# 1. Download backup from S3
aws s3 cp s3://schoolapp-backups/db/2025-01-15/db_2025-01-15.sql.gz /tmp/

# 2. Decompress
gunzip /tmp/db_2025-01-15.sql.gz

# 3. Restore (caution — overwrites current data)
mysql -u root -p edu_saas < /tmp/db_2025-01-15.sql

# 4. Restore file storage
aws s3 sync s3://schoolapp-files/ /var/www/api/storage/app/public/

# 5. Clear cache
php artisan cache:clear
php artisan config:cache

# 6. Restart queue
supervisorctl restart laravel-worker:*

# 7. Verification
php artisan tinker
>>> Institution::count()  // স্কুল সংখ্যা check
>>> Student::count() // ছাত্র সংখ্যা check
```

## Log Rotation
```bash
# /etc/logrotate.d/laravel
/var/www/api/storage/logs/*.log {
    daily
    missingok
    rotate 14        # ১৪ দিনের log রাখা
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        php /var/www/api/artisan log:clear
    endscript
}

# Nginx logs
/var/log/nginx/*.log {
    weekly
    rotate 4
    compress
    missingok
}
```

## Print Stylesheet (CSS)
```css
/* সব PDF/Print পেজের জন্য */
@media print {
    /* Navigation, sidebar, buttons লুকানো */
    nav, aside, .sidebar, .btn-action,
    .no-print { display: none !important; }

    /* Page break control */
    .page-break { page-break-after: always; }
    .no-break   { page-break-inside: avoid; }

    /* Font size smaller for print */
    body { font-size: 12px; color: #000; }

    /* Table borders visible */
    table, th, td {
        border: 1px solid #000 !important;
        border-collapse: collapse !important;
    }

    /* Institution header always on top */
    .print-header { display: block !important; }
}
```
