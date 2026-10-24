<?php

use App\Http\Controllers\Academic\{AttendanceController, BatchController, ConsentController, EnrollmentController, ProgramController, StudentController, SubjectController, TeacherController};
use App\Http\Controllers\Admin\{ImportController, SettingController, TerminologyController, ThemeController};
use App\Http\Controllers\Exams\{ExamController, ResultController};
use App\Http\Controllers\Fees\{FeeController, FeeRefundController};
use App\Http\Controllers\Sms\{SmsCreditController, SmsLogController, SmsSenderController};
use App\Http\Controllers\Public\{BootstrapController, HealthController};
use App\Http\Controllers\QuestionBank\{QbBlueprintController, QbConceptController, QbCurriculumController, QbEarningController, QbFinderController, QbImportController, QbGraphDatasetController, QbLibraryController, QbMediaController, QbOmrFormController, QbPaperController, QbPaperFolderController, QbPricingController, QbPurchaseController, QbQuestionController, QbPublicQuizController, QbQuizController, QbResourceController, QbStudentController, QbStudentOrderCallbackController, QbStudentQuizController, QbWithdrawalController, QbWriterController};
use App\Http\Controllers\Privacy\StudentPrivacyController;
use App\Http\Controllers\Reports\ReportController;
use App\Http\Controllers\Shared\{AuditLogController, DashboardController, NotificationController};
use App\Http\Controllers\SuperAdmin\{InstitutionController, TenantPurgeController, UniversalSmsController};
use App\Http\Controllers\Auth\{LoginController, PasswordResetController, SessionController};
use App\Http\Controllers\Hr\{StaffController,StaffAttendanceController,TeacherAttendanceController,LeaveTypeController,LeaveController};
use App\Http\Controllers\Hr\{SalaryComponentController,SalaryStructureController,SalaryRevisionController,IncrementBatchController,BonusSchemeController,PayAccountController,SalaryAdvanceController,SalaryAdjustmentController};
use Illuminate\Support\Facades\Route;

// Structure: docs/templates/laravel-core-files.md "routes/api.php". Every group runs on exactly one kind of host.
Route::prefix('v1')->group(function () {

    // ─── 1. Any host ───────────────────────────────────────────
    Route::middleware(['tenant:optional', 'locale'])->group(function () {
        Route::get('/health',                 HealthController::class);   // invokable: a closure would break route:cache
        Route::get('/bootstrap',              [BootstrapController::class, 'show']);
        Route::post('/auth/login',            [LoginController::class, 'login'])->middleware('throttle:login');
        Route::post('/auth/verify-otp',       [LoginController::class, 'verifyOtp'])->middleware('throttle:otp');   // D68 (4)
        Route::post('/auth/google',           [LoginController::class, 'google'])->middleware('throttle:login');   // R2.1.1 / D111 (3)
        Route::post('/auth/forgot-password',  [PasswordResetController::class, 'sendResetLink'])->middleware('throttle:login');
        Route::post('/auth/reset-password',   [PasswordResetController::class, 'reset'])->middleware('throttle:login');

        // Shared by Super Admin (central host) and tenant users (their own host) - one route, host-aware check
        Route::middleware(['auth:sanctum', 'host.user'])->group(function () {
            Route::post('/auth/logout',       [LoginController::class, 'logout']);
            Route::get('/auth/me',            [LoginController::class, 'me']);
        });
    });

    // D58: bKash brings the payer back here after an SMS-wallet recharge (central host, no login - `ref` finds our own record)
    Route::middleware(['tenant:central', 'throttle:60,1'])->get('/billing/bkash/callback', [\App\Http\Controllers\Billing\SmsRechargeCallbackController::class, 'bkash']);
    // QB.9: bKash brings a student back here after paying for question-bank items (`ref` finds our own order; central host, no login)
    Route::middleware(['tenant:central', 'throttle:60,1'])->get('/qb/student-orders/bkash/callback', [QbStudentOrderCallbackController::class, 'bkash']);
    // QB.10: the platform's public quizzes (central host, no login; checked on the server, nothing saved, never the right answers)
    Route::middleware(['tenant:central', 'locale', 'throttle:30,1'])->prefix('public/qb')->group(function () {
        Route::get('/quizzes',                            [QbPublicQuizController::class, 'index']);
        Route::get('/quizzes/{id}',                       [QbPublicQuizController::class, 'show'])->whereNumber('id');
        Route::post('/quizzes/{id}/check',                [QbPublicQuizController::class, 'check'])->whereNumber('id');
    });

    // D90: central-host recipient activation; public creation remains disabled by default.
    Route::middleware(['tenant:central', 'locale'])->group(function () {
        Route::post('/public/institutions', [\App\Http\Controllers\Auth\PublicInstitutionSignupController::class, 'store'])->middleware('throttle:signup');
        Route::post('/public/institutions/{id}/verify', [\App\Http\Controllers\Auth\PublicInstitutionSignupController::class, 'verify'])->middleware('throttle:activation-verify')->whereNumber('id');
        Route::post('/public/institutions/{id}/verification', [\App\Http\Controllers\Auth\PublicInstitutionSignupController::class, 'resend'])->middleware('throttle:activation-resend')->whereNumber('id');
    });

    // ─── 2. Central host only: Super Admin (Step 4.7 dashboard, Step 5.3 panel) ───
    Route::middleware(['tenant:central', 'locale', 'auth:sanctum', 'role:super_admin', 'tenancy.bypass'])->prefix('super')->group(function () {
        Route::get('/dashboard',              [DashboardController::class, 'superAdmin']);
        // Step 5.3 (D55-D58): institutions, their SMS wallet, the universal SMS API
        Route::post('/institutions/{id}/approve-registration', [\App\Http\Controllers\Auth\InstitutionApprovalController::class, 'approve'])->whereNumber('id');
        Route::get('/institutions',                   [InstitutionController::class, 'index']);
        Route::post('/institutions',                  [InstitutionController::class, 'store']);
        Route::get('/institutions/{id}',              [InstitutionController::class, 'show'])->whereNumber('id');
        Route::put('/institutions/{id}',              [InstitutionController::class, 'update'])->whereNumber('id');
        Route::delete('/institutions/{id}',           [InstitutionController::class, 'destroy'])->whereNumber('id');
        Route::patch('/institutions/{id}/toggle',     [InstitutionController::class, 'toggleStatus'])->whereNumber('id');
        Route::post('/institutions/{id}/sms-credits', [SmsCreditController::class, 'adjust'])->whereNumber('id');
        Route::get('/sms-settings',                   [UniversalSmsController::class, 'show']);
        Route::put('/sms-settings',                   [UniversalSmsController::class, 'update']);
        // Step 8.1 (D27, privacy-and-consent.md 5.3): remove an institution for good - manual, two steps
        Route::get('/tenant-purge/candidates',                      [TenantPurgeController::class, 'candidates']);
        Route::post('/tenant-purge/{institutionId}/dry-run',        [TenantPurgeController::class, 'dryRun'])->whereNumber('institutionId');
        Route::post('/tenant-purge/{institutionId}/execute',        [TenantPurgeController::class, 'execute'])->whereNumber('institutionId');
        // QB.2 (D65): the platform's writers and moderators (switched off, never deleted)
        Route::get('/qb/writers',                     [QbWriterController::class, 'index']);
        Route::post('/qb/writers',                    [QbWriterController::class, 'store']);
        Route::patch('/qb/writers/{id}',              [QbWriterController::class, 'update'])->whereNumber('id');
        // QB.6 (D66): prices (a change = a new row) and the free / partly-free / discount rules (switched off, never deleted)
        Route::get('/qb/prices',                      [QbPricingController::class, 'prices']);
        Route::post('/qb/prices',                     [QbPricingController::class, 'storePrice']);
        Route::get('/qb/price-rules',                 [QbPricingController::class, 'rules']);
        Route::post('/qb/price-rules/preview',        [QbPricingController::class, 'preview']);
        // QB.10: quiz packages and quizzes
        Route::get('/qb/quiz-packages',               [QbQuizController::class, 'packages']);
        Route::post('/qb/quiz-packages',              [QbQuizController::class, 'storePackage']);
        Route::put('/qb/quiz-packages/{id}',          [QbQuizController::class, 'updatePackage'])->whereNumber('id');
        Route::get('/qb/quizzes',                     [QbQuizController::class, 'index']);
        Route::get('/qb/quizzes/{id}',                [QbQuizController::class, 'show'])->whereNumber('id');
        Route::post('/qb/quizzes',                    [QbQuizController::class, 'store']);
        Route::put('/qb/quizzes/{id}',                [QbQuizController::class, 'update'])->whereNumber('id');
        // QB.10b: writers' share, minimum withdrawal, withdrawal requests paid by hand or rejected
        Route::get('/qb/writer-settings',             [QbWithdrawalController::class, 'settings']);
        Route::put('/qb/writer-settings',             [QbWithdrawalController::class, 'updateSettings']);
        Route::get('/qb/withdrawals',                 [QbWithdrawalController::class, 'index']);
        Route::post('/qb/withdrawals/{id}/pay',       [QbWithdrawalController::class, 'pay'])->whereNumber('id');
        Route::post('/qb/withdrawals/{id}/reject',    [QbWithdrawalController::class, 'reject'])->whereNumber('id');
        Route::post('/qb/price-rules',                [QbPricingController::class, 'storeRule']);
        Route::put('/qb/price-rules/{id}',            [QbPricingController::class, 'updateRule'])->whereNumber('id');
        // QB.1 (D65): the question-bank curriculum class → subject → chapter → topic
        Route::get('/qb/curriculum',                  [QbCurriculumController::class, 'tree']);
        // R2.1.5 (D126 (3)): qbank's assessment blueprints (before the {kind} routes so "blueprints" is not read as a kind)
        Route::get('/qb/blueprints',                  [QbBlueprintController::class, 'index']);
        Route::post('/qb/blueprints',                 [QbBlueprintController::class, 'store']);
        Route::put('/qb/blueprints/{id}',             [QbBlueprintController::class, 'update'])->whereNumber('id');
        Route::delete('/qb/blueprints/{id}',          [QbBlueprintController::class, 'destroy'])->whereNumber('id');
        Route::post('/qb/{kind}',                     [QbCurriculumController::class, 'store']);
        Route::put('/qb/{kind}/{id}',                 [QbCurriculumController::class, 'update'])->whereNumber('id');
        Route::delete('/qb/{kind}/{id}',              [QbCurriculumController::class, 'destroy'])->whereNumber('id');
    });

    // ─── 2b. Central host: the question-bank writers' panel (D65, QB.2) - platform content only, no tenant bound, no bypass ───
    Route::middleware(['tenant:central', 'locale', 'auth:sanctum', 'role:content_writer,content_moderator,super_admin', 'password.fresh'])->prefix('writer')->group(function () {
        Route::patch('/change-password',              [QbWriterController::class, 'changePassword']);
        Route::get('/dashboard',                      [QbWriterController::class, 'dashboard']);   // R2.1.1 (D110)
        // QB.10b: the writer's own earnings and withdrawal requests
        Route::middleware('role:content_writer')->group(function () {
            Route::get('/earnings',                   [QbEarningController::class, 'summary']);
            Route::get('/withdrawals',                [QbEarningController::class, 'withdrawals']);
            Route::post('/withdrawals',               [QbEarningController::class, 'requestWithdrawal'])->middleware('throttle:10,1');
        });
        Route::get('/curriculum',                     [QbQuestionController::class, 'curriculum']);
        // D141: writers may create shared curriculum entries, but only Super Admins may manage/update/delete the catalogue.
        Route::post('/qb/{kind}',                     [QbCurriculumController::class, 'store'])
            ->middleware('role:content_writer,super_admin')->where('kind', 'subjects|chapters|topics|curriculum-versions|curriculum-nodes');
        Route::get('/question-types',                 [QbQuestionController::class, 'types']);
        Route::get('/questions',                      [QbQuestionController::class, 'index']);
        Route::post('/questions',                     [QbQuestionController::class, 'store'])->middleware('role:content_writer,super_admin');
        Route::get('/questions/{id}',                 [QbQuestionController::class, 'show'])->whereNumber('id');
        Route::put('/questions/{id}',                 [QbQuestionController::class, 'update'])->whereNumber('id')->middleware('role:content_writer,super_admin');
        Route::get('/questions/{id}/revisions',       [QbQuestionController::class, 'revisions'])->whereNumber('id');
        Route::post('/media',                         [QbMediaController::class, 'store'])->middleware('role:content_writer,super_admin');
        // R2.1.2 (D115, D116): qbank's graph datasets (the {id} is the dataset's uuid) - writers their own, moderators read, the Super Admin all
        Route::post('/question-finder',               [QbFinderController::class, 'search'])->middleware('throttle:10,1');   // R2.1.2 (D114 (3))
        Route::get('/graph-datasets/capabilities',    [QbGraphDatasetController::class, 'capabilities']);   // D118 (5)
        Route::get('/graph-datasets',                 [QbGraphDatasetController::class, 'index']);
        Route::post('/graph-datasets',                [QbGraphDatasetController::class, 'store'])->middleware(['role:content_writer,super_admin', 'throttle:60,1']);
        Route::get('/graph-datasets/{id}',            [QbGraphDatasetController::class, 'show'])->whereUuid('id');
        Route::put('/graph-datasets/{id}',            [QbGraphDatasetController::class, 'update'])->whereUuid('id')->middleware('role:content_writer,super_admin');
        Route::delete('/graph-datasets/{id}',         [QbGraphDatasetController::class, 'destroy'])->whereUuid('id')->middleware('role:content_writer,super_admin');
        // R2.1.3 (D123): JSON/TOON import into staging - writers and the Super Admin
        Route::middleware('role:content_writer,super_admin')->group(function () {
            Route::get('/imports',                    [QbImportController::class, 'index']);
            Route::get('/imports/schema.json',        [QbImportController::class, 'schema']);
            Route::get('/imports/example.{format}',   [QbImportController::class, 'example'])->whereIn('format', ['json', 'toon']);
            Route::post('/imports',                   [QbImportController::class, 'store'])->middleware('throttle:10,1');
            Route::get('/imports/{id}',               [QbImportController::class, 'show'])->whereUuid('id');
            Route::get('/imports/{id}/records',       [QbImportController::class, 'records'])->whereUuid('id');
            Route::get('/imports/{id}/errors.csv',    [QbImportController::class, 'errors'])->whereUuid('id');
            Route::post('/imports/{id}/resume',       [QbImportController::class, 'resume'])->whereUuid('id');
            Route::patch('/imports/{id}/records/{record}', [QbImportController::class, 'edit'])->whereUuid('id')->whereNumber('record');
            Route::post('/imports/{id}/records/{record}/open-editor', [QbImportController::class, 'openEditor'])->whereUuid('id')->whereNumber('record')->middleware('throttle:10,1');
            Route::post('/imports/{id}/records/{record}/duplicate', [QbImportController::class, 'duplicate'])->whereUuid('id')->whereNumber('record');
            Route::post('/imports/{id}/records/{record}/reject', [QbImportController::class, 'reject'])->whereUuid('id')->whereNumber('record');   // D124
            Route::get('/imports/{id}/source.pdf',    [QbImportController::class, 'source'])->whereUuid('id');
            Route::post('/imports/{id}/settings',     [QbImportController::class, 'settings'])->whereUuid('id');
            Route::post('/imports/{id}/select',       [QbImportController::class, 'select'])->whereUuid('id');
            Route::post('/imports/{id}/finalize',     [QbImportController::class, 'finalize'])->whereUuid('id')->middleware('throttle:10,1');
        });
        Route::post('/questions/{id}/submit',         [QbQuestionController::class, 'submit'])->whereNumber('id')->middleware('role:content_writer,super_admin');
        Route::post('/questions/{id}/publish',        [QbQuestionController::class, 'publish'])->whereNumber('id')->middleware('role:content_moderator,super_admin');
        Route::post('/questions/{id}/reject',         [QbQuestionController::class, 'reject'])->whereNumber('id')->middleware('role:content_moderator,super_admin');
        // QB.5: topic concepts and resources (slide / book / pdf as a PDF) - the same review flow as a question
        Route::get('/concepts',                       [QbConceptController::class, 'index']);
        Route::post('/concepts',                      [QbConceptController::class, 'store'])->middleware('role:content_writer,super_admin');
        Route::get('/concepts/{id}',                  [QbConceptController::class, 'show'])->whereNumber('id');
        Route::put('/concepts/{id}',                  [QbConceptController::class, 'update'])->whereNumber('id')->middleware('role:content_writer,super_admin');
        Route::post('/concepts/{id}/submit',          [QbConceptController::class, 'submit'])->whereNumber('id')->middleware('role:content_writer,super_admin');
        Route::post('/concepts/{id}/publish',         [QbConceptController::class, 'publish'])->whereNumber('id')->middleware('role:content_moderator,super_admin');
        Route::post('/concepts/{id}/reject',          [QbConceptController::class, 'reject'])->whereNumber('id')->middleware('role:content_moderator,super_admin');
        Route::post('/resource-files',                [QbResourceController::class, 'upload'])->middleware('role:content_writer,super_admin');
        Route::get('/resources',                      [QbResourceController::class, 'index']);
        Route::post('/resources',                     [QbResourceController::class, 'store'])->middleware('role:content_writer,super_admin');
        Route::get('/resources/{id}',                 [QbResourceController::class, 'show'])->whereNumber('id');
        Route::put('/resources/{id}',                 [QbResourceController::class, 'update'])->whereNumber('id')->middleware('role:content_writer,super_admin');
        Route::post('/resources/{id}/submit',         [QbResourceController::class, 'submit'])->whereNumber('id')->middleware('role:content_writer,super_admin');
        Route::post('/resources/{id}/publish',        [QbResourceController::class, 'publish'])->whereNumber('id')->middleware('role:content_moderator,super_admin');
        Route::post('/resources/{id}/reject',         [QbResourceController::class, 'reject'])->whereNumber('id')->middleware('role:content_moderator,super_admin');
    });

    // D90: recipient staff activation is tenant-bound but does not require an existing login.
    Route::middleware(['tenant', 'locale', 'throttle:activation-verify'])->post('/auth/activate', [\App\Http\Controllers\Auth\AccountActivationController::class, 'store']);

    // ─── 3. Tenant host only ───────────────────────────────────
    Route::middleware(['tenant', 'locale', 'auth:sanctum', 'tenant.user', 'password.fresh', 'subscription', \App\Http\Middleware\StaffIdentityBoundary::class])->group(function () {
        Route::patch('/staff/profile', [\App\Http\Controllers\Auth\StaffAccountController::class, 'updateOwnProfile'])->middleware('role:institution_staff');
        Route::get('/staff/departments', [\App\Http\Controllers\DepartmentContextController::class, 'index'])->middleware('role:institution_staff');
        Route::get('/staff/departments/{id}/portal', [\App\Http\Controllers\DepartmentContextController::class, 'show'])->whereNumber('id')->middleware('role:institution_staff');
        Route::patch('/auth/change-password', [PasswordResetController::class, 'changePassword']);
        Route::get('/auth/sessions',          [SessionController::class, 'index']);
        Route::delete('/auth/sessions/{id}',  [SessionController::class, 'destroy'])->whereNumber('id');
        Route::post('/auth/logout-all',       [SessionController::class, 'logoutAll']);
        Route::put('/auth/locale',            [LoginController::class, 'locale']);
        Route::get('/notifications',              [NotificationController::class, 'index']);
        Route::patch('/notifications/read-all',   [NotificationController::class, 'markAllRead']);
        Route::patch('/notifications/{id}/read',  [NotificationController::class, 'markRead']);

        Route::get('/batches',                    [BatchController::class, 'index']);   // Step 4.1 (also the admission form's list)
        Route::get('/programs',                   [ProgramController::class, 'index']);
        Route::get('/teacher/batches',            [BatchController::class, 'mine'])->middleware('role:teacher,institution_staff');
        Route::get('/batches/{id}',               [BatchController::class, 'show'])->whereNumber('id')->middleware('role:admin,institution_staff');
        Route::get('/programs/{id}',              [ProgramController::class, 'show'])->whereNumber('id')->middleware('role:admin,institution_staff');
        Route::get('/subjects',                  [SubjectController::class, 'index'])->middleware('role:admin,institution_staff');
        Route::get('/subjects/{id}',             [SubjectController::class, 'show'])->whereNumber('id')->middleware('role:admin,institution_staff');
        Route::get('/teachers',                  [TeacherController::class, 'index'])->middleware('role:admin,institution_staff');

        // ── Institution Admin ─────────────────────────────────
        Route::middleware('role:admin')->group(function () {
            Route::post('/admin/departments/{department}/members', [\App\Http\Controllers\DepartmentMembershipController::class, 'store'])->whereNumber('department');
            Route::patch('/admin/department-memberships/{id}', [\App\Http\Controllers\DepartmentMembershipController::class, 'update'])->whereNumber('id');
            Route::put('/admin/department-memberships/{id}/duties', [\App\Http\Controllers\DepartmentMembershipController::class, 'assignDuties'])->whereNumber('id');
            Route::get('/admin/departments/{department}/duties', [\App\Http\Controllers\DepartmentDutyController::class, 'index'])->whereNumber('department');
            Route::post('/admin/departments/{department}/duties', [\App\Http\Controllers\DepartmentDutyController::class, 'store'])->whereNumber('department');
            Route::put('/admin/departments/{department}/duties/{duty}', [\App\Http\Controllers\DepartmentDutyController::class, 'update'])->whereNumber(['department', 'duty']);
            Route::get('/admin/departments', [\App\Http\Controllers\DepartmentController::class, 'index']);
            Route::post('/admin/departments', [\App\Http\Controllers\DepartmentController::class, 'store']);
            Route::put('/admin/departments/{id}', [\App\Http\Controllers\DepartmentController::class, 'update'])->whereNumber('id');
            Route::post('/admin/departments/{id}/archive', [\App\Http\Controllers\DepartmentController::class, 'archive'])->whereNumber('id');
            Route::get('/admin/staff', [\App\Http\Controllers\Auth\StaffAccountController::class, 'index']);
            Route::post('/admin/staff', [\App\Http\Controllers\Auth\StaffAccountController::class, 'store']);
            Route::put('/admin/staff/{id}', [\App\Http\Controllers\Auth\StaffAccountController::class, 'update'])->whereNumber('id');
            Route::post('/admin/staff/{id}/activation', [\App\Http\Controllers\Auth\StaffAccountController::class, 'resendActivation'])->whereNumber('id')->middleware('throttle:staff-activation-reissue');
            Route::post('/admin/users/{id}/force-logout', [SessionController::class, 'forceLogout'])->whereNumber('id');
            Route::post('/admin/users/{id}/unlock',       [SessionController::class, 'unlock'])->whereNumber('id');
            Route::get('/admin/settings/terminology',     [TerminologyController::class, 'show']);
            Route::put('/admin/settings/terminology',     [TerminologyController::class, 'update']);
            Route::get('/settings',                       [SettingController::class, 'index']);
            Route::put('/settings',                       [SettingController::class, 'update']);
            Route::get('/admin/settings/general',         [SettingController::class, 'general']);
            Route::put('/admin/settings/general',         [SettingController::class, 'updateGeneral']);
            Route::get('/admin/settings/language',        [SettingController::class, 'language']);
            Route::put('/admin/settings/language',        [SettingController::class, 'updateLanguage']);
            Route::get('/admin/theme',                    [ThemeController::class, 'show']);
            Route::put('/admin/theme',                    [ThemeController::class, 'update']);
            Route::post('/admin/theme/logo',              [ThemeController::class, 'logo']);
            Route::get('/audit-logs',                     [AuditLogController::class, 'index']);
            Route::get('/audit-logs/{id}',                [AuditLogController::class, 'show'])->whereNumber('id');

            // Data migration wizard (Step 4.2; R1: kind=students only - config release.import_kinds)
            Route::middleware('module:data_migration')->group(function () {
                Route::get('/imports',                    [ImportController::class, 'index']);
                Route::post('/imports',                   [ImportController::class, 'store']);
                Route::get('/imports/templates/{kind}.xlsx', [ImportController::class, 'template'])->where('kind', '[a-z_]+');
                Route::get('/imports/{id}',               [ImportController::class, 'show'])->whereNumber('id');
                Route::put('/imports/{id}/mapping',       [ImportController::class, 'mapping'])->whereNumber('id');
                Route::get('/imports/{id}/errors.xlsx',   [ImportController::class, 'errors'])->whereNumber('id');
                Route::post('/imports/{id}/{action}',     [ImportController::class, 'transition'])->whereNumber('id')->whereIn('action', ['dry-run', 'run', 'rollback']);
            });

            // Academic structure and teachers (Step 4.1)
            Route::post('/programs',                      [ProgramController::class, 'store']);
            Route::put('/programs/{id}',                  [ProgramController::class, 'update'])->whereNumber('id');
            Route::delete('/programs/{id}',               [ProgramController::class, 'destroy'])->whereNumber('id');
            Route::post('/batches',                       [BatchController::class, 'store']);
            Route::put('/batches/{id}',                   [BatchController::class, 'update'])->whereNumber('id');
            Route::delete('/batches/{id}',                [BatchController::class, 'destroy'])->whereNumber('id');
            Route::get('/batches/{id}/students',          [BatchController::class, 'students'])->whereNumber('id');
            Route::post('/subjects',                      [SubjectController::class, 'store']);
            Route::put('/subjects/{id}',                  [SubjectController::class, 'update'])->whereNumber('id');
            Route::delete('/subjects/{id}',               [SubjectController::class, 'destroy'])->whereNumber('id');
            Route::post('/teachers',                      [TeacherController::class, 'store']);
            Route::get('/teachers/{id}',                  [TeacherController::class, 'show'])->whereNumber('id');
            Route::put('/teachers/{id}',                  [TeacherController::class, 'update'])->whereNumber('id');
            Route::delete('/teachers/{id}',               [TeacherController::class, 'destroy'])->whereNumber('id');

            // Students & enrollment (Step 4.2; the walking-skeleton slice builds these first)
            Route::middleware('module:students')->group(function () {
                Route::get('/students',                   [StudentController::class, 'index']);
                Route::post('/students',                  [StudentController::class, 'store']);
                Route::get('/students/{id}',              [StudentController::class, 'show'])->whereNumber('id');
                Route::put('/students/{id}',              [StudentController::class, 'update'])->whereNumber('id');
                Route::delete('/students/{id}',           [StudentController::class, 'destroy'])->whereNumber('id');
                Route::get('/students/{id}/consents',     [ConsentController::class, 'index'])->whereNumber('id');
                Route::post('/students/{id}/consents',    [ConsentController::class, 'store'])->whereNumber('id');
                Route::get('/students/{id}/consent-form.pdf', [ConsentController::class, 'form'])->whereNumber('id');
                Route::post('/students/{id}/anonymize',   [StudentPrivacyController::class, 'anonymize'])->whereNumber('id');   // Step 8.1 (D27)
            });
            Route::middleware('module:enrollments')->group(function () {
                Route::post('/enrollments',               [EnrollmentController::class, 'store']);
                Route::get('/students/{id}/enrollments',  [EnrollmentController::class, 'forStudent'])->whereNumber('id');
                Route::put('/enrollments/{id}',           [EnrollmentController::class, 'update'])->whereNumber('id');
                Route::post('/enrollments/{id}/end',      [EnrollmentController::class, 'end'])->whereNumber('id');
                Route::post('/enrollments/{id}/transfer', [EnrollmentController::class, 'transfer'])->whereNumber('id');
            });
        });

        // ── Admin + Teacher: attendance (Step 4.3; Spike S5b) ──
        // D86 / R3.5: salary structures and previews, no settlement execution.
        Route::middleware(['role:admin,accountant,teacher,institution_staff','module:hr_payroll'])->get('/hr/people/{type}/{id}/salary',[SalaryStructureController::class,'history'])->whereNumber('id');
        Route::middleware(['role:teacher,institution_staff','module:hr_payroll'])->get('/teacher/salary/advances',[SalaryAdvanceController::class,'mine']);
        Route::middleware(['role:admin,accountant,institution_staff','module:hr_payroll'])->prefix('hr')->group(function(){
            Route::get('/salary-components',[SalaryComponentController::class,'index']);
            Route::post('/salary-components',[SalaryComponentController::class,'store']);
            Route::put('/salary-components/{id}',[SalaryComponentController::class,'update'])->whereNumber('id');
            Route::delete('/salary-components/{id}',[SalaryComponentController::class,'destroy'])->whereNumber('id');
            Route::get('/people/{type}/{id}/pay-accounts',[PayAccountController::class,'show'])->whereNumber('id');
            Route::put('/people/{type}/{id}/pay-accounts',[PayAccountController::class,'update'])->whereNumber('id');
            Route::get('/revisions',[SalaryRevisionController::class,'index']);
            Route::post('/revisions',[SalaryRevisionController::class,'store']);
            Route::get('/revisions/{id}',[SalaryRevisionController::class,'show'])->whereNumber('id');
            Route::post('/revisions/{id}/approve',[SalaryRevisionController::class,'approve'])->whereNumber('id');
            Route::post('/revisions/{id}/reject',[SalaryRevisionController::class,'reject'])->whereNumber('id');
            Route::post('/revisions/{id}/cancel',[SalaryRevisionController::class,'cancel'])->whereNumber('id');
            Route::get('/revisions/{id}/letter.pdf',[SalaryRevisionController::class,'letter'])->whereNumber('id');
            Route::post('/increment-batches/preview',[IncrementBatchController::class,'preview']);
            Route::post('/increment-batches',[IncrementBatchController::class,'store']);
            Route::get('/bonus-schemes',[BonusSchemeController::class,'index']);
            Route::post('/bonus-schemes',[BonusSchemeController::class,'store']);
            Route::get('/bonus-schemes/{id}',[BonusSchemeController::class,'show'])->whereNumber('id');
            Route::put('/bonus-schemes/{id}',[BonusSchemeController::class,'update'])->whereNumber('id');
            Route::delete('/bonus-schemes/{id}',[BonusSchemeController::class,'destroy'])->whereNumber('id');
            Route::post('/bonus-schemes/{id}/preview',[BonusSchemeController::class,'preview'])->whereNumber('id');
            Route::post('/bonus-schemes/{id}/apply',[BonusSchemeController::class,'apply'])->whereNumber('id');
            Route::post('/bonus-schemes/{id}/cancel',[BonusSchemeController::class,'cancel'])->whereNumber('id');
            Route::get('/adjustments',[SalaryAdjustmentController::class,'index']);
            Route::post('/adjustments',[SalaryAdjustmentController::class,'store']);
            Route::get('/adjustments/suggest-extra-class',[SalaryAdjustmentController::class,'suggestExtraClass']);
            Route::post('/adjustments/{id}/approve',[SalaryAdjustmentController::class,'approve'])->whereNumber('id');
            Route::post('/adjustments/{id}/cancel',[SalaryAdjustmentController::class,'cancel'])->whereNumber('id');
            Route::get('/advances',[SalaryAdvanceController::class,'index']);
            Route::post('/advances',[SalaryAdvanceController::class,'store']);
            Route::get('/advances/{id}',[SalaryAdvanceController::class,'show'])->whereNumber('id');
            Route::post('/advances/{id}/{action}',[SalaryAdvanceController::class,'transition'])->whereNumber('id')->where('action','approve|reject|disburse|skip-installment|write-off');
        });


        // R3.7 / D104: payroll runs, payment, payslips and the teacher's own salary (staff-payroll.md §15)
        Route::middleware(['role:admin,accountant','module:hr_payroll'])->prefix('hr')->group(function () {
            Route::get('/payroll-runs',[\App\Http\Controllers\Hr\PayrollRunController::class,'index']);
            Route::post('/payroll-runs',[\App\Http\Controllers\Hr\PayrollRunController::class,'store']);
            Route::get('/payroll-runs/{id}',[\App\Http\Controllers\Hr\PayrollRunController::class,'show'])->whereNumber('id');
            Route::post('/payroll-runs/{id}/{action}',[\App\Http\Controllers\Hr\PayrollRunController::class,'transition'])->whereNumber('id')->whereIn('action',['recompute','review','approve','reject','cancel','pay']);
            Route::get('/payroll-runs/{id}/{file}',[\App\Http\Controllers\Hr\PayrollRunController::class,'download'])->whereNumber('id')->whereIn('file',['disbursement.csv','register.pdf']);
            Route::patch('/payroll-items/{id}',[\App\Http\Controllers\Hr\PayrollItemController::class,'update'])->whereNumber('id');
            Route::get('/payroll-items/{id}/slip.pdf',[\App\Http\Controllers\Hr\PayrollItemController::class,'slip'])->whereNumber('id');
            Route::get('/reports/{name}',[\App\Http\Controllers\Hr\PayrollReportController::class,'show'])->whereIn('name',['register','held','monthly-cost']);
            // R3.8: PF ledger and final settlement (staff-payroll.md §10-§11)
            Route::post('/final-settlement/{type}/{id}/start',[\App\Http\Controllers\Hr\FinalSettlementController::class,'start'])->whereIn('type',['teacher','staff'])->whereNumber('id');
            Route::get('/pf/entries',[\App\Http\Controllers\Hr\ProvidentFundController::class,'index']);
            Route::post('/pf/entries',[\App\Http\Controllers\Hr\ProvidentFundController::class,'store']);
            Route::get('/pf/{type}/{id}/statement.pdf',[\App\Http\Controllers\Hr\ProvidentFundController::class,'statement'])->whereIn('type',['teacher','staff'])->whereNumber('id');
        });
        Route::middleware(['role:teacher','module:hr_payroll'])->prefix('teacher/salary')->group(function () {
            Route::get('/',[\App\Http\Controllers\Hr\TeacherSalaryController::class,'summary']);
            Route::get('/slips',[\App\Http\Controllers\Hr\TeacherSalaryController::class,'slips']);
            Route::get('/slips/{id}.pdf',[\App\Http\Controllers\Hr\TeacherSalaryController::class,'slip'])->whereNumber('id');
            Route::get('/history',[\App\Http\Controllers\Hr\TeacherSalaryController::class,'history']);
        });

        // D85 / R3.4: ordinary staff and leave records; no payroll execution.
        Route::middleware(['role:admin','module:teacher_attendance'])->group(function () {
            Route::get('/teacher-attendance',[TeacherAttendanceController::class,'index']);
            Route::post('/teacher-attendance',[TeacherAttendanceController::class,'store']);
        });
        Route::middleware(['role:admin,accountant,institution_staff','module:hr_payroll'])->prefix('hr')->group(function () {
            Route::get('/staff',[StaffController::class,'index']);
            Route::post('/staff',[StaffController::class,'store']);
            Route::get('/staff/{id}',[StaffController::class,'show']);
            Route::put('/staff/{id}',[StaffController::class,'update']);
            Route::delete('/staff/{id}',[StaffController::class,'destroy']);
            Route::get('/staff-attendance',[StaffAttendanceController::class,'index']);
            Route::post('/staff-attendance',[StaffAttendanceController::class,'store']);
            Route::middleware('role:admin')->group(function () {
                Route::get('/leave-types',[LeaveTypeController::class,'index']);
                Route::post('/leave-types',[LeaveTypeController::class,'store']);
                Route::put('/leave-types/{id}',[LeaveTypeController::class,'update']);
                Route::get('/leaves',[LeaveController::class,'index']);
                Route::post('/leaves',[LeaveController::class,'store']);
                Route::get('/leaves/balance',[LeaveController::class,'balance']);
            });
        });
        Route::middleware(['role:admin,teacher','module:hr_payroll'])->group(function () {
            Route::patch('/hr/leaves/{id}/{action}',[LeaveController::class,'transition'])->where('action','approve|reject|cancel');
        });
        Route::middleware(['role:teacher','module:hr_payroll'])->group(function () {
            Route::get('/teacher/leave',[LeaveController::class,'mine']);
            Route::post('/teacher/leave',[LeaveController::class,'apply']);
        });

        Route::middleware(['role:admin,teacher,institution_staff', 'module:attendance'])->group(function () {
            Route::get('/attendance',                     [AttendanceController::class, 'index']);    // ?batch_id=&date=
            Route::post('/attendance',                    [AttendanceController::class, 'store']);    // { batch_id, date, records[] }
            Route::put('/attendance/{id}',                [AttendanceController::class, 'update'])->whereNumber('id');
            Route::get('/attendance/report',              [AttendanceController::class, 'report']);   // ?batch_id=&month=
            Route::get('/attendance/summary/{id}',        [AttendanceController::class, 'summary'])->whereNumber('id');
        });

        Route::middleware(['module:cashbook'])->group(function () {
            Route::middleware('role:admin,accountant,institution_staff')->group(function () {
                Route::get('/cashbook', [\App\Http\Controllers\CashBook\CashBookController::class, 'show']);
                Route::get('/cashbook/range', [\App\Http\Controllers\CashBook\CashBookController::class, 'range']);
                Route::get('/cashbook/{date}/report.{ext}', [\App\Http\Controllers\CashBook\CashBookController::class, 'report']);
                Route::post('/cashbook/{date}/close', [\App\Http\Controllers\CashBook\CashBookController::class, 'close']);
            });
            Route::post('/cashbook/{date}/reopen', [\App\Http\Controllers\CashBook\CashBookController::class, 'reopen'])->middleware('role:admin');
        });

        // ── Fees (Step 4.4; slice: dues -> collect -> receipt) ──
        Route::middleware(['module:expenses', 'role:admin,accountant,institution_staff'])->group(function () {
            Route::get('/expenses/report', [\App\Http\Controllers\Expenses\ExpenseController::class, 'report']);
            Route::get('/expenses', [\App\Http\Controllers\Expenses\ExpenseController::class, 'index']);
            Route::post('/expenses', [\App\Http\Controllers\Expenses\ExpenseController::class, 'store']);
            Route::get('/expenses/{id}', [\App\Http\Controllers\Expenses\ExpenseController::class, 'show'])->whereNumber('id');
            Route::put('/expenses/{id}', [\App\Http\Controllers\Expenses\ExpenseController::class, 'update'])->whereNumber('id');
            Route::delete('/expenses/{id}', [\App\Http\Controllers\Expenses\ExpenseController::class, 'destroy'])->whereNumber('id');
        });

        // ── Store / inventory (R3.9, docs/modules/inventory.md) ──
        Route::middleware(['module:inventory', 'role:admin,accountant,institution_staff'])->group(function () {
            Route::get('/inventory/items', [\App\Http\Controllers\Inventory\InventoryItemController::class, 'index']);
            Route::post('/inventory/items', [\App\Http\Controllers\Inventory\InventoryItemController::class, 'store']);
            Route::put('/inventory/items/{id}', [\App\Http\Controllers\Inventory\InventoryItemController::class, 'update'])->whereNumber('id');
            Route::delete('/inventory/items/{id}', [\App\Http\Controllers\Inventory\InventoryItemController::class, 'destroy'])->whereNumber('id');
            Route::get('/inventory/items/{id}/ledger', [\App\Http\Controllers\Inventory\InventoryItemController::class, 'ledger'])->whereNumber('id');
            Route::get('/inventory/stock', [\App\Http\Controllers\Inventory\InventoryReportController::class, 'stock']);
            Route::get('/inventory/reports/{name}', [\App\Http\Controllers\Inventory\InventoryReportController::class, 'show']);   // name checked in the controller, after the role gate
            Route::get('/inventory/sales/{receipt_no}/receipt.pdf', [\App\Http\Controllers\Inventory\InventoryReportController::class, 'receipt']);
            Route::post('/inventory/{type}', [\App\Http\Controllers\Inventory\InventoryMovementController::class, 'store']);   // type checked in the controller, after the role gate (POST /inventory/items is matched first)
        });

        // R3.11 / D107: donations, funds and campaigns (docs/modules/donations.md §4); opt-in module
        Route::middleware(['role:admin,accountant','module:donations'])->group(function () {
            $d = 'App\\Http\\Controllers\\Donations\\';
            Route::get('/donors',[$d.'DonorController','index']);
            Route::post('/donors',[$d.'DonorController','store']);
            Route::get('/donors/{id}',[$d.'DonorController','show'])->whereNumber('id');
            Route::put('/donors/{id}',[$d.'DonorController','update'])->whereNumber('id');
            Route::delete('/donors/{id}',[$d.'DonorController','destroy'])->whereNumber('id');
            Route::get('/donors/{id}/statement.pdf',[$d.'DonorController','statement'])->whereNumber('id');
            Route::get('/donation-funds',[$d.'DonationFundController','index']);
            Route::post('/donation-funds',[$d.'DonationFundController','store']);
            Route::get('/donation-funds/{id}',[$d.'DonationFundController','show'])->whereNumber('id');
            Route::put('/donation-funds/{id}',[$d.'DonationFundController','update'])->whereNumber('id');
            Route::get('/donation-funds/{id}/statement',[$d.'DonationFundController','statement'])->whereNumber('id');
            Route::get('/donation-campaigns',[$d.'DonationCampaignController','index']);
            Route::post('/donation-campaigns',[$d.'DonationCampaignController','store']);
            Route::get('/donation-campaigns/{id}',[$d.'DonationCampaignController','show'])->whereNumber('id');
            Route::put('/donation-campaigns/{id}',[$d.'DonationCampaignController','update'])->whereNumber('id');
            Route::get('/donation-campaigns/{id}/progress',[$d.'DonationCampaignController','progress'])->whereNumber('id');
            Route::get('/donations',[$d.'DonationController','index']);
            Route::post('/donations',[$d.'DonationController','store']);
            Route::get('/donations/{id}',[$d.'DonationController','show'])->whereNumber('id');
            Route::post('/donations/{id}/reverse',[$d.'DonationController','reverse'])->whereNumber('id');
            Route::get('/donations/{id}/receipt.pdf',[$d.'DonationController','receipt'])->whereNumber('id');
        });

        // R3.10 / D106: double-entry accounting (docs/modules/accounting.md §6)
        Route::middleware(['role:admin,accountant','module:accounting'])->prefix('accounting')->group(function () {
            $a = 'App\\Http\\Controllers\\Accounting\\';
            Route::get('/accounts',[$a.'AccountController','index']);
            Route::post('/accounts',[$a.'AccountController','store']);
            Route::put('/accounts/{id}',[$a.'AccountController','update'])->whereNumber('id');
            Route::get('/accounts/tree',[$a.'AccountController','tree']);
            Route::get('/vouchers',[$a.'VoucherController','index']);
            Route::post('/vouchers',[$a.'VoucherController','store']);
            Route::get('/vouchers/{id}',[$a.'VoucherController','show'])->whereNumber('id');
            Route::post('/vouchers/{id}/{action}',[$a.'VoucherController','transition'])->whereNumber('id')->whereIn('action',['post','reverse']);
            Route::get('/budgets',[$a.'BudgetController','index']);
            Route::post('/budgets',[$a.'BudgetController','store']);
            Route::get('/budgets/{id}',[$a.'BudgetController','show'])->whereNumber('id');
            Route::put('/budgets/{id}',[$a.'BudgetController','update'])->whereNumber('id');
            Route::put('/budgets/{id}/lines',[$a.'BudgetController','lines'])->whereNumber('id');
            Route::post('/budgets/{id}/approve',[$a.'BudgetController','approve'])->whereNumber('id');
            Route::get('/reports/{name}',[$a.'AccountingReportController','show'])->whereIn('name',['trial-balance','ledger','income-expenditure','balance-sheet','budget-actual','unposted']);
            Route::get('/bank-reconciliation/{account_id}',[$a.'BankReconciliationController','show'])->whereNumber('account_id');
            Route::post('/bank-reconciliation/{account_id}/{action}',[$a.'BankReconciliationController','act'])->whereNumber('account_id')->whereIn('action',['import','match','unmatch']);
            Route::post('/opening-balances',[$a.'AccountingSettingController','opening']);
            Route::post('/repost',[$a.'AccountingSettingController','repost']);
            Route::put('/settings',[$a.'AccountingSettingController','update']);
        });

        Route::middleware('module:fees')->group(function () {
            Route::get('/fees/payments/student/{id}',     [FeeController::class, 'studentPayments'])->whereNumber('id')->middleware('role:admin,accountant,parent,institution_staff');   // parent: own child only (404)
            Route::middleware('role:admin,accountant,institution_staff')->group(function () {   // D101: staff request and process; approve/reject admin only (FeeRefundService)
                Route::get('/fee-refunds/refundable', [FeeRefundController::class, 'refundable']);
                Route::get('/fee-refunds', [FeeRefundController::class, 'index']);
                Route::post('/fee-refunds', [FeeRefundController::class, 'store']);
                Route::get('/fee-refunds/{id}', [FeeRefundController::class, 'show'])->whereNumber('id');
                Route::post('/fee-refunds/{id}/{action}', [FeeRefundController::class, 'transition'])->whereNumber('id')->whereIn('action', ['approve', 'reject', 'process']);
            });
            Route::middleware('role:admin,accountant,institution_staff')->group(function () {   // D101: department staff with exact staff.fee.* keys
                Route::post('/fees/collect',              [FeeController::class, 'collect']);
                Route::get('/fees/dues',                  [FeeController::class, 'dues']);
                Route::get('/fees/receipt/{id}',          [FeeController::class, 'receipt'])->whereNumber('id');
                Route::get('/fees/payments',              [FeeController::class, 'payments']);
            });
            Route::middleware('role:admin')->group(function () {
                Route::get('/fees/categories',            [FeeController::class, 'categories']);
                Route::post('/fees/categories',           [FeeController::class, 'storeCategory']);
                Route::put('/fees/categories/{id}',       [FeeController::class, 'updateCategory'])->whereNumber('id');
                Route::get('/fees/report',                [FeeController::class, 'report']);
            });
            Route::get('/parent/fees',                    [FeeController::class, 'dues'])->middleware('role:parent');
        });

        // ── Question bank (D65, QB.1): the admin links a program to a platform class ──
        Route::get('/qb/class-levels',                    [QbCurriculumController::class, 'classLevels'])->middleware(['role:admin', 'module:question_bank']);
        // ── Question bank (D65, QB.5): teachers read published concepts and resources; body / file only once unlocked ──
        Route::middleware(['role:admin,teacher,institution_staff', 'module:question_bank'])->prefix('question-bank')->group(function () {
            Route::get('/curriculum',                     [QbLibraryController::class, 'curriculum']);
            Route::get('/concepts',                       [QbLibraryController::class, 'concepts']);
            Route::get('/concepts/{id}',                  [QbLibraryController::class, 'concept'])->whereNumber('id');
            Route::get('/resources',                      [QbLibraryController::class, 'resources']);
            Route::get('/resources/{id}',                 [QbLibraryController::class, 'resource'])->whereNumber('id');
            // QB.7: questions free to read (answers locked); buying from the institution wallet, once per institution (D66)
            Route::get('/questions',                      [QbPurchaseController::class, 'questions']);
            Route::get('/questions/{id}',                 [QbPurchaseController::class, 'question'])->whereNumber('id');
            Route::get('/quote',                          [QbPurchaseController::class, 'quote']);
            Route::post('/buy',                           [QbPurchaseController::class, 'buy']);
            Route::get('/spending',                       [QbPurchaseController::class, 'spending'])->middleware('role:admin');
            Route::put('/caps',                           [QbPurchaseController::class, 'caps'])->middleware('role:admin');
            Route::post('/buy-many',                      [QbPurchaseController::class, 'buyMany']);
            // QB.8: question papers - a teacher's own, the head teacher's view of all
            Route::get('/papers',                         [QbPaperController::class, 'index']);
            Route::post('/papers',                        [QbPaperController::class, 'store']);
            Route::get('/papers/{id}',                    [QbPaperController::class, 'show'])->whereNumber('id');
            Route::put('/papers/{id}',                    [QbPaperController::class, 'update'])->whereNumber('id');
            Route::delete('/papers/{id}',                 [QbPaperController::class, 'destroy'])->whereNumber('id');
            Route::post('/papers/{id}/finalize',          [QbPaperController::class, 'finalize'])->whereNumber('id');
            Route::get('/papers/{id}/pdf',                [QbPaperController::class, 'pdf'])->whereNumber('id');
            Route::middleware('role:admin,teacher')->group(function () {   // D127: admin and teachers manage OMR forms, not department staff
                Route::get('/papers/{id}/omr-form', [QbOmrFormController::class, 'show'])->whereNumber('id');
                Route::put('/papers/{id}/omr-form', [QbOmrFormController::class, 'save'])->whereNumber('id');
                Route::post('/papers/{id}/omr-form/generate', [QbOmrFormController::class, 'generate'])->whereNumber('id');
                Route::post('/papers/{id}/omr-form/unlock', [QbOmrFormController::class, 'unlock'])->whereNumber('id');
                Route::get('/papers/{id}/omr-form/pdf', [QbOmrFormController::class, 'pdf'])->whereNumber('id');
                Route::post('/papers/{id}/omr-form/scans', [QbOmrFormController::class, 'storeScans'])->whereNumber('id');
                Route::get('/papers/{id}/omr-form/scans', [QbOmrFormController::class, 'scans'])->whereNumber('id');
                Route::put('/omr-scans/{id}', [QbOmrFormController::class, 'updateScan'])->whereNumber('id');
                Route::post('/omr-scans/{id}/approve', [QbOmrFormController::class, 'approveScan'])->whereNumber('id');
                Route::post('/omr-scans/{id}/cancel', [QbOmrFormController::class, 'cancelScan'])->whereNumber('id');
                Route::get('/omr-scans/{id}/image', [QbOmrFormController::class, 'scanImage'])->whereNumber('id');
                Route::get('/papers/{id}/omr-form/results.csv', [QbOmrFormController::class, 'resultsCsv'])->whereNumber('id');
            });
            // R2.1.5 (D126 (1)): qbank's folders for papers - the head teacher and teachers (not a D90 staff duty)
            Route::middleware('role:admin,teacher')->group(function () {
                Route::get('/paper-folders',              [QbPaperFolderController::class, 'index']);
                Route::post('/paper-folders',             [QbPaperFolderController::class, 'store']);
                Route::put('/paper-folders/{id}',         [QbPaperFolderController::class, 'update'])->whereNumber('id');
                Route::delete('/paper-folders/{id}',      [QbPaperFolderController::class, 'destroy'])->whereNumber('id');
                Route::put('/papers/{id}/folder',         [QbPaperFolderController::class, 'movePaper'])->whereNumber('id');
                Route::get('/blueprints',                 [QbBlueprintController::class, 'available']);   // D126 (3)
                Route::post('/blueprints/{id}/plan',      [QbBlueprintController::class, 'plan'])->whereNumber('id');
                Route::get('/blueprints/{id}/candidates', [QbBlueprintController::class, 'candidates'])->whereNumber('id');
            });
        });
        // ── Question bank (D65, QB.9): the student portal - own unlocks, bKash orders to the platform merchant ──
        Route::middleware(['role:student', 'module:question_bank'])->prefix('student/qb')->group(function () {
            Route::get('/curriculum',                     [QbStudentController::class, 'curriculum']);
            Route::get('/questions',                      [QbStudentController::class, 'questions']);
            Route::get('/questions/{id}',                 [QbStudentController::class, 'question'])->whereNumber('id');
            Route::get('/concepts',                       [QbStudentController::class, 'concepts']);
            Route::get('/concepts/{id}',                  [QbStudentController::class, 'concept'])->whereNumber('id');
            Route::post('/orders',                        [QbStudentController::class, 'order'])->middleware('throttle:10,1');
            Route::get('/orders/{ref}',                   [QbStudentController::class, 'orderStatus']);
        });
        // ── Question bank (D66, QB.10): the student's quizzes - free / public / package (while access lasts); marked on the server ──
        Route::middleware(['role:student', 'module:quiz'])->prefix('student/qb')->group(function () {
            Route::get('/quizzes',                        [QbStudentQuizController::class, 'index']);
            Route::get('/quiz-packages',                  [QbStudentQuizController::class, 'packages']);
            Route::post('/quiz-packages/{id}/buy',        [QbStudentQuizController::class, 'buy'])->whereNumber('id')->middleware('throttle:10,1');
            Route::post('/quizzes/{id}/attempts',         [QbStudentQuizController::class, 'start'])->whereNumber('id');
            Route::get('/attempts',                       [QbStudentQuizController::class, 'attempts']);
            Route::get('/attempts/{id}',                  [QbStudentQuizController::class, 'attempt'])->whereNumber('id');
            Route::put('/attempts/{id}',                  [QbStudentQuizController::class, 'save'])->whereNumber('id');
            Route::post('/attempts/{id}/submit',          [QbStudentQuizController::class, 'submit'])->whereNumber('id');
        });

        // ── SMS (Step 4.6): log and balance; sending happens from attendance / fee collection through SendSmsJob ──
        Route::middleware('module:sms')->group(function () {
            Route::get('/sms-logs',                       [SmsLogController::class, 'index'])->middleware('role:admin,accountant,institution_staff');
            Route::get('/subscription/sms-credits',       [SmsCreditController::class, 'balance'])->middleware('role:admin');
            Route::post('/subscription/sms-credits',      [SmsCreditController::class, 'purchase'])->middleware(['role:admin', 'throttle:10,1']);   // D58: bKash recharge
            // D59: the universal / own API switches and the institution's own BulkSMSBD key + masking sender
            Route::middleware('role:admin')->group(function () {
                Route::get('/admin/settings/sms-sender',    [SmsSenderController::class, 'show']);
                Route::put('/admin/settings/sms-sender',    [SmsSenderController::class, 'update']);
                Route::delete('/admin/settings/sms-sender', [SmsSenderController::class, 'destroy']);
            });
        });

        // ── Dashboards (Step 4.7) ──
        Route::get('/admin/dashboard',                    [DashboardController::class, 'admin'])->middleware('role:admin');
        Route::get('/accountant/dashboard',               [DashboardController::class, 'accountant'])->middleware('role:accountant,institution_staff');
        Route::get('/teacher/dashboard',                  [DashboardController::class, 'teacher'])->middleware('role:teacher,institution_staff');

        // ── Reports (Step 4.8): PDF / Excel ──
        Route::middleware('module:reports')->group(function () {
            Route::get('/admin/reports/{type}',           [ReportController::class, 'generate'])->middleware('role:admin');
            Route::get('/accountant/reports/{type}',      [ReportController::class, 'financial'])->middleware('role:accountant,institution_staff');
        });

        // ── Exams & results (Step 4.5) ──
        Route::middleware('module:exams')->group(function () {
            Route::middleware('role:admin')->group(function () {
                Route::get('/exams',                      [ExamController::class, 'index']);
                Route::post('/exams',                     [ExamController::class, 'store']);
                Route::get('/exams/{id}',                 [ExamController::class, 'show'])->whereNumber('id');
                Route::put('/exams/{id}',                 [ExamController::class, 'update'])->whereNumber('id');
                Route::delete('/exams/{id}',              [ExamController::class, 'destroy'])->whereNumber('id');
                Route::post('/exams/{id}/publish',        [ExamController::class, 'publish'])->whereNumber('id');
                Route::get('/exams/{id}/subjects',        [ExamController::class, 'subjects'])->whereNumber('id');
                Route::put('/exams/{id}/subjects',        [ExamController::class, 'updateSubjects'])->whereNumber('id');
                // D158 (3): an exam subject's linked question paper
                Route::put('/exams/{id}/subjects/{subjectId}/paper',    [ExamController::class, 'linkPaper'])->whereNumber(['id', 'subjectId']);
                Route::delete('/exams/{id}/subjects/{subjectId}/paper', [ExamController::class, 'unlinkPaper'])->whereNumber(['id', 'subjectId']);
                Route::get('/exams/{id}/merit-list',      [ExamController::class, 'meritList'])->whereNumber('id');   // D158 (2), coaching-private-batch.md
                Route::get('/exams/{id}/result-sms',      [ExamController::class, 'resultSmsReport'])->whereNumber('id');   // D161 (2)
                Route::post('/exams/{id}/result-sms',     [ExamController::class, 'sendResultSms'])->whereNumber('id');
            });
            Route::middleware('role:admin,teacher,institution_staff')->group(function () {
                Route::get('/results',                    [ResultController::class, 'index']);
                Route::get('/exams/{id}/subjects/{subjectId}/entry', [ResultController::class, 'entrySheet'])->whereNumber(['id', 'subjectId']);
                Route::post('/results/bulk',              [ResultController::class, 'bulkStore']);
                Route::put('/results/{id}',               [ResultController::class, 'update'])->whereNumber('id');
            });
            // D158 (5)(6): the MCQ part from pasted JSON or from the linked paper's graded OMR sheets (preview, then save)
            Route::middleware('role:admin,teacher')->group(function () {
                Route::post('/exams/{id}/subjects/{subjectId}/mcq-import', [ResultController::class, 'mcqImport'])->whereNumber(['id', 'subjectId']);
                // D162: draft -> submit to the head -> update request -> approve / reject (the head: approve, reject, reopen)
                Route::post('/exams/{id}/subjects/{subjectId}/submission', [ResultController::class, 'submission'])->whereNumber(['id', 'subjectId']);
            });
            Route::get('/results/marksheet/{studentId}',  [ResultController::class, 'marksheet'])->whereNumber('studentId')->middleware('role:admin,teacher,parent,institution_staff');
            Route::get('/parent/children/{id}/results',   [ResultController::class, 'forParent'])->whereNumber('id')->middleware('role:parent');
        });

        // ── Parent (Step 4.7) ──
        Route::middleware('role:parent')->group(function () {
            Route::get('/parent/children',                [DashboardController::class, 'parentChildren']);
            Route::get('/parent/dashboard',               [DashboardController::class, 'parent']);
            Route::get('/parent/children/{id}/attendance', [AttendanceController::class, 'forParent'])->whereNumber('id')->middleware('module:attendance');
            Route::get('/parent/consents',                [ConsentController::class, 'mine'])->middleware('module:students');
            Route::put('/parent/consents/{type}',         [ConsentController::class, 'update'])->middleware('module:students');
            Route::get('/parent/children/{id}/export',    [StudentPrivacyController::class, 'export'])->whereNumber('id');   // Step 8.1: privacy-and-consent.md 5.2
        });
    });
});
