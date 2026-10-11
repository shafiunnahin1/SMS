# Laravel Core File Templates

## Tenant Isolation, Fail-Closed — BelongsToInstitution, Tenancy, InstitutionScope (Revision 7)
**নীতি:** tenant বাঁধা না থাকলে tenant-scoped model-এ *কোনো query-ই চলে না* (exception)। আগে scope চুপচাপ বাদ পড়ত ও **সব প্রতিষ্ঠানের ডেটা** ফেরত দিত — একটি ভুলে-ছাড়া `bind`, একটি ভুল route-mode বা একটি নতুন console command-ই ফাঁসের জন্য যথেষ্ট ছিল। এখন সেই ভুলটাই লোডেড exception হয়ে ধরা পড়ে। সব-tenant দেখা বা নির্দিষ্ট tenant হিসেবে চলা — দুটোই **নামসহ, স্পষ্টভাবে** (`Tenancy::withoutTenancy()` / `Tenancy::as()` / `->anyInstitution()`), যাতে grep ও architecture test ধরতে পারে।

**⚠ এই trait ব্যবহার হবে না:** `Institution` (এটিই tenant), `SubscriptionPlan`, `ThemePreset`, `OtpToken`, `Coupon`, `PlatformSetting` (R12: platform-level), এবং `User`/`AuditLog` (নিচে — NULL `institution_id`)। `schema.sql`-এ `institution_id` থাকা বাকি সব model-এ আবশ্যক (`TenancyArchitectureTest` যাচাই করে)।

```php
<?php
// app/Support/Tenancy.php
namespace App\Support;

use App\Models\Institution;
use Closure;

final class Tenancy
{
    private static int $bypass = 0;

    public static function current(): ?Institution
    {
        return app()->bound('currentInstitution') ? app('currentInstitution') : null;
    }

    public static function isBypassed(): bool { return self::$bypass > 0; }

    /** Run $fn AS $institution and ALWAYS restore the previous state - even on exceptions.
     *  Mandatory in jobs/commands/webhooks: queue workers are long-lived, so a binding left behind by job A would be
     *  silently used by job B of another institution. Never call app()->instance('currentInstitution', …) in application code
     *  (TenantMiddleware and one-shot CLI seeders are the only exceptions). */
    public static function as(Institution $institution, Closure $fn): mixed
    {
        $prev = self::current();
        $prevBypass = self::$bypass;
        self::$bypass = 0;                                   // an explicit tenant cancels an outer bypass
        app()->instance('currentInstitution', $institution);
        try {
            return $fn($institution);
        } finally {
            self::$bypass = $prevBypass;
            $prev ? app()->instance('currentInstitution', $prev) : app()->forgetInstance('currentInstitution');
        }
    }

    /** See ALL institutions on purpose (Super Admin screens, scheduler fan-out, tenant lookup by host/ref, platform reports).
     *  Keep the closure small and name what you are doing - reviewers and TenancyArchitectureTest look for this call. */
    public static function withoutTenancy(Closure $fn): mixed
    {
        self::$bypass++;
        try { return $fn(); } finally { self::$bypass--; }
    }

    /** Fan-out: run $fn once per active institution, each inside its own Tenancy::as() */
    public static function each(Closure $fn): void
    {
        foreach (Institution::whereIn('status', ['trial', 'active'])->cursor() as $institution) {
            self::as($institution, fn () => $fn($institution));
        }
    }
}

// app/Support/TenantBulk.php  (R15) - bulk writes skip Eloquent events, therefore BelongsToInstitution::creating() (the cross-tenant guard) never runs for them.
// This is the ONLY allowed way to insert()/upsert() many rows of a tenant model; TenancyArchitectureTest fails on any other ::insert( / ::upsert( outside this class.
final class TenantBulk
{
    public static function upsert(string $model, array $rows, array $uniqueBy, array $update): int
    {
        $tenant = Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException($model);
        foreach ($rows as $r) {
            if ((int) ($r['institution_id'] ?? 0) !== (int) $tenant->id) throw new \LogicException('Cross-tenant bulk write blocked on ' . class_basename($model));
        }
        return $model::upsert($rows, $uniqueBy, $update);
    }
    public static function insert(string $model, array $rows): bool
    {
        $tenant = Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException($model);
        foreach ($rows as $r) {
            if ((int) ($r['institution_id'] ?? 0) !== (int) $tenant->id) throw new \LogicException('Cross-tenant bulk write blocked on ' . class_basename($model));
        }
        return $model::insert($rows);
    }
}

// app/Exceptions/TenantNotBoundException.php  - renders as a generic 500 (never describes the model to the client); logged at CRITICAL
class TenantNotBoundException extends \LogicException
{
    public function __construct(string $model)
    {
        parent::__construct("Tenant-scoped model {$model} used with no tenant bound. Use Tenancy::as(), Tenancy::withoutTenancy() or ::anyInstitution().");
    }
}

// app/Scopes/InstitutionScope.php
namespace App\Scopes;

class InstitutionScope implements \Illuminate\Database\Eloquent\Scope
{
    public function apply(\Illuminate\Database\Eloquent\Builder $builder, \Illuminate\Database\Eloquent\Model $model): void
    {
        if (\App\Support\Tenancy::isBypassed()) return;
        $tenant = \App\Support\Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException($model::class);   // FAIL CLOSED
        $builder->where($model->getTable() . '.institution_id', $tenant->id);
    }
}

// app/Traits/BelongsToInstitution.php
namespace App\Traits;

use App\Scopes\InstitutionScope;
use App\Support\Tenancy;
use Illuminate\Database\Eloquent\Builder;

trait BelongsToInstitution
{
    protected static function bootBelongsToInstitution(): void
    {
        static::addGlobalScope('institution', new InstitutionScope);

        static::creating(function ($model) {
            $tenant = Tenancy::current();
            if (Tenancy::isBypassed()) {
                // Under an explicit bypass the caller must say which institution the row belongs to
                if (empty($model->institution_id)) throw new \LogicException(class_basename($model) . ': set institution_id explicitly inside withoutTenancy()');
                return;
            }
            if (!$tenant) throw new \App\Exceptions\TenantNotBoundException($model::class);
            if (empty($model->institution_id)) { $model->institution_id = $tenant->id; return; }
            if ((int) $model->institution_id !== (int) $tenant->id) {
                throw new \LogicException('Cross-tenant write blocked on ' . class_basename($model));
            }
        });

        // A row can never be moved to another institution
        static::updating(function ($model) {
            if ($model->isDirty('institution_id')) throw new \LogicException('institution_id is immutable on ' . class_basename($model));
        });
    }

    public function institution() { return $this->belongsTo(\App\Models\Institution::class); }

    /** The ONLY ways to leave the tenant filter - both greppable, both audited by TenancyArchitectureTest */
    public function scopeAnyInstitution(Builder $q): Builder { return $q->withoutGlobalScope('institution'); }
    public function scopeForInstitution(Builder $q, int $id): Builder { return $q->withoutGlobalScope('institution')->where($this->getTable() . '.institution_id', $id); }
}

// app/Jobs/Middleware/BindTenant.php - every tenant job carries $institutionId and uses TenantAwareJob
class BindTenant
{
    public function __construct(private int $institutionId) {}
    public function handle($job, $next)
    {
        $institution = \App\Models\Institution::find($this->institutionId);
        if (!$institution) { $job->delete(); return; }                                  // institution was removed: drop the job
        return Tenancy::as($institution, fn () => $next($job));
    }
}
trait TenantAwareJob   // use in SendSmsJob, SendOnlinePaymentReceipt, report/PDF jobs, imports ... ; constructor sets $this->institutionId
{
    public int $institutionId;
    public function middleware(): array { return [new \App\Jobs\Middleware\BindTenant($this->institutionId)]; }
}
```
### যে দুটি model-এর `institution_id` NULL হতে পারে
`users` (Super Admin) ও `audit_logs` (প্ল্যাটফর্মের কাজ) — তাই সাধারণ trait চলে না (trait `creating`-এ tenant ছাড়া exception দেয়)। এদের নিজস্ব ছোট নিয়ম, সেটিও fail-closed:
```php
// app/Models/User.php  - NO global scope (a Super Admin row has institution_id NULL), but reads are explicit and fail closed
public function scopeInTenant(Builder $q): Builder      // staff/students/parents of the CURRENT institution
{
    $t = \App\Support\Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException(self::class);
    return $q->where('users.institution_id', $t->id);
}
public function scopePlatform(Builder $q): Builder      // Super Admin accounts only
{
    return $q->whereNull('users.institution_id')->where('users.role', 'super_admin');
}
// Login (docs/AUTHORIZATION.md): tenant host -> User::inTenant(); central host -> User::platform(). Never User::where('email', …) alone.
// Anywhere else a user list is needed: User::inTenant()->…  (e.g. Institution::admins() already filters by institution_id)

// app/Traits/BelongsToOptionalInstitution.php  - for AuditLog
//   reads : same fail-closed scope as InstitutionScope (a tenant sees only its own rows; Super Admin screens use anyInstitution())
//   writes: institution_id = current tenant if bound, NULL otherwise (platform action); no exception when unbound
```
Super Admin screens (`/super/*`) legitimately look across institutions. Rather than sprinkle `anyInstitution()` on every query there, **one named middleware** wraps the whole route group:
```php
// app/Http/Middleware/PlatformScope.php  (alias 'tenancy.bypass') - registered ONLY on the central-host /super group
public function handle($request, Closure $next)
{
    abort_unless($request->user()?->role === 'super_admin' && !\App\Support\Tenancy::current(), 403);
    return \App\Support\Tenancy::withoutTenancy(fn () => $next($request));
}
```
Inside it, creating a tenant-scoped row requires an explicit `institution_id` (the trait throws otherwise), so a Super Admin screen cannot write a row "by accident" into no/the wrong institution.

**কে tenant ছাড়া চলতে পারে (পূর্ণ তালিকা):** (১) central host-এর Super Admin কাজ — প্রতিটি query `->anyInstitution()` বা `Tenancy::withoutTenancy()` সহ; (২) `TenantResolver` ও `tls-check` (host → tenant খোঁজা); (৩) payment callback/reconcile — `OnlinePayment::anyInstitution()` দিয়ে row খুঁজে `Tenancy::as()` দিয়ে এগোয়; (৪) scheduler/console — `Tenancy::each()`; (৫) login (central host-এ Super Admin; tenant host-এ বাঁধা tenant)। এর বাইরে কোথাও `withoutGlobalScope(s)`, `anyInstitution`, `withoutTenancy`, raw `DB::table/select/statement/affectingStatement/insert/update/delete/unprepared` দেখলে `TenancyArchitectureTest` ব্যর্থ হয় যতক্ষণ না ফাইলটি `tests/Architecture/tenancy-allowlist.php`-এ কারণসহ যুক্ত।

## app/Models/Student.php — Full Code (Revision 7)
`program_id`, `batch_id`, `roll_no` **`$fillable`-এ নেই** — এগুলো primary active enrollment-এর cache, শুধু `EnrollmentService::syncCache()` লেখে (`forceFill`)। তাই কোনো controller/import/seeder ভুল করে সরাসরি লিখতে পারে না।
```php
<?php
namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\{Builder, Model, SoftDeletes};

class Student extends Model
{
    use BelongsToInstitution, SoftDeletes;

    protected $fillable = [
        'institution_id', 'user_id', 'student_id', 'date_of_birth', 'gender', 'blood_group', 'religion',
        'father_name', 'mother_name', 'guardian_phone', 'address', 'photo', 'admission_date', 'status',
        'studying_at', 'board_reg_no', 'board_roll_no',
    ];   // NOT program_id / batch_id / roll_no - see EnrollmentService (docs/modules/academic-structure.md)

    protected $casts = ['date_of_birth' => 'date', 'admission_date' => 'date'];

    // Relations
    public function user()          { return $this->belongsTo(User::class); }
    public function program()       { return $this->belongsTo(Program::class); }       // cache of the primary enrollment
    public function batch()         { return $this->belongsTo(Batch::class); }         // cache of the primary enrollment
    public function enrollments()   { return $this->hasMany(Enrollment::class); }
    public function activeEnrollments() { return $this->enrollments()->where('status', 'active'); }
    public function primaryEnrollment() { return $this->hasOne(Enrollment::class)->where('status', 'active')->where('is_primary', 1); }
    public function attendances()   { return $this->hasMany(Attendance::class); }
    public function results()       { return $this->hasMany(Result::class); }
    public function feePayments()   { return $this->hasMany(FeePayment::class); }
    public function documents()     { return $this->hasMany(StudentDocument::class); }
    public function parents()       { return $this->belongsToMany(User::class, 'parent_student', 'student_id', 'parent_user_id')->withPivot('relationship', 'is_primary'); }
    public function primaryParent() { return $this->parents()->wherePivot('is_primary', true)->first(); }

    // Scopes - ALWAYS use these (not where('batch_id'...)) so multi-batch students (coaching) are handled
    public function scopeActive(Builder $q)                    { return $q->where('status', 'active'); }
    public function scopeInBatch(Builder $q, int $batchId)     { return $q->whereHas('enrollments', fn ($e) => $e->where('batch_id', $batchId)->where('status', 'active')); }
    public function scopeInProgram(Builder $q, int $programId) { return $q->whereHas('enrollments', fn ($e) => $e->where('program_id', $programId)->where('status', 'active')); }
}
```

## routes/api.php — Full Code (Revision 6)
তিন ধরনের host আছে এবং প্রতিটি route group ঠিক একটি ধরনে চলে — এটিই cross-tenant leak ঠেকানোর প্রধান দেয়াল:

| Middleware | Runs on | Behaviour elsewhere |
|---|---|---|
| `tenant` (= `tenant:required`) | tenant host (subdomain / custom domain) | central host-এ 404 `institution_not_found` |
| `tenant:central` | central host (`schoolapp.com`, `admin.schoolapp.com`) | tenant host-এ 404 `not_found` |
| `tenant:optional` | যেকোনো host (`/health`, `/bootstrap`, `/theme/public`, login) | — |

Tenant-scoped route কখনো `tenant:optional`-এ রাখা যাবে না: tenant bind না থাকলে `BelongsToInstitution` কোনো scope প্রয়োগ করে না।

```php
<?php
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\{LoginController, PasswordResetController};
use App\Http\Controllers\Public\{BootstrapController, SignupController, ManifestController, PublicThemeController};
use App\Http\Controllers\Internal\TlsCheckController;
use App\Http\Controllers\SuperAdmin\{
    InstitutionController, PlanController, PaymentController, ReportController as SAReportController,
    InstitutionThemeController, ThemePresetController, DomainApprovalController
};
use App\Http\Controllers\Admin\{
    StudentController, TeacherController, ProgramController, BatchController, EnrollmentController,
    SubjectController, ExamController, ResultController, FeeController, AttendanceController,
    NoticeController, DashboardController, RoutineController, ReportController, SettingController,
    ExpenseController, LeadController, TeacherPayoutController, DomainController, ThemeController,
    TerminologyController, SmsCreditController, TeacherAttendanceController,
    PaymentSettingsController, OnlinePaymentController as AdminOnlinePaymentController, SmsSenderController, WebsiteSettingsController,
    ConsentController, StudentPrivacyController
};
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\Parent\{FeePaymentController, FeePaymentCallbackController};
use App\Http\Controllers\Public\{PublicSiteController, PublicAdmissionController};
use App\Http\Controllers\SuperAdmin\{TenantPurgeController, SettlementController, PayoutAccountController, SmsSenderApprovalController, OnlinePaymentReportController};
use App\Http\Controllers\QuestionBank\QbCurriculumController;   // D65 question bank (docs/modules/question-bank.md)
use App\Http\Controllers\Academics\{ResultSheetController, DueBlockController, PeriodAttendanceController, SubstitutionController, RoutineBlockController, StudentLeaveController, MarksLockController};
use App\Http\Controllers\Hr\{LeaveTypeController, LeaveController, StaffController, StaffAttendanceController, SalaryComponentController, SalaryStructureController, SalaryRevisionController, IncrementBatchController, BonusSchemeController, SalaryAdjustmentController, SalaryAdvanceController, PayrollRunController, PayrollItemController, PayAccountController, ProvidentFundController, PayrollReportController, FinalSettlementController};
use App\Http\Controllers\Teacher\SalaryController as TeacherSalaryController;
use App\Http\Controllers\Finance\{CashBookController, FeeRefundController};
use App\Http\Controllers\Inventory\{InventoryItemController, InventoryMovementController, InventoryReportController};
use App\Http\Controllers\Devices\{DevicePunchController, AttendanceDeviceController, PersonCredentialController, DevicePunchReviewController};
use App\Http\Controllers\Accounting\{AccountController, VoucherController, BudgetController, AccountingReportController, BankReconciliationController, AccountingSettingController};
use App\Http\Controllers\Donations\{DonorController, DonationFundController, DonationCampaignController, DonationController};
use App\Http\Controllers\Madrasa\HifzController;
use App\Http\Controllers\Syllabus\{SyllabusUnitController, LessonPlanController, SyllabusCoverageController};
use App\Http\Controllers\Risk\RiskController;
use App\Http\Controllers\Admission\{AdmissionCycleController, AdmissionLeadActionController, PublicAdmissionPayController, PublicAdmissionStatusController};
use App\Http\Controllers\Imports\ImportController;
use App\Http\Controllers\Sms\{SmsTemplateController, SmsCampaignController, EmergencyController, SmsWebhookController, SmsLogController};
use App\Http\Controllers\Notices\NoticeAckController;
use App\Http\Controllers\Platform\{SupportTicketController, CouponController, ExportController, ImpersonationController, SuperSupportController, SuperCouponController, SuperImportController, SuperBackupController, PlatformSettingController, SuperRefundController};
use App\Http\Controllers\PublicSite\{GalleryController, NewsController, SitePageController, PublicTeacherController, PublicEventController, VerifyController};
use App\Http\Controllers\Teacher\{MarkController, HomeworkController, MaterialController};
use App\Http\Controllers\Shared\{NotificationController, MessageController, AuditLogController, TransportController};
use App\Http\Controllers\Billing\SslCommerzController;

// ─── 0. Internal (loopback only, NO tenant, NO auth) — path is /api/internal/..., outside v1 ───
Route::get('internal/tls-check', TlsCheckController::class);

Route::prefix('v1')->group(function () {

    // ─── 1. Any host ───────────────────────────────────────────
    Route::middleware('tenant:optional')->group(function () {
        Route::get('/health', \App\Http\Controllers\Public\HealthController::class);        // invokable controller - a closure here would break route:cache
        Route::get('/bootstrap',              [BootstrapController::class,   'show']);
        Route::get('/theme/public',           [PublicThemeController::class, 'show']);
        Route::get('/manifest.webmanifest',   [ManifestController::class,    'show']);   // linked from index.html as /api/v1/manifest.webmanifest
        Route::post('/auth/login',            [LoginController::class,       'login'])->middleware('throttle:login');
        Route::post('/auth/verify-otp',       [LoginController::class,       'verifyOtp'])->middleware('throttle:login');
        Route::post('/auth/forgot-password',  [PasswordResetController::class, 'sendResetLink']);
        Route::post('/auth/reset-password',   [PasswordResetController::class, 'reset']);
    });

    // ─── 2. Central host only: signup, gateway callbacks, Super Admin ─────
    Route::middleware('tenant:central')->group(function () {
        Route::post('/public/signup',         [SignupController::class, 'store']);
        Route::get('/public/slug-check',      [SignupController::class, 'slugCheck']);
        Route::get('/public/plans',           [SignupController::class, 'plans']);

        // Gateway callbacks (D14, docs/modules/online-fee-payment.md): always the central domain. The controller loads the
        // online_payments row by ?ref= (or value_a), calls OnlinePaymentService::finalize() which binds the tenant itself,
        // then redirects to DomainService::primaryUrl($institution).
        Route::get('/fees/payment/bkash/callback', [FeePaymentCallbackController::class, 'bkash'])->name('fee.bkash.callback')->middleware('throttle:60,1');
        Route::match(['get', 'post'], '/fees/payment/ssl/success', [FeePaymentCallbackController::class, 'sslSuccess'])->middleware('throttle:60,1');
        Route::match(['get', 'post'], '/fees/payment/ssl/fail',    [FeePaymentCallbackController::class, 'sslFail'])->middleware('throttle:60,1');
        Route::match(['get', 'post'], '/fees/payment/ssl/cancel',  [FeePaymentCallbackController::class, 'sslCancel'])->middleware('throttle:60,1');
        Route::post('/fees/payment/ssl/ipn',                       [FeePaymentCallbackController::class, 'sslIpn'])->middleware('throttle:60,1');
        // R6.4 generic provider notification (Bangla QR and every future gateway): adapter does extractRef() + authenticate(); no new route per provider
        Route::match(['get', 'post'], '/fees/payment/{gateway}/notify', [FeePaymentCallbackController::class, 'notify'])->where('gateway', '[a-z0-9_]+')->middleware('throttle:120,1');

        // R12: SMS delivery reports. INACTIVE until a provider adapter implements parseDeliveryReport() (docs/modules/communication-plus.md, TODO(OD-sms-dlr))
        Route::post('/webhooks/sms/{provider}', [SmsWebhookController::class, 'handle'])->where('provider', '[a-z0-9_]+')->middleware('throttle:sms-webhook');

        // Platform subscription payments (institution -> platform), platform credentials: docs/modules/payment-gateways.md
        Route::post('/billing/ssl/success', [\App\Http\Controllers\Billing\SslCommerzController::class, 'success']);
        Route::post('/billing/ssl/fail',    [\App\Http\Controllers\Billing\SslCommerzController::class, 'fail']);
        Route::post('/billing/ssl/cancel',  [\App\Http\Controllers\Billing\SslCommerzController::class, 'cancel']);
        Route::post('/billing/ssl/ipn',     [\App\Http\Controllers\Billing\SslCommerzController::class, 'ipn']);
        // D58: SMS wallet recharge with bKash (platform merchant) - the callback lands on the central domain, then redirects to primaryUrl()
        Route::get('/billing/bkash/callback', [\App\Http\Controllers\Billing\SmsRechargeCallbackController::class, 'bkash'])->middleware('throttle:60,1');

        Route::middleware(['auth:sanctum', 'role:super_admin', 'tenancy.bypass', 'throttle:api'])->prefix('super')->group(function () {
            Route::get('/dashboard',                  [DashboardController::class, 'superAdmin']);
            // R12 platform operations (docs/modules/platform-ops.md). Super Admin never reads payroll / health / documents (D33, D34 sensitive_scope).
            Route::get('/support/tickets',            [SuperSupportController::class, 'index']);
            Route::get('/support/tickets/{id}',       [SuperSupportController::class, 'show']);
            Route::post('/support/tickets/{id}/{action}', [SuperSupportController::class, 'transition'])->where('action', 'messages|assign|status');
            Route::apiResource('coupons',             SuperCouponController::class)->except(['show', 'destroy']);
            Route::get('/coupons/{id}/redemptions',   [SuperCouponController::class, 'redemptions']);
            Route::get('/platform-settings',          [PlatformSettingController::class, 'show']);
            Route::put('/platform-settings',          [PlatformSettingController::class, 'update']);
            Route::post('/institutions/{id}/impersonate', [ImpersonationController::class, 'start']);
            Route::post('/institutions/{id}/backup',  [SuperBackupController::class, 'store']);
            Route::post('/institutions/import',       [SuperImportController::class, 'store']);
            Route::post('/payments/{id}/refund',      [SuperRefundController::class, 'subscription']);
            Route::apiResource('institutions',        InstitutionController::class);      // incl. institution_type, enabled_modules
            Route::patch('/institutions/{id}/toggle', [InstitutionController::class, 'toggleStatus']);
            Route::post('/institutions/{id}/sms-credits', [SmsCreditController::class, 'adjust']);
            Route::get('/sms-settings',               [UniversalSmsController::class, 'show']);      // D57: the universal BulkSMSBD API + the rate per SMS part (D56)
            Route::put('/sms-settings',               [UniversalSmsController::class, 'update']);
            // D65 question bank, task QB.1: the platform curriculum class → subject → chapter → topic ({kind} = class-levels|subjects|chapters|topics)
            Route::get('/qb/curriculum',              [QbCurriculumController::class, 'tree']);
            Route::post('/qb/{kind}',                 [QbCurriculumController::class, 'store']);
            Route::put('/qb/{kind}/{id}',             [QbCurriculumController::class, 'update']);
            Route::delete('/qb/{kind}/{id}',          [QbCurriculumController::class, 'destroy']);   // 422 qb_in_use while anything hangs on it
            Route::post('/institutions/{id}/domains', [DomainApprovalController::class, 'storeFor']);
            Route::apiResource('plans',               PlanController::class);
            Route::get('/payments',                   [PaymentController::class, 'index']);
            Route::get('/reports/revenue',            [SAReportController::class, 'revenue']);
            Route::get('/reports/growth',             [SAReportController::class, 'growth']);

            Route::prefix('institutions/{institutionId}/theme')->group(function () {
                Route::get('/',         [InstitutionThemeController::class, 'show']);
                Route::put('/',         [InstitutionThemeController::class, 'update']);
                Route::post('/logo',    [InstitutionThemeController::class, 'uploadLogo']);
                Route::post('/favicon', [InstitutionThemeController::class, 'uploadFavicon']);
                Route::get('/history',  [InstitutionThemeController::class, 'history']);
                Route::post('/reset',   [InstitutionThemeController::class, 'reset']);
            });
            Route::apiResource('theme-presets', ThemePresetController::class)->except(['show']);

            // Online fee payments, payout accounts, settlements (platform mode) — docs/modules/online-fee-payment.md
            Route::get('/online-payments',              [OnlinePaymentReportController::class, 'index']);                 // ?status=review for the "needs a human" tab
            Route::post('/online-payments/{id}/resolve',[OnlinePaymentReportController::class, 'resolve']);               // accept_as_paid | mark_refunded
            Route::post('/online-payments/{id}/verify', [OnlinePaymentReportController::class, 'verify']);                // manual confirm() for providers without a status API
            Route::get('/payout-accounts',              [PayoutAccountController::class, 'index']);
            Route::put('/payout-accounts/{id}',         [PayoutAccountController::class, 'review']);
            Route::get('/settlements',                  [SettlementController::class, 'index']);
            Route::post('/settlements/generate',        [SettlementController::class, 'generate']);
            Route::get('/settlements/{id}',             [SettlementController::class, 'show']);
            Route::put('/settlements/{id}',             [SettlementController::class, 'update']);
            Route::delete('/settlements/{id}',          [SettlementController::class, 'destroy']);
            Route::post('/settlements/{id}/approve',    [SettlementController::class, 'approve']);
            Route::post('/settlements/{id}/pay',        [SettlementController::class, 'pay']);
            Route::get('/reports/settlement-liability', [OnlinePaymentReportController::class, 'liability']);

            // SMS sender IDs
            Route::get('/sms-senders',                              [SmsSenderApprovalController::class, 'index']);
            Route::post('/institutions/{id}/sms-sender/approve',    [SmsSenderApprovalController::class, 'approve']);
            Route::post('/institutions/{id}/sms-sender/reject',     [SmsSenderApprovalController::class, 'reject']);

            Route::get('/tenant-purge/candidates',                       [TenantPurgeController::class, 'candidates']);
            Route::post('/tenant-purge/{institutionId}/dry-run',         [TenantPurgeController::class, 'dryRun']);
            Route::post('/tenant-purge/{institutionId}/execute',         [TenantPurgeController::class, 'execute']);   // needs a recent dry-run + typed confirmation

            Route::get('/domains',                [DomainApprovalController::class, 'index']);
            Route::post('/domains/{id}/approve',  [DomainApprovalController::class, 'approve']);
            Route::post('/domains/{id}/reject',   [DomainApprovalController::class, 'reject']);
            Route::post('/domains/{id}/disable',  [DomainApprovalController::class, 'disable']);
            Route::post('/domains/{id}/recheck',  [DomainApprovalController::class, 'recheck']);
        });

        // Super Admin shares these two with tenants (token-scoped to the user, no tenant data)
        Route::middleware(['auth:sanctum', 'role:super_admin'])->group(function () {
            Route::post('/auth/logout',          [LoginController::class, 'logout']);
            Route::get('/auth/me',               [LoginController::class, 'me']);
        });
    });

    // ─── 2b. Tenant host, public (no auth): website + admission form — docs/modules/public-website.md ───
    Route::middleware(['tenant', 'module:public_site'])->prefix('public')->group(function () {
        Route::get('/site',        [PublicSiteController::class, 'show']);
        Route::get('/notices',     [PublicSiteController::class, 'notices']);
        Route::post('/admission',  [PublicAdmissionController::class, 'store'])->middleware('throttle:admission');
        // R12 public-website-plus (docs/modules/public-website-plus.md): never any student data
        Route::get('/gallery',               [GalleryController::class, 'albums']);
        Route::get('/gallery/{album_id}',    [GalleryController::class, 'items']);
        Route::get('/news',                  [NewsController::class, 'index']);
        Route::get('/news/{slug}',           [NewsController::class, 'show']);
        Route::get('/pages/{slug}',          [SitePageController::class, 'show']);
        Route::get('/teachers',              [PublicTeacherController::class, 'index']);
        Route::get('/events',                [PublicEventController::class, 'index']);
        Route::post('/admission/{lead_id}/pay', [PublicAdmissionPayController::class, 'pay'])->middleware('throttle:admission-pay');
    });

    // R12: certificate / TC verification page (docs/modules/quick-wins.md). Minimal data, throttled, same slow answer for a wrong code.
    Route::middleware(['tenant', 'throttle:verify'])->get('/public/verify/{code}', [VerifyController::class, 'show'])->where('code', '[A-Za-z0-9]{8,16}');

    // R12: admission cycle - public status lookup and the lottery transparency page (docs/modules/admission-cycle.md)
    Route::middleware(['tenant', 'module:admission_cycle', 'throttle:public'])->prefix('public/admission')->group(function () {
        Route::get('/status',                       [PublicAdmissionStatusController::class, 'status']);
        Route::get('/cycle/{id}/transparency',      [PublicAdmissionStatusController::class, 'transparency']);
    });

    // R12: attendance devices push signed punches (HMAC, no Sanctum) - docs/modules/attendance-devices.md
    Route::middleware(['tenant', 'module:attendance_devices', 'device.auth', 'throttle:device'])->post('/device/punches', [DevicePunchController::class, 'store']);

    // R12: one-time code exchange for support impersonation (the Super Admin token never travels to the tenant origin) - docs/modules/platform-ops.md
    Route::middleware(['tenant', 'throttle:login'])->post('/auth/impersonate/exchange', [ImpersonationController::class, 'exchange']);

    // ─── 3. Tenant host only ───────────────────────────────────
    // `subscription` keeps expired institutions out, except auth/billing/subscription paths (path-based bypass).
    Route::middleware(['tenant', 'auth:sanctum', 'tenant.user', 'subscription', 'throttle:api'])->group(function () {

        // Shared by every tenant role
        Route::post('/auth/logout',               [LoginController::class,         'logout']);
        Route::get('/auth/me',                    [LoginController::class,         'me']);
        Route::patch('/auth/change-password',     [PasswordResetController::class, 'changePassword']);
        Route::get('/auth/sessions',              [SessionController::class, 'index']);
        Route::delete('/auth/sessions/{id}',      [SessionController::class, 'destroy']);
        Route::post('/auth/logout-all',           [SessionController::class, 'logoutAll']);
        Route::patch('/user/fcm-token',           [NotificationController::class,  'updateFcmToken']);
        Route::get('/notifications',              [NotificationController::class,  'index']);
        Route::patch('/notifications/{id}/read',  [NotificationController::class,  'markRead']);
        Route::patch('/notifications/read-all',   [NotificationController::class,  'markAllRead']);
        Route::get('/messages',                   [MessageController::class,       'index']);
        Route::post('/messages',                  [MessageController::class,       'store']);
        Route::get('/notices',                    [NoticeController::class,        'index']);   // filtered by VisibleToStudent / role
        Route::get('/attendance/summary/{id}',    [AttendanceController::class,    'summary']);
        Route::get('/fees/payments/student/{id}', [FeeController::class,           'studentPayments']);
        Route::get('/programs',                   [ProgramController::class,       'index']);
        Route::get('/batches',                    [BatchController::class,         'index']);

        // Subscription & billing (institution admin pays; bypasses the expiry block)
        Route::middleware('role:admin')->group(function () {
            Route::get('/subscription',                [\App\Http\Controllers\Billing\SubscriptionController::class, 'show']);
            Route::post('/subscription/checkout',      [\App\Http\Controllers\Billing\SubscriptionController::class, 'checkout']);
            Route::post('/subscription/sms-credits',   [SmsCreditController::class, 'purchase']);
        });

        // ── Institution Admin ─────────────────────────────────
        Route::middleware('role:admin')->group(function () {
            Route::get('/admin/dashboard',        [DashboardController::class, 'admin']);
            Route::post('/admin/users/{id}/force-logout', [SessionController::class, 'forceLogout']);
            Route::post('/admin/users/{id}/unlock',       [SessionController::class, 'unlock']);
            Route::get('/students/{id}/consents',         [ConsentController::class, 'index']);
            Route::post('/students/{id}/consents',        [ConsentController::class, 'store']);
            Route::get('/students/{id}/consent-form.pdf', [ConsentController::class, 'form']);
            Route::post('/students/{id}/anonymize',       [StudentPrivacyController::class, 'anonymize']);
            Route::apiResource('students',        StudentController::class);
            Route::get('/students/{id}/card',     [StudentController::class, 'idCard']);
            Route::get('/students/{id}/enrollments', [EnrollmentController::class, 'forStudent']);
            Route::apiResource('teachers',        TeacherController::class);
            Route::apiResource('programs',        ProgramController::class)->except(['index']);
            Route::apiResource('batches',         BatchController::class)->except(['index']);
            Route::get('/batches/{id}/students',  [BatchController::class, 'students']);
            Route::post('/enrollments',                    [EnrollmentController::class, 'store']);
            Route::put('/enrollments/{id}',                [EnrollmentController::class, 'update']);
            Route::post('/enrollments/{id}/end',           [EnrollmentController::class, 'end']);
            Route::post('/enrollments/{id}/transfer',      [EnrollmentController::class, 'transfer']);
            Route::apiResource('subjects',        SubjectController::class);
            Route::apiResource('exams',           ExamController::class);
            Route::post('/exams/{id}/publish',    [ExamController::class, 'publish']);
            Route::get('/exams/{id}/subjects',    [ExamController::class, 'subjects']);        // R6.3: schedule + full/pass marks + components
            Route::put('/exams/{id}/subjects',    [ExamController::class, 'updateSubjects']);
            Route::get('/fees/categories',        [FeeController::class, 'categories']);
            Route::post('/fees/categories',       [FeeController::class, 'storeCategory']);
            Route::put('/fees/categories/{id}',   [FeeController::class, 'updateCategory']);
            Route::get('/fees/report',            [FeeController::class, 'report']);
            Route::apiResource('notices',         NoticeController::class)->except(['index']);
            Route::post('/sms/send',              [NoticeController::class, 'sendSms']);
            Route::get('/admin/reports/{type}',   [ReportController::class, 'generate']);
            Route::get('/audit-logs',             [AuditLogController::class, 'index']);
            Route::get('/audit-logs/{id}',        [AuditLogController::class, 'show']);

            // Settings
            Route::get('/settings',               [SettingController::class, 'index']);
            Route::put('/settings',               [SettingController::class, 'update']);
            Route::get('/admin/settings/terminology', [TerminologyController::class, 'show']);
            Route::put('/admin/settings/terminology', [TerminologyController::class, 'update']);
            Route::get('/admin/settings/general', [SettingController::class, 'general']);
            Route::put('/admin/settings/general', [SettingController::class, 'updateGeneral']);

            // Appearance — brand/tokens/layout/preset are gated INSIDE the controller by plan feature custom_branding
            Route::get('/admin/theme',            [ThemeController::class, 'show']);
            Route::put('/admin/theme',            [ThemeController::class, 'update']);
            Route::put('/admin/theme/tokens',     [ThemeController::class, 'tokens']);
            Route::put('/admin/theme/layout',     [ThemeController::class, 'layout']);
            Route::put('/admin/theme/pack',       [ThemeController::class, 'pack']);          // R8: docs/UI-PACKS.md
            Route::post('/admin/theme/preset',    [ThemeController::class, 'preset']);
            Route::post('/admin/theme/logo',      [ThemeController::class, 'logo']);
            Route::post('/admin/theme/favicon',   [ThemeController::class, 'favicon']);

            // Domains — slug change needs feature custom_subdomain; custom domains need feature custom_domain
            Route::put('/admin/slug',                       [DomainController::class, 'updateSlug'])->middleware('feature:custom_subdomain');
            Route::middleware('feature:custom_domain')->group(function () {
                Route::get('/admin/domains',                [DomainController::class, 'index']);
                Route::post('/admin/domains',               [DomainController::class, 'store']);
                Route::post('/admin/domains/{id}/verify',   [DomainController::class, 'verify'])->middleware('throttle:6,1');
                Route::post('/admin/domains/{id}/primary',  [DomainController::class, 'makePrimary']);
                Route::delete('/admin/domains/{id}',        [DomainController::class, 'destroy']);
            });

            // Online payment settings (admin only; Accountant may read the lists below)
            Route::get('/admin/settings/payments',                          [PaymentSettingsController::class, 'show']);
            Route::put('/admin/settings/payments/gateways/{gateway}',       [PaymentSettingsController::class, 'saveGateway']);
            Route::post('/admin/settings/payments/gateways/{gateway}/test', [PaymentSettingsController::class, 'testGateway'])->middleware('throttle:5,1');
            Route::delete('/admin/settings/payments/gateways/{gateway}',    [PaymentSettingsController::class, 'disableGateway']);
            Route::put('/admin/settings/payments/payout-account',           [PaymentSettingsController::class, 'savePayoutAccount']);

            // SMS sender ID & public website settings
            Route::get('/admin/settings/sms-sender',    [SmsSenderController::class, 'show']);
            Route::put('/admin/settings/sms-sender',    [SmsSenderController::class, 'update']);
            Route::delete('/admin/settings/sms-sender', [SmsSenderController::class, 'destroy']);
            Route::middleware('module:public_site')->group(function () {
                Route::get('/admin/settings/website',        [WebsiteSettingsController::class, 'show']);
                Route::put('/admin/settings/website',        [WebsiteSettingsController::class, 'update']);
                Route::post('/admin/settings/website/hero',  [WebsiteSettingsController::class, 'hero']);
            });

            // Coaching / private batch
            Route::middleware('module:leads')->group(function () {
                Route::apiResource('leads', LeadController::class);
                Route::post('/leads/{id}/convert', [LeadController::class, 'convert']);
            });
            Route::middleware('module:teacher_payouts')->group(function () {
                Route::get('/teacher-payouts',               [TeacherPayoutController::class, 'index']);
                Route::post('/teacher-payouts/generate',     [TeacherPayoutController::class, 'generate']);
                Route::put('/teacher-payouts/{id}',          [TeacherPayoutController::class, 'update']);
                Route::post('/teacher-payouts/{id}/approve', [TeacherPayoutController::class, 'approve']);
                Route::post('/teacher-payouts/{id}/pay',     [TeacherPayoutController::class, 'pay']);
            });
            Route::middleware('module:teacher_attendance')->group(function () {
                Route::get('/teacher-attendance',   [TeacherAttendanceController::class, 'index']);
                Route::post('/teacher-attendance',  [TeacherAttendanceController::class, 'store']);
            });

            // Seat plan, promotion, TC — module:promotion_tc / module:academic_calendar groups (Phase 7); paths in docs/API.md
            Route::middleware('module:routine')->group(function () {
                Route::apiResource('routines', RoutineController::class);
                Route::get('/routines/{batchId}/print', [RoutineController::class, 'print']);
            });
            Route::middleware('module:academic_calendar')->group(function () {
                Route::post('/exams/{id}/seat-plan/generate',   [ExamController::class, 'generateSeatPlan']);
                Route::get('/exams/{id}/seat-plan',             [ExamController::class, 'seatPlan']);
                Route::put('/exams/{id}/seat-plan/{studentId}', [ExamController::class, 'adjustSeat']);
                Route::get('/exams/{id}/seat-plan/print',       [ExamController::class, 'printSeatPlan']);
            });
            Route::middleware('module:promotion_tc')->group(function () {
                Route::post('/students/{id}/transfer', [StudentController::class, 'issueTC']);
                Route::post('/students/promote',       [StudentController::class, 'promote']);
            });
        });

        // ── Admin + Accountant ────────────────────────────────
        Route::middleware('role:admin,accountant')->group(function () {
            Route::get('/fees/payments',          [FeeController::class, 'payments']);
            Route::post('/fees/collect',          [FeeController::class, 'collect']);
            Route::get('/fees/dues',              [FeeController::class, 'dues']);
            Route::get('/fees/receipt/{id}',      [FeeController::class, 'receipt']);
            Route::get('/fees/waivers',           [FeeController::class, 'waivers']);
            Route::patch('/fees/waivers/{id}/approve', [FeeController::class, 'approveWaiver']);
            Route::patch('/fees/waivers/{id}/reject',  [FeeController::class, 'rejectWaiver']);
            Route::apiResource('expenses',        ExpenseController::class);   // registered ONCE (duplicate apiResource breaks route:cache)
            Route::get('/expenses/report',        [ExpenseController::class, 'report']);
            Route::middleware('module:online_payment')->group(function () {
                Route::get('/admin/payments',             [AdminOnlinePaymentController::class, 'index']);
                Route::get('/admin/payments/settlements', [AdminOnlinePaymentController::class, 'settlements']);   // before {id}
                Route::get('/admin/payments/{id}',        [AdminOnlinePaymentController::class, 'show']);
            });
        });

        // ── Admin + Teacher ───────────────────────────────────
        Route::middleware('role:admin,teacher')->group(function () {
            Route::get('/attendance',             [AttendanceController::class, 'index']);    // ?batch_id=&date=
            Route::post('/attendance',            [AttendanceController::class, 'store']);    // { batch_id, date, records[] }
            Route::put('/attendance/{id}',        [AttendanceController::class, 'update']);
            Route::get('/attendance/report',      [AttendanceController::class, 'report']);
            Route::get('/results',                [ResultController::class, 'index']);
            Route::get('/exams/{id}/subjects/{subjectId}/entry', [ResultController::class, 'entrySheet']);   // students + existing marks + limits
            Route::post('/results/bulk',          [ResultController::class, 'bulkStore']);       // { exam_id, subject_id, rows:[{student_id, marks_obtained?, components?, is_absent?}] }
            Route::put('/results/{id}',           [ResultController::class, 'update']);
            Route::get('/exams/{id}/merit-list',  [ExamController::class, 'meritList']);
        });

        // ── Revision 10: advanced academics (docs/modules/academics-advanced.md) ──────────────
        Route::middleware(['role:admin,teacher', 'module:result_sheets'])->group(function () {
            Route::apiResource('result-sheets', ResultSheetController::class);                  // PUT/DELETE only while draft
            Route::post('/result-sheets/{id}/compute',      [ResultSheetController::class, 'compute']);
            Route::get('/result-sheets/{id}/preview',       [ResultSheetController::class, 'preview']);
            Route::post('/result-sheets/{id}/publish',      [ResultSheetController::class, 'publish'])->middleware('role:admin');
            Route::post('/result-sheets/{id}/new-version',  [ResultSheetController::class, 'newVersion'])->middleware('role:admin');
            Route::get('/result-sheets/{id}/tabulation.pdf',[ResultSheetController::class, 'tabulation']);
            Route::get('/result-sheets/{id}/export.xlsx',   [ResultSheetController::class, 'export']);
        });
        Route::middleware(['role:admin,accountant', 'module:fees'])->group(function () {
            Route::get('/students/{id}/due-block',                  [DueBlockController::class, 'show']);
            Route::post('/students/{id}/due-block-exemptions',      [DueBlockController::class, 'grant']);
            Route::delete('/students/{id}/due-block-exemptions/{exemptionId}', [DueBlockController::class, 'revoke']);
        });
        Route::middleware(['role:admin,teacher', 'module:period_attendance'])->group(function () {
            Route::get('/teacher/periods/today',     [PeriodAttendanceController::class, 'today']);
            Route::post('/period-attendance',        [PeriodAttendanceController::class, 'store']);
            Route::get('/period-attendance/report',  [PeriodAttendanceController::class, 'report']);
        });
        Route::middleware(['role:admin', 'module:substitution'])->group(function () {
            Route::get('/substitutions/needed',      [SubstitutionController::class, 'needed']);
            Route::apiResource('substitutions',      SubstitutionController::class)->except(['show']);
            Route::get('/routines/available-teachers', [SubstitutionController::class, 'availableTeachers']);
        });
        Route::middleware(['role:admin', 'module:routine'])->group(function () {
            Route::apiResource('routine-blocks',     RoutineBlockController::class)->except(['show']);
        });
        Route::middleware(['role:admin', 'module:question_bank'])->group(function () {
            Route::get('/qb/class-levels',           [QbCurriculumController::class, 'classLevels']);   // QB.1: the admin links a program to a platform class (programs.qb_class_level_id)
        });
        Route::middleware(['role:admin,teacher', 'module:exams'])->group(function () {
            Route::post('/exams/{id}/subjects/{subjectId}/submit', [MarksLockController::class, 'submit']);
            Route::post('/exams/{id}/subjects/{subjectId}/unlock', [MarksLockController::class, 'unlock'])->middleware('role:admin');
        });
        Route::middleware('module:student_leave')->group(function () {
            Route::middleware('role:parent')->group(function () {
                Route::post('/parent/children/{id}/leave-requests', [StudentLeaveController::class, 'store']);
                Route::get('/parent/leave-requests',                [StudentLeaveController::class, 'mine']);
            });
            Route::middleware('role:admin,teacher')->group(function () {
                Route::get('/leave-requests/students',        [StudentLeaveController::class, 'index']);
                Route::patch('/leave-requests/students/{id}',  [StudentLeaveController::class, 'decide']);
            });
        });

        // ── Revision 10: staff, salary & payroll (docs/modules/staff-payroll.md) ─────────────
        // Admin + Accountant prepare/pay; approval rules (maker-checker) are enforced INSIDE the services, not by route role alone.
        Route::middleware(['role:admin,accountant', 'module:hr_payroll'])->prefix('hr')->group(function () {
            Route::apiResource('staff',               StaffController::class);
            Route::apiResource('staff-attendance',    StaffAttendanceController::class)->only(['index', 'store']);
            Route::middleware('role:admin')->group(function () {                // R17: leave (docs/modules/hr-payroll.md) - Admin only; AND-ed with the group's admin,accountant list
                Route::apiResource('leave-types',     LeaveTypeController::class)->except(['show', 'destroy']);
                Route::get('/leaves',                 [LeaveController::class, 'index']);
                Route::post('/leaves',                [LeaveController::class, 'store']);             // Admin applies on behalf of a teacher (user_id) or a staff member (staff_id) - exactly one
                Route::get('/leaves/balance',         [LeaveController::class, 'balance']);           // ?type=teacher|staff&id=
                Route::patch('/leaves/{id}/{action}', [LeaveController::class, 'transition'])->where('action', 'approve|reject|cancel');
            });
            Route::apiResource('salary-components',   SalaryComponentController::class)->except(['show']);
            Route::get('/people/{type}/{id}/salary',  [SalaryStructureController::class, 'history']);
            Route::get('/people/{type}/{id}/pay-accounts', [PayAccountController::class, 'show']);
            Route::put('/people/{type}/{id}/pay-accounts', [PayAccountController::class, 'update']);
            Route::apiResource('revisions',           SalaryRevisionController::class)->only(['index', 'store', 'show']);
            Route::post('/revisions/{id}/approve',    [SalaryRevisionController::class, 'approve']);
            Route::post('/revisions/{id}/reject',     [SalaryRevisionController::class, 'reject']);
            Route::post('/revisions/{id}/cancel',     [SalaryRevisionController::class, 'cancel']);
            Route::get('/revisions/{id}/letter.pdf',  [SalaryRevisionController::class, 'letter']);
            Route::post('/increment-batches/preview', [IncrementBatchController::class, 'preview']);
            Route::post('/increment-batches',         [IncrementBatchController::class, 'store']);
            Route::apiResource('bonus-schemes',       BonusSchemeController::class);
            Route::post('/bonus-schemes/{id}/preview',[BonusSchemeController::class, 'preview']);
            Route::post('/bonus-schemes/{id}/apply',  [BonusSchemeController::class, 'apply']);
            Route::post('/bonus-schemes/{id}/cancel', [BonusSchemeController::class, 'cancel']);
            Route::apiResource('adjustments',         SalaryAdjustmentController::class)->only(['index', 'store']);
            Route::get('/adjustments/suggest-extra-class', [SalaryAdjustmentController::class, 'suggestExtraClass']);
            Route::post('/adjustments/{id}/approve',  [SalaryAdjustmentController::class, 'approve']);
            Route::post('/adjustments/{id}/cancel',   [SalaryAdjustmentController::class, 'cancel']);
            Route::apiResource('advances',            SalaryAdvanceController::class)->only(['index', 'store', 'show']);
            Route::post('/advances/{id}/{action}',    [SalaryAdvanceController::class, 'transition'])->where('action', 'approve|reject|disburse|skip-installment|write-off');
            Route::apiResource('payroll-runs',        PayrollRunController::class)->only(['index', 'store', 'show']);
            Route::post('/payroll-runs/{id}/{action}',[PayrollRunController::class, 'transition'])->where('action', 'recompute|review|approve|reject|cancel|pay');
            Route::patch('/payroll-items/{id}',       [PayrollItemController::class, 'update']);                    // hold | release
            Route::get('/payroll-items/{id}/slip.pdf',[PayrollItemController::class, 'slip']);
            Route::get('/payroll-runs/{id}/{file}',   [PayrollRunController::class, 'download'])->where('file', 'disbursement\\.csv|register\\.xlsx|register\\.pdf');
            Route::post('/final-settlement/{type}/{id}/start', [FinalSettlementController::class, 'start']);
            Route::get('/pf/entries',                 [ProvidentFundController::class, 'index']);
            Route::post('/pf/entries',                [ProvidentFundController::class, 'store']);
            Route::get('/pf/{type}/{id}/statement.pdf',[ProvidentFundController::class, 'statement']);
            Route::get('/reports/{name}',             [PayrollReportController::class, 'show']);
        });

        // ── R16: Release-1 routes the API documents (docs/API.md) but this file lacked - found by the docs-to-routes comparison ──────────────────────────────
        // They sit OUTSIDE the role groups on purpose: a chained role middleware is ANDed with the group's, so a parent route inside `role:admin,teacher` would never be reachable.
        Route::get('/results/marksheet/{studentId}',  [ResultController::class, 'marksheet'])->middleware('role:admin,teacher,parent');   // PDF; a parent only for THEIR child (policy), published exams only
        Route::get('/sms-logs',                       [SmsLogController::class, 'index'])->middleware('role:admin,accountant')->middleware('module:sms');   // cursorPaginate, per_page <= 100
        Route::get('/subscription/sms-credits',       [SmsCreditController::class, 'balance'])->middleware('role:admin');                  // balance + credit transactions
        Route::put('/auth/locale',                    [LoginController::class, 'locale']);                                                  // users.locale; R1 accepts bn|en
        Route::get('/admin/settings/language',        [SettingController::class, 'language'])->middleware('role:admin');
        Route::put('/admin/settings/language',        [SettingController::class, 'updateLanguage'])->middleware('role:admin');

        // ── Revision 12 (full scope, part 2) ───────────────────────────────────────────────────────────────────────────
        // finance-advanced.md
        Route::middleware(['role:admin,accountant', 'module:cashbook'])->group(function () {
            Route::get('/cashbook',                      [CashBookController::class, 'show']);
            Route::get('/cashbook/range',                [CashBookController::class, 'range']);
            Route::get('/cashbook/{date}/report.{ext}',  [CashBookController::class, 'report'])->whereIn('ext', ['pdf', 'xlsx']);
            Route::post('/cashbook/{date}/close',        [CashBookController::class, 'close']);
            Route::post('/cashbook/{date}/reopen',       [CashBookController::class, 'reopen'])->middleware('role:admin');
        });
        Route::middleware(['role:admin,accountant', 'module:fees'])->group(function () {
            Route::get('/fee-refunds/refundable',        [FeeRefundController::class, 'refundable']);
            Route::apiResource('fee-refunds',            FeeRefundController::class)->only(['index', 'store', 'show']);
            Route::post('/fee-refunds/{id}/{action}',    [FeeRefundController::class, 'transition'])->where('action', 'approve|reject|process');
        });
        // inventory.md (plan-gated)
        Route::middleware(['role:admin,accountant', 'module:inventory'])->prefix('inventory')->group(function () {
            Route::apiResource('items',                  InventoryItemController::class)->except(['show']);
            Route::get('/items/{id}/ledger',             [InventoryItemController::class, 'ledger']);
            Route::post('/{type}',                       [InventoryMovementController::class, 'store'])->where('type', 'receive|issue|sale|damage|adjust|return');
            Route::get('/stock',                         [InventoryReportController::class, 'stock']);
            Route::get('/reports/{name}',                [InventoryReportController::class, 'show'])->where('name', 'stock|movements|sales|valuation');
            Route::get('/sales/{receipt_no}/receipt.pdf',[InventoryReportController::class, 'receipt']);
        });
        // attendance-devices.md (plan-gated)
        Route::middleware(['role:admin', 'module:attendance_devices'])->group(function () {
            Route::apiResource('attendance-devices',    AttendanceDeviceController::class)->except(['show', 'destroy']);
            Route::post('/attendance-devices/{id}/{action}', [AttendanceDeviceController::class, 'transition'])->where('action', 'rotate-secret|disable');
            Route::apiResource('person-credentials',    PersonCredentialController::class)->only(['index', 'store']);
            Route::post('/person-credentials/import',    [PersonCredentialController::class, 'import']);
            Route::get('/device-punches',                [DevicePunchReviewController::class, 'index']);
            Route::post('/device-punches/{id}/assign',   [DevicePunchReviewController::class, 'assign']);
            Route::post('/device-punches/reprocess',     [DevicePunchReviewController::class, 'reprocess']);
        });
        // accounting.md (plan-gated, financial-sensitive)
        Route::middleware(['role:admin,accountant', 'module:accounting'])->prefix('accounting')->group(function () {
            Route::apiResource('accounts',               AccountController::class)->except(['show', 'destroy']);
            Route::get('/accounts/tree',                 [AccountController::class, 'tree']);
            Route::apiResource('vouchers',               VoucherController::class)->only(['index', 'store', 'show']);
            Route::post('/vouchers/{id}/{action}',       [VoucherController::class, 'transition'])->where('action', 'post|reverse');
            Route::apiResource('budgets',                BudgetController::class)->except(['destroy']);
            Route::put('/budgets/{id}/lines',            [BudgetController::class, 'lines']);
            Route::post('/budgets/{id}/approve',         [BudgetController::class, 'approve']);
            Route::get('/reports/{name}',                [AccountingReportController::class, 'show'])->where('name', 'trial-balance|ledger|income-expenditure|balance-sheet|budget-actual|unposted');
            Route::get('/bank-reconciliation/{account_id}', [BankReconciliationController::class, 'show']);
            Route::post('/bank-reconciliation/{account_id}/{action}', [BankReconciliationController::class, 'act'])->where('action', 'import|match|unmatch');
            Route::post('/opening-balances',             [AccountingSettingController::class, 'opening']);
            Route::post('/repost',                       [AccountingSettingController::class, 'repost']);
            Route::put('/settings',                      [AccountingSettingController::class, 'update']);
        });
        // donations.md (opt-in)
        Route::middleware(['role:admin,accountant', 'module:donations'])->group(function () {
            Route::apiResource('donors',                 DonorController::class);
            Route::get('/donors/{id}/statement.pdf',     [DonorController::class, 'statement']);
            Route::apiResource('donation-funds',         DonationFundController::class)->except(['destroy']);
            Route::get('/donation-funds/{id}/statement', [DonationFundController::class, 'statement']);
            Route::apiResource('donation-campaigns',     DonationCampaignController::class)->except(['destroy']);
            Route::get('/donation-campaigns/{id}/progress', [DonationCampaignController::class, 'progress']);
            Route::apiResource('donations',              DonationController::class)->only(['index', 'store', 'show']);
            Route::post('/donations/{id}/reverse',       [DonationController::class, 'reverse']);
            Route::get('/donations/{id}/receipt.pdf',    [DonationController::class, 'receipt']);
        });
        // madrasa.md (opt-in)
        Route::middleware(['role:admin,teacher', 'module:hifz'])->prefix('hifz')->group(function () {
            Route::apiResource('records',                HifzController::class)->except(['show']);
            Route::get('/students/{id}/progress',        [HifzController::class, 'progress']);
            Route::get('/batches/{id}/overview',         [HifzController::class, 'overview']);
            Route::get('/reports/monthly.pdf',           [HifzController::class, 'monthlyReport']);
        });
        Route::middleware(['role:parent', 'module:hifz'])->get('/parent/children/{id}/hifz', [HifzController::class, 'forParent']);
        // syllabus.md
        Route::middleware(['role:admin,teacher', 'module:syllabus'])->prefix('syllabus')->group(function () {
            Route::apiResource('units',                  SyllabusUnitController::class)->except(['show']);
            Route::post('/units/clone',                  [SyllabusUnitController::class, 'clone']);
            Route::post('/units/import',                 [SyllabusUnitController::class, 'import']);
            Route::post('/coverage',                     [SyllabusCoverageController::class, 'store']);
            Route::delete('/coverage',                   [SyllabusCoverageController::class, 'destroy']);
            Route::get('/coverage',                      [SyllabusCoverageController::class, 'index']);
            Route::get('/overview',                      [SyllabusCoverageController::class, 'overview']);
            Route::get('/behind',                        [SyllabusCoverageController::class, 'behind']);
        });
        Route::middleware(['role:admin,teacher', 'module:syllabus'])->group(function () {
            Route::apiResource('lesson-plans',           LessonPlanController::class)->except(['show']);
            Route::post('/lesson-plans/{id}/{state}',    [LessonPlanController::class, 'mark'])->where('state', 'taught|skipped');
        });
        Route::middleware(['role:parent', 'module:syllabus'])->get('/parent/children/{id}/syllabus', [SyllabusCoverageController::class, 'forParent']);
        // risk-alerts.md
        Route::middleware(['role:admin,teacher', 'module:risk_alerts'])->prefix('risk')->group(function () {
            Route::get('/flags',                         [RiskController::class, 'index']);
            Route::get('/students/{id}',                 [RiskController::class, 'student']);
            Route::post('/flags/{id}/{action}',          [RiskController::class, 'transition'])->where('action', 'acknowledge|resolve');
            Route::get('/settings',                      [RiskController::class, 'settings'])->middleware('role:admin');
            Route::put('/settings',                      [RiskController::class, 'updateSettings'])->middleware('role:admin');
            Route::post('/evaluate',                     [RiskController::class, 'evaluate'])->middleware('role:admin');
        });
        // admission-cycle.md
        Route::middleware(['role:admin', 'module:admission_cycle'])->prefix('admission')->group(function () {
            Route::apiResource('cycles',                 AdmissionCycleController::class)->except(['destroy']);
            Route::post('/cycles/{id}/{action}',         [AdmissionCycleController::class, 'transition'])->where('action', 'open|freeze|close');
            Route::post('/cycles/{id}/test-marks',       [AdmissionCycleController::class, 'testMarks']);
            Route::post('/cycles/{id}/list/{mode}',      [AdmissionCycleController::class, 'list'])->where('mode', 'merit|lottery');
            Route::get('/cycles/{id}/draw',              [AdmissionCycleController::class, 'draw']);
            Route::post('/leads/{id}/{action}',          [AdmissionLeadActionController::class, 'act'])->where('action', 'confirm|decline|admit');
        });
        // data-migration.md
        Route::middleware(['role:admin', 'module:data_migration'])->prefix('imports')->group(function () {
            Route::get('/',                              [ImportController::class, 'index']);
            Route::post('/',                             [ImportController::class, 'store']);
            Route::get('/templates/{kind}.xlsx',         [ImportController::class, 'template']);
            Route::get('/{id}',                          [ImportController::class, 'show']);
            Route::put('/{id}/mapping',                  [ImportController::class, 'mapping']);
            Route::post('/{id}/{action}',                [ImportController::class, 'transition'])->where('action', 'dry-run|run|rollback');
            Route::get('/{id}/errors.xlsx',              [ImportController::class, 'errors']);
        });
        // communication-plus.md (module sms / notices)
        Route::middleware(['role:admin,accountant', 'module:sms'])->prefix('sms')->group(function () {
            Route::apiResource('templates',              SmsTemplateController::class)->except(['show', 'destroy']);
            Route::post('/templates/{id}/preview',       [SmsTemplateController::class, 'preview']);
            Route::apiResource('campaigns',              SmsCampaignController::class)->except(['update', 'destroy']);
            Route::post('/campaigns/{id}/{action}',      [SmsCampaignController::class, 'transition'])->where('action', 'estimate|schedule|send|cancel');
            Route::get('/campaigns/{id}/report',         [SmsCampaignController::class, 'report']);
        });
        Route::middleware(['role:admin', 'module:sms'])->prefix('sms/emergency')->group(function () {
            Route::get('/estimate',                      [EmergencyController::class, 'estimate']);
            Route::post('/',                             [EmergencyController::class, 'send']);
        });
        Route::middleware('module:notices')->post('/notices/{id}/ack', [NoticeAckController::class, 'ack']);
        Route::middleware(['role:admin,teacher', 'module:notices'])->group(function () {
            Route::get('/notices/{id}/receipts',         [NoticeAckController::class, 'receipts']);
            Route::post('/notices/{id}/remind-missing',  [NoticeAckController::class, 'remindMissing']);
        });
        // platform-ops.md - tenant side (support, export, coupon check, leaving an impersonated session)
        Route::middleware(['role:admin', 'module:support'])->prefix('support')->group(function () {
            Route::get('/tickets',                       [SupportTicketController::class, 'index']);
            Route::post('/tickets',                      [SupportTicketController::class, 'store']);
            Route::get('/tickets/{id}',                  [SupportTicketController::class, 'show']);
            Route::post('/tickets/{id}/{action}',        [SupportTicketController::class, 'transition'])->where('action', 'messages|close|reopen|rate|grant-access');
        });
        Route::middleware('role:admin')->group(function () {
            Route::get('/admin/exports',                 [ExportController::class, 'index']);
            Route::post('/admin/exports',                [ExportController::class, 'store']);
            Route::get('/admin/exports/{id}',            [ExportController::class, 'show']);
            Route::get('/admin/exports/{id}/download',   [ExportController::class, 'download']);
            Route::post('/subscription/coupon/validate', [CouponController::class, 'validateCode']);
        });
        Route::post('/auth/impersonate/end',             [ImpersonationController::class, 'end']);
        // quick-wins.md: personal accessibility preferences (any role)
        Route::put('/auth/ui-preferences',               [LoginController::class, 'uiPreferences']);

        // ── Accountant (dashboard & financial reports are NOT payroll: no module:hr_payroll gate) ─────
        Route::middleware(['role:accountant', 'module:reports'])->group(function () {
            Route::get('/accountant/dashboard',   [DashboardController::class, 'accountant']);
            Route::get('/accountant/reports/{type}', [ReportController::class, 'financial']);
        });

        // ── Teacher ───────────────────────────────────────────
        Route::middleware('role:teacher')->group(function () {
            Route::get('/teacher/dashboard',      [DashboardController::class, 'teacher']);
            Route::get('/teacher/routine/today',  [RoutineController::class, 'today']);
            Route::get('/teacher/batches',        [BatchController::class, 'mine']);           // batches this teacher teaches
            Route::middleware('module:homework')->group(function () {
                Route::apiResource('homework',    HomeworkController::class);                  // body: program_id, batch_id? (Targeting Rule)
            });
            Route::apiResource('materials',       MaterialController::class);
            Route::middleware('module:hr_payroll')->group(function () {          // own pay only (SalaryPolicy)
                Route::get('/teacher/salary',                   [TeacherSalaryController::class, 'summary']);
                Route::get('/teacher/salary/slips',             [TeacherSalaryController::class, 'slips']);
                Route::get('/teacher/salary/slips/{id}.pdf',    [TeacherSalaryController::class, 'slip']);
                Route::get('/teacher/salary/advances',          [TeacherSalaryController::class, 'advances']);
                Route::get('/teacher/salary/history',           [TeacherSalaryController::class, 'history']);
                Route::get('/teacher/leave',                    [LeaveController::class, 'mine']);              // R17: a teacher's own leave applications and balance
                Route::post('/teacher/leave',                   [LeaveController::class, 'apply']);
            });
        });

        // ── Student ───────────────────────────────────────────
        Route::middleware('role:student')->group(function () {
            Route::get('/student/dashboard',      [DashboardController::class, 'student']);
            Route::get('/student/routine',        [RoutineController::class, 'forStudent']);
            Route::get('/student/results',        [ResultController::class, 'forStudent']);
            Route::get('/student/attendance',     [AttendanceController::class, 'forStudent']);
        });

        // R16: the marksheet PDF is for everyone who may legitimately hold it - NOT only the student role (which Release 1 does not ship). The controller authorises by ResultPolicy:
        //   admin/teacher: any student of the tenant | parent: ONLY own child (parent_student) and ONLY exams already published | student: self. Wrong child = 404, never 403 (no existence leak).
        Route::middleware('role:admin,teacher,parent,student')->get('/results/marksheet/{studentId}', [ResultController::class, 'marksheet']);   // ?exam_id=

        // ── Parent ────────────────────────────────────────────
        Route::middleware('role:parent')->group(function () {
            Route::get('/parent/children',        [DashboardController::class, 'parentChildren']);
            Route::get('/parent/consents',        [ConsentController::class, 'mine']);
            Route::put('/parent/consents/{type}', [ConsentController::class, 'update']);
            Route::get('/parent/children/{id}/export', [StudentPrivacyController::class, 'export']);
            Route::get('/parent/dashboard',       [DashboardController::class, 'parent']);
            Route::get('/parent/fees',            [FeeController::class, 'dues']);
            // R16: what a parent portal must actually show. Ownership via parent_student; results only for PUBLISHED exams; a different child's id is 404.
            Route::get('/parent/children/{id}/attendance', [AttendanceController::class, 'forParent']);      // ?month=YYYY-MM  (uses getStudentSummary)
            Route::get('/parent/children/{id}/results',    [ResultController::class,     'forParent']);
            Route::get('/parent/transport',       [TransportController::class, 'myChildTransport'])->middleware('module:transport');
            Route::middleware('module:online_payment')->group(function () {
                Route::get('/parent/fees/payment-options',   [FeePaymentController::class, 'options']);
                Route::post('/fees/payment/{gateway}/create',[FeePaymentController::class, 'create'])->where('gateway', '[a-z0-9_]+')->middleware('throttle:5,1');   // gateway validated against GatewayRegistry::enabledKeys() in the controller - never hardcode a list here
                Route::get('/parent/online-payments/{ref}',  [FeePaymentController::class, 'status']);
            });
        });

        // ── Phase 7 modules: one group per module, paths from docs/API.md ──
        // Route::middleware('module:library')->group(...);   Route::middleware('module:hostel')->group(...); ... etc.
    });
});
```
- Rate limiters `login` (5/min per IP+login), `api` (plan অনুযায়ী) ও `device` / `verify` / `public` / `admission-pay` / `sms-webhook` (R12; limits are settings, set from Spike measurements - not guessed), `admission` (`PUBLIC_ADMISSION_RATE_PER_HOUR`/ঘণ্টা per institution+IP) `AppServiceProvider::boot()`-এ `RateLimiter::for()` দিয়ে define করুন (`README` Revision 4 "Rate Limiting"; `.env` `RATE_LIMIT_*`)।
- **routes-এ কোনো closure নেই** (closure থাকলে `route:cache` ব্যর্থ হয়; `/health` তাই invokable `HealthController`)। `php artisan route:list` -এ কোনো route name duplicate থাকলে `route:cache` ব্যর্থ হয় — তাই প্রতিটি `apiResource` একবারই।

## app/Http/Controllers/Public/HealthController.php — Full Code
```php
<?php
namespace App\Http\Controllers\Public;

use Illuminate\Support\Facades\{Cache, DB};

class HealthController
{
    public function __invoke()
    {
        $ok = fn (callable $f) => rescue(fn () => (bool) $f(), false, false) ? 'ok' : 'error';
        $checks = [
            'db'    => $ok(fn () => DB::connection()->getPdo()),
            'redis' => $ok(fn () => Cache::store('redis')->put('health:ping', 'pong', 5)),
        ];
        $healthy = !in_array('error', $checks, true);
        return response()->json(['status' => $healthy ? 'ok' : 'degraded', ...$checks, 'time' => now()->toISOString()], $healthy ? 200 : 503);
    }
}
```
UptimeRobot ও CI "Done When" এই endpoint ব্যবহার করে (বিনা token-এ); `503` হলে alert।

## app/Providers/AppServiceProvider.php — Full Code
```php
<?php
namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Database\Eloquent\Model;
use App\Observers\StudentObserver;
use App\Observers\FeePaymentObserver;
use App\Models\{Student, FeePayment};

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Services singleton binding
        $this->app->singleton(\App\Services\SmsService::class);
        $this->app->singleton(\App\Services\PdfService::class);
        $this->app->singleton(\App\Services\TenantService::class);
        $this->app->singleton(\App\Services\NotificationService::class);
    }

    public function boot(): void
    {
        // Prevent N+1 queries in production
        Model::preventLazyLoading(! app()->isProduction());

        // Observers — cache invalidation
        Student::observe(StudentObserver::class);
        FeePayment::observe(FeePaymentObserver::class);

        // Macro — paginated response helper
        \Illuminate\Http\Request::macro('perPage', fn($default = 20) =>
            min((int) $this->input('per_page', $default), 100)
        );
    }
}
```

## bootstrap/app.php — Middleware Registration
```php
<?php
use App\Http\Middleware\{TenantMiddleware, RoleMiddleware, SubscriptionCheck, AcademicYearMiddleware,
    EnsureUserBelongsToTenant, ModuleMiddleware, FeatureMiddleware, PlatformScope};

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        // Public website pages (/, /notices, /admission, /robots.txt, /sitemap.xml): no session/CSRF — docs/modules/public-website.md
        then: fn () => \Illuminate\Support\Facades\Route::middleware('tenant:optional')->group(base_path('routes/public.php')),
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'tenant'       => TenantMiddleware::class,        // modes: tenant | tenant:optional | tenant:central
            'tenant.user'  => EnsureUserBelongsToTenant::class,
            'tenancy.bypass' => PlatformScope::class,        // Super Admin /super/* only - see "Tenant Isolation, Fail-Closed"
            'module'       => ModuleMiddleware::class,
            'feature'      => FeatureMiddleware::class,
            'role'         => RoleMiddleware::class,
            'subscription' => SubscriptionCheck::class,
            'device.auth'  => DeviceAuth::class,             // R12: HMAC-signed punches from attendance devices (docs/modules/attendance-devices.md)
            'academic_year'=> AcademicYearMiddleware::class,
        ]);
        $middleware->throttleWithRedis();
    })
    ->create();
```

## app/Observers/StudentObserver.php
```php
<?php
namespace App\Observers;

use App\Models\Student;
use Illuminate\Support\Facades\Cache;

class StudentObserver
{
    public function created(Student $student): void
    {
        Cache::forget("dashboard:{$student->institution_id}");
        Cache::forget("student_count:{$student->institution_id}");
    }

    public function updated(Student $student): void
    {
        Cache::forget("student:{$student->id}");
    }

    public function deleted(Student $student): void
    {
        Cache::forget("dashboard:{$student->institution_id}");
        Cache::forget("student:{$student->id}");
    }
}
```

---

## app/Http/Middleware/TenantMiddleware.php — Full Code (Revision 6)
Tenant শুধুমাত্র request-এর `Host` থেকে resolve হয় — কোনো client-supplied header বিশ্বাস করা হয় না। Middleware তিন mode-এ চলে: `tenant` (required), `tenant:optional`, `tenant:central` (উপরের routes/api.php-এর টেবিল দেখুন)।

```php
<?php
namespace App\Http\Middleware;

use App\Services\Tenancy\TenantResolver;
use Closure;
use Illuminate\Http\Request;

class TenantMiddleware
{
    // Paths a SUSPENDED institution may still reach (to see why and to pay)
    private const SUSPENDED_ALLOWED = ['api/v1/auth/*', 'api/v1/bootstrap', 'api/v1/health', 'api/v1/subscription*', 'api/v1/billing/*'];

    public function __construct(private TenantResolver $resolver) {}

    public function handle(Request $request, Closure $next, string $mode = 'required')
    {
        $host    = strtolower($request->getHost());
        $central = $this->resolver->isCentralHost($host);

        if ($mode === 'central') {
            return $central ? $next($request) : $this->fail('not_found', 'Not found', 404);
        }

        if ($central) {
            // optional: login/bootstrap/health on the central host (no tenant bound)
            return $mode === 'optional'
                ? $next($request)
                : $this->fail('institution_not_found', 'Institution not found for this domain', 404);
        }

        $institution = $this->resolver->resolve($host);
        if (!$institution) {
            return $this->fail('institution_not_found', 'Institution not found for this domain', 404);
        }

        if ($institution->status === 'suspended' && !$request->is(...self::SUSPENDED_ALLOWED)) {
            return $this->fail('institution_suspended', 'এই প্রতিষ্ঠানের অ্যাকাউন্ট স্থগিত আছে', 403);
        }

        app()->instance('currentInstitution', $institution);
        return $next($request);
    }

    /** Never leave a tenant bound after the response (long-lived workers / Octane) */
    public function terminate($request, $response): void { app()->forgetInstance('currentInstitution'); }

    private function fail(string $error, string $message, int $status)
    {
        return response()->json(['success' => false, 'error' => $error, 'message' => $message], $status);
    }
}
```
`bootstrap/app.php` alias: `'tenant' => TenantMiddleware::class` (mode `:optional` / `:central` route-এ পাস হয়)।

## app/Services/Tenancy/TenantResolver.php — Full Code (Revision 6)
```php
<?php
namespace App\Services\Tenancy;

use App\Models\Institution;
use App\Models\InstitutionDomain;
use Illuminate\Support\Facades\Cache;

class TenantResolver
{
    public function isCentralHost(string $host): bool
    {
        return in_array($host, config('tenancy.central_domains'), true);
    }

    public function resolve(string $host): ?Institution
    {
        $id = Cache::remember("tenant:host:{$host}", 600, fn () => $this->lookupId($host));

        return $id ? Institution::find($id) : null;
    }

    private function lookupId(string $host): ?int
    {
        $base = '.' . config('tenancy.base_domain');

        // 1. Platform subdomain: {slug}.APP_BASE_DOMAIN (exactly one label)
        if (str_ends_with($host, $base)) {
            $slug = substr($host, 0, -strlen($base));
            if ($slug === '' || str_contains($slug, '.')
                || in_array($slug, config('tenancy.reserved_slugs'), true)) {
                return null;
            }
            return Institution::where('slug', $slug)->value('id');
        }

        // 2. Custom domain: must be ACTIVE in institution_domains
        return InstitutionDomain::anyInstitution()
            ->where('domain', $host)
            ->where('status', 'active')
            ->value('institution_id');
    }

    public function forget(string $host): void
    {
        Cache::forget("tenant:host:{$host}");
    }
}
```

## config/tenancy.php — Full Code (Revision 6)
```php
<?php
return [
    'base_domain'     => env('APP_BASE_DOMAIN', 'schoolapp.com'),
    'central_domains' => array_filter(explode(',', env('CENTRAL_DOMAINS', 'schoolapp.com'))),
    'super_admin_domain' => env('SUPER_ADMIN_DOMAIN', 'admin.schoolapp.com'),
    'cname_target'    => env('DOMAIN_CNAME_TARGET', 'domains.schoolapp.com'),
    'a_target'        => env('DOMAIN_A_TARGET'),
    'require_approval'=> env('DOMAIN_REQUIRE_APPROVAL', true),
    'max_domains'     => env('DOMAIN_MAX_PER_INSTITUTION', 2),
    // Who may call /api/internal/* (Caddy's on-demand TLS "ask"). Host install: loopback. Docker compose: add the compose network, e.g. 172.16.0.0/12
    'internal_ips'    => array_filter(explode(',', env('INTERNAL_IPS', '127.0.0.1,::1'))),
    // A tenant can never take these slugs
    'reserved_slugs'  => ['www','admin','api','app','mail','smtp','ftp','domains','cdn','static',
                          'assets','status','support','help','blog','docs','demo','test','staging','dev'],
];
```

## app/Http/Middleware/RoleMiddleware.php — Full Code (Revision 6)
এটি তিনটি নিয়ম প্রয়োগ করে: (১) role মিলতে হবে, (২) `super_admin` শুধু central host-এ, বাকি সবাই শুধু নিজের tenant host-এ, (৩) institution type যে role অনুমোদন করে না (যেমন private_batch-এ `teacher`) সেটি বাতিল। Authorization শুধু `users.role` + এই middleware দিয়ে — spatie/laravel-permission ব্যবহার হয় না (`docs/LOCKED-DECISIONS.md` D17)।

```php
<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = auth()->user();
        if (!$user) return $this->fail('unauthenticated', 'Please login to continue', 401);

        if (!in_array($user->role, $roles, true)) {
            return $this->fail('forbidden', 'You do not have permission to perform this action', 403);
        }

        $tenant = app()->bound('currentInstitution') ? app('currentInstitution') : null;

        if ($user->role === 'super_admin') {
            // Super Admin never acts inside a tenant host
            if ($tenant) return $this->fail('forbidden_host', 'Super Admin can only be used on the admin domain', 403);
            return $next($request);
        }

        // Every other role must be on its own tenant host
        if (!$tenant || (int) $user->institution_id !== (int) $tenant->id) {
            return $this->fail('institution_mismatch', 'Access denied — institution mismatch', 403);
        }
        if (!in_array($user->role, config("institution_types.{$tenant->institution_type}.roles", []), true)) {
            return $this->fail('role_not_available', 'This role is not available for this institution type', 403);
        }

        return $next($request);
    }

    private function fail(string $error, string $message, int $status)
    {
        return response()->json(['success' => false, 'error' => $error, 'message' => $message], $status);
    }
}
```
Shared tenant route-গুলো (role middleware ছাড়া) `tenant` + `auth:sanctum` দিয়ে সুরক্ষিত; কিন্তু সেখানেও `user.institution_id === tenant.id` মিলতে হবে — তাই `bootstrap/app.php`-এ `auth:sanctum`-এর পরে একটি ছোট `EnsureUserBelongsToTenant` middleware (উপরের tenant-match চেক) `subscription`-এর আগে বসান এবং routes/api.php-এর tenant group-এ `['tenant', 'auth:sanctum', 'tenant.user', 'subscription', …]` ব্যবহার করুন (alias `tenant.user`)।

## app/Http/Middleware/EnsureUserBelongsToTenant.php — Full Code (Revision 6)
```php
<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureUserBelongsToTenant
{
    public function handle(Request $request, Closure $next)
    {
        $user   = $request->user();
        $tenant = app('currentInstitution');          // `tenant` middleware ran first, so this is bound
        if (!$user || $user->role === 'super_admin' || (int) $user->institution_id !== (int) $tenant->id) {
            return response()->json(['success' => false, 'error' => 'institution_mismatch',
                                     'message' => 'Access denied — institution mismatch'], 403);
        }
        return $next($request);
    }
}
```
`ModuleMiddleware` / `FeatureMiddleware`: `handle($request, $next, string $key)` → `app(ModuleGate::class)->allows(app('currentInstitution'), $key)` / `->feature(...)`; false হলে `docs/modules/institution-types.md`-এ বর্ণিত 403 response।

## app/Http/Middleware/SubscriptionCheck.php — Full Code (Revision 6)
শুধু তিনটি কাজ: মেয়াদ, student সংখ্যার সীমা, batch সংখ্যার সীমা। **Module/feature চেক এখানে নেই** — সেগুলো route-এর `module:x` / `feature:x` middleware (`ModuleGate`, `docs/modules/institution-types.md`)। Bypass পথ-ভিত্তিক (route name নয়, কারণ route গুলো named নয়)।

```php
<?php
namespace App\Http\Middleware;

use App\Models\{Batch, Student};
use Closure;
use Illuminate\Http\Request;

class SubscriptionCheck
{
    // Expired institutions must still be able to log in, see their status and pay
    private const BYPASS = ['api/v1/auth/*', 'api/v1/subscription*', 'api/v1/billing/*', 'api/v1/health', 'api/v1/bootstrap'];
    private const GRACE_DAYS = 3;

    public function handle(Request $request, Closure $next)
    {
        if (auth()->user()?->role === 'super_admin') return $next($request);

        $institution = app()->bound('currentInstitution') ? app('currentInstitution') : null;
        if (!$institution || $request->is(...self::BYPASS)) return $next($request);

        $plan = $institution->subscriptionPlan;

        // 1. Expired and grace period over → block everything except BYPASS
        $expires = $institution->subscription_expires_at;
        if ($expires && $expires->copy()->addDays(self::GRACE_DAYS)->isPast()) {
            return response()->json([
                'success' => false, 'error' => 'subscription_expired',
                'message' => 'Your subscription has expired. Please renew to continue.',
                'expired_at' => $expires, 'renew_url' => url('/admin/subscription'),
            ], 403);
        }

        // 2. Student limit — counts ACTIVE students only (a student with several enrollments counts once)
        if ($request->isMethod('POST') && $request->routeIs('students.store')) {
            $max = $plan?->max_students ?? -1;
            $current = Student::where('status', 'active')->count();
            if ($max !== -1 && $current >= $max) {
                return response()->json([
                    'success' => false, 'error' => 'student_limit_reached',
                    'message' => "Student limit ({$max}) reached. Please upgrade your plan.",
                    'current' => $current, 'limit' => $max,
                ], 403);
            }
        }

        // 3. Batch limit — upcoming + running batches
        if ($request->isMethod('POST') && $request->routeIs('batches.store')) {
            $max = $plan?->max_batches ?? -1;
            $current = Batch::whereIn('status', ['upcoming', 'running'])->count();
            if ($max !== -1 && $current >= $max) {
                return response()->json([
                    'success' => false, 'error' => 'batch_limit_reached',
                    'message' => "Batch limit ({$max}) reached. Please upgrade your plan.",
                    'current' => $current, 'limit' => $max,
                ], 403);
            }
        }

        return $next($request);
    }
}
```
Frontend: `batch_limit_reached` axios interceptor-এ `student_limit_reached`-এর মতোই toast/upgrade modal (`docs/templates/react-core-files.md`)।

## app/Models/Institution.php — Full Code (Revision 6)
`Institution` নিজেই tenant, তাই `BelongsToInstitution` নেই। Relation-এর নাম এই ফাইলের বাইরের সব spec-এ ব্যবহৃত: `subscriptionPlan()` (মূল) ও `plan()` (alias), `domains()`, `admins()`।

```php
<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Institution extends Model
{
    protected $fillable = [
        'name','slug','institution_type','logo_path','favicon_path','address','phone','email','subscription_plan_id',
        'subscription_expires_at','status','enabled_modules','terminology','settings','sms_balance',
        'onboarding_completed','onboarding_step','primary_color','secondary_color','accent_color',
        'logo_path','favicon_path','theme_mode','theme_preset_id','layout_key','theme_tokens',
        'theme_updated_by','theme_updated_at','parent_institution_id','branch_name','is_head_office',
    ];

    protected $casts = [
        'enabled_modules' => 'array', 'terminology' => 'array', 'settings' => 'array', 'theme_tokens' => 'array',
        'subscription_expires_at' => 'datetime', 'theme_updated_at' => 'datetime',
        'onboarding_completed' => 'boolean', 'is_head_office' => 'boolean',
    ];

    public function subscriptionPlan() { return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id'); }
    public function plan()             { return $this->subscriptionPlan(); }   // alias used by ModuleGate / ThemeService
    public function domains()          { return $this->hasMany(InstitutionDomain::class); }
    public function admins()           { return $this->hasMany(User::class)->where('role', 'admin'); }
    public function themePreset()      { return $this->belongsTo(ThemePreset::class, 'theme_preset_id'); }
    public function parent()           { return $this->belongsTo(self::class, 'parent_institution_id'); }
}
```
`SubscriptionPlan`-এ `features` ও `Program`/`Batch`-এ `schedule` কলামে `'array'` cast; `ThemePreset.tokens`/`allowed_types` array cast।

## app/Services/FeeService.php — Full Code

`FeeService` — **একটিই সংস্করণ** (Revision 7): বকেয়া গণনা হয় (enrollment × fee category × সময়কাল), একটি রসিদে একাধিক line, রসিদ নম্বর atomic, অনলাইন পেমেন্টের জন্য `recordOnlinePayment`। বকেয়ার key `"{enrollment_id}:{fee_category_id}:{period}"` — `period` = `YYYY-MM` (monthly), `YYYY` (yearly), `once` — এবং এটি `fee_payments.month`-এ (VARCHAR(7)) যায়। কাউন্টারের ক্যাশ ও অভিভাবকের অনলাইন পেমেন্ট — দুটোই এই key দিয়ে চলে।

```php
<?php
namespace App\Services;

use App\Jobs\SendSmsJob;
use App\Models\{Enrollment, FeeCategory, FeePayment, FeeStructure, FeeWaiver, Institution, OnlinePayment, Student};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class FeeService
{
    /** amount for one enrollment x category. null = category does not apply to this enrollment. */
    public function resolveAmount(Enrollment $e, FeeCategory $c): ?float
    {
        // order: fee_override (monthly tuition only) > batch.monthly_fee (monthly only) > fee_structures(batch) > fee_structures(program) > category.amount
        $isTuition = $c->frequency === 'monthly';
        // fee_structures is per academic year (academic_year_id is part of its unique key; 0 = not tied to a year). Without this filter a fee change
        // that adds a row for the new year would make ->value('amount') return an arbitrary row (found by running the schema, R10 verification).
        $year   = (int) ($e->academic_year_id ?? 0);
        $byYear = fn ($q) => $q->whereIn('academic_year_id', array_unique([$year, 0]))->orderByDesc('academic_year_id');   // year-specific row beats the 'no year' row
        $amount = ($isTuition ? $e->fee_override : null)
            ?? ($isTuition ? $e->batch->monthly_fee : null)
            ?? $byYear(FeeStructure::where('batch_id', $e->batch_id)->where('fee_category_id', $c->id))->value('amount')
            ?? $byYear(FeeStructure::where('batch_id', 0)->where('program_id', $e->program_id)->where('fee_category_id', $c->id))->value('amount');

        if ($amount === null) {
            if ($c->applicable_to === 'program_specific') return null;   // needs an explicit fee_structures row
            $amount = $c->amount;
        }
        return $amount > 0 ? (float) $amount : null;
    }

    public function discountFor(Student $s, FeeCategory $c, float $gross): float
    {
        $d = 0.0;
        $waiver = FeeWaiver::where('student_id', $s->id)->where('fee_category_id', $c->id)->where('status', 'approved')->first();
        if ($waiver) $d = max($d, (float) ($waiver->waiver_amount ?? 0));
        $sib = $this->calculateSiblingDiscount($s->id);
        if ($sib > 0) $d = max($d, $gross * $sib / 100);
        return round(min($d, $gross), 2);
    }

    /** Periods a category is due for, for one enrollment. Monthly: from the enrollment month (at most 12 months back) to now. */
    private function periodsFor(FeeCategory $c, Enrollment $e): array
    {
        return match ($c->frequency) {
            'once'   => ['once'],
            'yearly' => [now()->format('Y')],
            default  => collect(range(0, 11))
                            ->map(fn ($i) => now()->subMonths($i)->startOfMonth())
                            ->filter(fn ($m) => $m->gte($e->enrolled_at->copy()->startOfMonth()))
                            ->map(fn ($m) => $m->format('Y-m'))->sort()->values()->all(),
        };
    }

    /** Every unpaid due of a student across ALL active enrollments */
    public function dueLines(Student $s): Collection
    {
        $categories = FeeCategory::all();
        $prorate = (app('currentInstitution')->settings['fee_proration'] ?? 'none') === 'half_after_15';
        $lines = collect();

        foreach ($s->activeEnrollments()->with(['batch', 'program'])->get() as $e) {
            foreach ($categories as $c) {
                $gross = $this->resolveAmount($e, $c);
                if ($gross === null) continue;
                foreach ($this->periodsFor($c, $e) as $period) {
                    $paid = FeePayment::where('enrollment_id', $e->id)->where('fee_category_id', $c->id)->where('month', $period)->get();
                    if ($paid->where('status', 'waived')->isNotEmpty()) continue;                 // a waived due is settled
                    // R10 / D32: settlement is judged by the NET paid amount (reversal lines are negative paid_amount, status 'reversed'),
                    // never by 'a paid row exists' - otherwise a refunded fee would never become due again.

                    $g = ($prorate && $c->frequency === 'monthly' && $period === $e->enrolled_at->format('Y-m') && $e->enrolled_at->day > 15)
                            ? round($gross / 2, 2) : $gross;
                    $disc    = $this->discountFor($s, $c, $g);
                    $payable = round($g - $disc - $paid->sum('paid_amount'), 2);       // net of earlier partial payments AND reversal lines
                    if ($payable <= 0) continue;

                    $lines->push([
                        'key' => "{$e->id}:{$c->id}:{$period}", 'enrollment_id' => $e->id, 'batch_id' => $e->batch_id,
                        'fee_category_id' => $c->id, 'category' => $c->name, 'period' => $period,
                        'gross' => $g, 'discount' => $disc, 'amount' => $payable,
                    ]);
                }
            }
        }
        return $lines;
    }

    /** Validates keys against the student's real dues and returns the payable lines (used by online payment) */
    public function outstandingItems(Student $s, array $dueKeys): array
    {
        $all = $this->dueLines($s)->keyBy('key');
        return collect($dueKeys)->unique()->map(function ($k) use ($all) {
            abort_unless($all->has($k), 422, 'কিছু বকেয়া আর প্রযোজ্য নয়, পাতা রিফ্রেশ করুন');
            $l = $all[$k];
            return ['enrollment_id' => $l['enrollment_id'], 'batch_id' => $l['batch_id'], 'fee_category_id' => $l['fee_category_id'],
                    'month' => $l['period'], 'gross' => $l['gross'], 'discount' => $l['discount'], 'amount' => $l['amount']];
        })->values()->all();
    }

    /** Cash / manual collection at the counter: several dues -> ONE receipt. $lines = [['key'=>..., 'paid_amount'=>? (<= due)], ...] */
    public function collect(Student $s, array $lines, string $method = 'cash'): Collection
    {
        return DB::transaction(function () use ($s, $lines, $method) {
            $dues    = $this->dueLines($s)->keyBy('key');
            $receipt = $this->nextReceiptNo();
            $n = 0;
            $rows = collect($lines)->map(function ($l) use ($s, $dues, $method, $receipt, &$n) {
                abort_unless($dues->has($l['key']), 422, 'বকেয়াটি আর প্রযোজ্য নয়');
                $d    = $dues[$l['key']];
                $paid = min((float) ($l['paid_amount'] ?? $d['amount']), $d['amount']);
                return FeePayment::create([
                    'institution_id' => app('currentInstitution')->id, 'student_id' => $s->id,
                    'enrollment_id' => $d['enrollment_id'], 'batch_id' => $d['batch_id'], 'fee_category_id' => $d['fee_category_id'],
                    'amount' => $d['gross'], 'discount' => $d['discount'], 'paid_amount' => $paid, 'month' => $d['period'],
                    'payment_method' => $method, 'receipt_no' => $receipt, 'line_no' => ++$n,
                    'paid_at' => now(), 'collected_by' => auth()->id(),
                    'status' => $paid >= $d['amount'] ? 'paid' : 'partial',
                ]);
            });
            $total = $rows->sum('paid_amount');
            SendSmsJob::dispatch($s->guardian_phone, "BDT {$total} received. Receipt: {$receipt}.", app('currentInstitution')->id)->afterCommit();   // sender + suffix: SmsService::compose()
            return $rows;
        });
    }

    /** Called ONLY from OnlinePaymentService::finalize() (inside its transaction) */
    public function recordOnlinePayment(OnlinePayment $p, ?string $trxId): void
    {
        $receipt = $this->nextReceiptNo();
        foreach (collect($p->items)->values() as $i => $it) {
            FeePayment::create([
                'institution_id' => $p->institution_id, 'student_id' => $p->student_id,
                'enrollment_id' => $it['enrollment_id'], 'batch_id' => $it['batch_id'], 'fee_category_id' => $it['fee_category_id'],
                'amount' => $it['gross'], 'discount' => $it['discount'], 'paid_amount' => $it['amount'], 'month' => $it['month'],
                'payment_method' => $p->channel ?? $p->gateway, 'receipt_no' => $receipt, 'line_no' => $i + 1,   // R6.4: channel (bkash/nagad/card/banglaqr…) when the provider reports it
                'online_payment_id' => $p->id, 'paid_at' => now(), 'status' => 'paid',
            ]);
        }
        $p->update(['status' => 'success', 'trx_id' => $trxId, 'receipt_no' => $receipt, 'paid_at' => now()]);
    }

    public function platformModeFees(Institution $i, string $gateway, float $amount): array
    {
        $gw   = round($amount * config("payments.gateways.{$gateway}.fee_percent") / 100, 2);     // R6.4: from the registry
        $pct  = $i->settings['platform_fee_percent'] ?? config('payments.platform_fee_percent');
        return [$gw, round($amount * $pct / 100, 2)];
    }

    /** Must be called inside a transaction. Serialises numbering per institution. */
    public function nextReceiptNo(): string
    {
        Institution::whereKey(app('currentInstitution')->id)->lockForUpdate()->value('id');
        $prefix = 'RCP-' . date('Y') . '-';
        $last   = FeePayment::where('receipt_no', 'like', $prefix . '%')->orderByDesc('receipt_no')->value('receipt_no');
        return $prefix . str_pad($last ? ((int) substr($last, -5)) + 1 : 1, 5, '0', STR_PAD_LEFT);
    }

    // Sibling discount calculation
    public function calculateSiblingDiscount(int $studentId): float
    {
        $student  = Student::findOrFail($studentId);
        $siblings = Student::where('guardian_phone', $student->guardian_phone)
                           ->where('id', '!=', $studentId)
                           ->where('status', 'active')
                           ->count();
        return match(true) {
            $siblings >= 2 => 20.0,
            $siblings == 1 => 10.0,
            default        => 0.0,
        };
    }

    // Late fee calculation
    public function calculateLateFee(string $month, \DateTime $paymentDate): float
    {
        $dueDay    = 10;
        $dueDate   = \DateTime::createFromFormat('Y-m', $month)->modify("+{$dueDay} days -1 day");
        if ($paymentDate <= $dueDate) return 0;
        $lateDays  = $paymentDate->diff($dueDate)->days;
        return min($lateDays * 5.00, 100.00);
    }
}
```

- `fee_payments.payment_method` এখন VARCHAR(30): `cash` বা `online_payments.channel` (provider জানালে — `bkash`, `nagad`, `card`, `banglaqr` …), নইলে `gateway`। নতুন gateway-তে migration লাগে না।
- Controller: `POST /fees/collect` body `{ student_id, lines: [{key, paid_amount?}], payment_method }`; `GET /fees/dues?student_id=` → `dueLines()`; Parent `GET /parent/fees` → প্রতিটি সন্তানের `dueLines()`।
- `FeeCollectionTest`, `FeeResolutionTest` (`docs/TESTING.md`) এই methods-এর উপর।

## app/Services/AttendanceService.php — Full Code (Revision 7)
উপস্থিতির একক = **batch + date**। প্রতিটি `student_id` ওই batch-এ active enrollment-ভুক্ত হতে হবে; একই student একই দিনে দুই batch-এ আলাদা status পেতে পারে (coaching)। Holiday শুধু school/college-এ আটকায়; coaching/private_batch-এ `batches.schedule`-এর দিন না হলে সতর্কতা (আটকায় না)।
```php
<?php
namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Attendance, Batch, Enrollment, Holiday, Student};
use App\Jobs\SendSmsJob;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AttendanceService
{
    /** $data = { batch_id, date, records: [{student_id, status, note?}] } */
    public function saveBulk(array $data): array
    {
        $institution = app('currentInstitution');
        $batch = Batch::findOrFail($data['batch_id']);
        $date  = $data['date'];

        if (in_array($institution->institution_type, ['school', 'college'], true) && Holiday::where('date', $date)->exists()) {
            throw new BusinessException("ছুটির দিনে উপস্থিতি নেওয়া যায় না ({$date})", 'holiday_date');
        }

        // Every student must be actively enrolled in THIS batch
        $enrolled = Enrollment::where('batch_id', $batch->id)->where('status', 'active')
                              ->whereIn('student_id', collect($data['records'])->pluck('student_id'))
                              ->pluck('student_id')->flip();
        $absent = [];

        // R15: ONE upsert statement for the whole batch instead of 2 queries per student (SELECT + INSERT/UPDATE inside updateOrCreate): a 40-student batch was ~80 queries,
        // and every teacher saves in the same 15 minutes of the morning. Conflict target = unique_attendance; created_at is not in the update list so the first value survives.
        // upsert() skips model events, so BelongsToInstitution's cross-tenant guard does NOT run: TenantBulk::upsert() re-checks every row (TenantBulkGuardTest).
        DB::transaction(function () use ($data, $batch, $date, $enrolled, $institution, &$absent) {
            $rows = [];
            foreach ($data['records'] as $r) {
                if (!$enrolled->has($r['student_id'])) {
                    throw new BusinessException("Student #{$r['student_id']} এই batch-এ ভর্তি নন", 'not_enrolled');
                }
                $rows[] = ['institution_id' => $institution->id, 'student_id' => $r['student_id'], 'batch_id' => $batch->id, 'date' => $date,
                           'program_id' => $batch->program_id, 'status' => $r['status'], 'taken_by' => auth()->id(), 'note' => $r['note'] ?? null, 'created_at' => now()];
                if ($r['status'] === 'absent') $absent[] = $r['student_id'];
            }
            TenantBulk::upsert(Attendance::class, $rows, ['institution_id', 'student_id', 'batch_id', 'date'], ['program_id', 'status', 'taken_by', 'note']);
        });

        if ($absent) $this->notifyAbsentParents($absent, $date, $batch);
        return ['saved' => count($data['records']), 'absent_count' => count($absent)];
    }

    private function notifyAbsentParents(array $studentIds, string $date, Batch $batch): void
    {
        $when = \Carbon\Carbon::parse($date)->format('d/m/Y');
        Student::with('user')->whereIn('id', $studentIds)->get()->each(function (Student $s) use ($when, $batch) {
            $prefs = $s->primaryParent()?->notification_preferences ?? [];
            if (($prefs['sms'] ?? true) && ($prefs['absent_alert'] ?? true)) {
                // Sender + institution-name suffix are added by SmsService::compose() - never write "-{institution}" here
                SendSmsJob::dispatch($s->guardian_phone, "প্রিয় অভিভাবক, {$s->user->name} {$when} তারিখে {$batch->name}-এ অনুপস্থিত ছিল।", app('currentInstitution')->id);
            }
        });
    }

    /** Monthly summary for a student, optionally limited to one batch */
    public function getStudentSummary(int $studentId, string $month, ?int $batchId = null): array
    {
        // R15: a sargable range. `where('date', 'like', '2027-03%')` turns the DATE into a string, so the index on `date` cannot be used.
        $from = \Carbon\Carbon::parse($month . '-01')->startOfMonth()->toDateString(); $to = \Carbon\Carbon::parse($month . '-01')->endOfMonth()->toDateString();
        $records = Attendance::where('student_id', $studentId)->whereBetween('date', [$from, $to])
                             ->when($batchId, fn ($q) => $q->where('batch_id', $batchId))->get();
        $total = $records->count(); $present = $records->where('status', 'present')->count();
        return [
            'month' => $month, 'total_days' => $total, 'present' => $present,
            'absent' => $records->where('status', 'absent')->count(), 'late' => $records->where('status', 'late')->count(),
            'leave' => $records->where('status', 'leave')->count(),
            'percentage' => $total > 0 ? round($present / $total * 100, 2) : 0, 'daily_records' => $records->keyBy('date'),
        ];
    }

    /** Batch attendance report (students come from enrollments, not from students.batch_id).
     *  R15: ONE grouped query for the whole batch (uses idx_attendance_batch_date) instead of getStudentSummary() per student (40 students = 40 queries). */
    public function getBatchReport(int $batchId, string $month): Collection
    {
        $from = \Carbon\Carbon::parse($month . '-01')->startOfMonth()->toDateString(); $to = \Carbon\Carbon::parse($month . '-01')->endOfMonth()->toDateString();
        $counts = Attendance::where('batch_id', $batchId)->whereBetween('date', [$from, $to])
                            ->selectRaw('student_id, status, COUNT(*) AS n')->groupBy('student_id', 'status')->get()->groupBy('student_id');
        return Student::with('user')->inBatch($batchId)->active()->get()->map(function (Student $s) use ($counts, $month) {
            $c = ($counts[$s->id] ?? collect())->pluck('n', 'status'); $total = $c->sum(); $present = (int) ($c['present'] ?? 0);
            return ['student' => $s, 'summary' => ['month' => $month, 'total_days' => $total, 'present' => $present, 'absent' => (int) ($c['absent'] ?? 0),
                    'late' => (int) ($c['late'] ?? 0), 'leave' => (int) ($c['leave'] ?? 0), 'percentage' => $total > 0 ? round($present / $total * 100, 2) : 0]];
        });
    }
}
```
**Admin/Teacher route:** `POST /attendance { batch_id, date, records }`; Teacher শুধু নিজের batch-এ (`batch_teachers` বা class-teacher) — `AttendancePolicy`।

## app/Services/NotificationService.php — Full Code
```php
<?php
namespace App\Services;

use App\Jobs\SendSmsJob;
use App\Models\{User, Student};
use Illuminate\Support\Facades\Http;

class NotificationService
{
    public function __construct(
        private SmsService $smsService
    ) {}

    // SMS + In-App + Push together
    public function notify(User $user, string $type, string $title, string $body, array $data = []): void
    {
        $prefs = $user->notification_preferences ?? [];

        // In-App (always)
        $user->notify(new \App\Notifications\GeneralNotification($title, $body, $type, $data));

        // SMS
        if (($prefs['sms'] ?? true) && ($prefs[$type] ?? true) && $user->phone) {
            SendSmsJob::dispatch($user->phone, $body, app('currentInstitution')->id);
        }

        // WhatsApp
        if (($prefs['whatsapp'] ?? false) && $user->whatsapp_enabled && $user->whatsapp_number) {
            app(WhatsAppService::class)->send($user->whatsapp_number, $body);
        }

        // Firebase Push
        if (($prefs['push'] ?? true) && $user->fcm_token) {
            $this->sendPush($user->fcm_token, $title, $body, $data);
        }
    }

    // Bulk notify (class/batch)
    public function notifyStudentsParents(array $studentIds, string $type, string $title, string $body): int
    {
        $students = Student::with('primaryParent')->whereIn('id', $studentIds)->get();
        $sent     = 0;

        foreach ($students as $student) {
            $parent = $student->primaryParent;
            if ($parent) {
                $this->notify($parent, $type, $title, str_replace('{name}', $student->name, $body));
                $sent++;
            }
        }
        return $sent;
    }

    // Firebase FCM Push
    public function sendPush(string $fcmToken, string $title, string $body, array $data = []): bool
    {
        if (!config('services.fcm.server_key')) return false;

        $response = Http::withHeaders([
            'Authorization' => 'key=' . config('services.fcm.server_key'),
            'Content-Type'  => 'application/json',
        ])->post('https://fcm.googleapis.com/fcm/send', [
            'to'           => $fcmToken,
            'notification' => ['title' => $title, 'body' => $body, 'sound' => 'default'],
            'data'         => $data,
        ]);

        return $response->successful();
    }

    // Bulk Push (topic-based — class or institution)
    public function sendTopicPush(string $topic, string $title, string $body): bool
    {
        // topic: "institution_{institution_id}" or "class_{program_id}"
        $response = Http::withHeaders([
            'Authorization' => 'key=' . config('services.fcm.server_key'),
        ])->post('https://fcm.googleapis.com/fcm/send', [
            'to'           => "/topics/{$topic}",
            'notification' => ['title' => $title, 'body' => $body],
        ]);

        return $response->successful();
    }
}
```
