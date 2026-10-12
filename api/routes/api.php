<?php

use App\Http\Controllers\Academic\{AttendanceController, BatchController, ConsentController, EnrollmentController, ProgramController, StudentController, SubjectController, TeacherController};
use App\Http\Controllers\Admin\{ImportController, SettingController, TerminologyController, ThemeController};
use App\Http\Controllers\Exams\{ExamController, ResultController};
use App\Http\Controllers\Fees\FeeController;
use App\Http\Controllers\Sms\{SmsCreditController, SmsLogController, SmsSenderController};
use App\Http\Controllers\Public\{BootstrapController, HealthController};
use App\Http\Controllers\QuestionBank\{QbConceptController, QbCurriculumController, QbEarningController, QbLibraryController, QbMediaController, QbPaperController, QbPricingController, QbPurchaseController, QbQuestionController, QbPublicQuizController, QbQuizController, QbResourceController, QbStudentController, QbStudentOrderCallbackController, QbStudentQuizController, QbWithdrawalController, QbWriterController};
use App\Http\Controllers\Privacy\StudentPrivacyController;
use App\Http\Controllers\Reports\ReportController;
use App\Http\Controllers\Shared\{AuditLogController, DashboardController, NotificationController};
use App\Http\Controllers\SuperAdmin\{InstitutionController, TenantPurgeController, UniversalSmsController};
use App\Http\Controllers\Auth\{LoginController, PasswordResetController, SessionController};
use Illuminate\Support\Facades\Route;

// Structure: docs/templates/laravel-core-files.md "routes/api.php". Every group runs on exactly one kind of host.
Route::prefix('v1')->group(function () {

    // ─── 1. Any host ───────────────────────────────────────────
    Route::middleware(['tenant:optional', 'locale'])->group(function () {
        Route::get('/health',                 HealthController::class);   // invokable: a closure would break route:cache
        Route::get('/bootstrap',              [BootstrapController::class, 'show']);
        Route::post('/auth/login',            [LoginController::class, 'login'])->middleware('throttle:login');
        Route::post('/auth/verify-otp',       [LoginController::class, 'verifyOtp'])->middleware('throttle:login');
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

    // ─── 2. Central host only: Super Admin (Step 4.7 dashboard, Step 5.3 panel) ───
    Route::middleware(['tenant:central', 'locale', 'auth:sanctum', 'role:super_admin', 'tenancy.bypass'])->prefix('super')->group(function () {
        Route::get('/dashboard',              [DashboardController::class, 'superAdmin']);
        // Step 5.3 (D55-D58): institutions, their SMS wallet, the universal SMS API
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
        Route::post('/qb/{kind}',                     [QbCurriculumController::class, 'store']);
        Route::put('/qb/{kind}/{id}',                 [QbCurriculumController::class, 'update'])->whereNumber('id');
        Route::delete('/qb/{kind}/{id}',              [QbCurriculumController::class, 'destroy'])->whereNumber('id');
    });

    // ─── 2b. Central host: the question-bank writers' panel (D65, QB.2) - platform content only, no tenant bound, no bypass ───
    Route::middleware(['tenant:central', 'locale', 'auth:sanctum', 'role:content_writer,content_moderator,super_admin', 'password.fresh'])->prefix('writer')->group(function () {
        Route::patch('/change-password',              [QbWriterController::class, 'changePassword']);
        // QB.10b: the writer's own earnings and withdrawal requests
        Route::middleware('role:content_writer')->group(function () {
            Route::get('/earnings',                   [QbEarningController::class, 'summary']);
            Route::get('/withdrawals',                [QbEarningController::class, 'withdrawals']);
            Route::post('/withdrawals',               [QbEarningController::class, 'requestWithdrawal'])->middleware('throttle:10,1');
        });
        Route::get('/curriculum',                     [QbQuestionController::class, 'curriculum']);
        Route::get('/question-types',                 [QbQuestionController::class, 'types']);
        Route::get('/questions',                      [QbQuestionController::class, 'index']);
        Route::post('/questions',                     [QbQuestionController::class, 'store'])->middleware('role:content_writer,super_admin');
        Route::get('/questions/{id}',                 [QbQuestionController::class, 'show'])->whereNumber('id');
        Route::put('/questions/{id}',                 [QbQuestionController::class, 'update'])->whereNumber('id')->middleware('role:content_writer,super_admin');
        Route::get('/questions/{id}/revisions',       [QbQuestionController::class, 'revisions'])->whereNumber('id');
        Route::post('/media',                         [QbMediaController::class, 'store'])->middleware('role:content_writer,super_admin');
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

    // ─── 3. Tenant host only ───────────────────────────────────
    Route::middleware(['tenant', 'locale', 'auth:sanctum', 'tenant.user', 'password.fresh', 'subscription'])->group(function () {
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
        Route::get('/teacher/batches',            [BatchController::class, 'mine'])->middleware('role:teacher');

        // ── Institution Admin ─────────────────────────────────
        Route::middleware('role:admin')->group(function () {
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
            Route::get('/programs/{id}',                  [ProgramController::class, 'show'])->whereNumber('id');
            Route::put('/programs/{id}',                  [ProgramController::class, 'update'])->whereNumber('id');
            Route::delete('/programs/{id}',               [ProgramController::class, 'destroy'])->whereNumber('id');
            Route::post('/batches',                       [BatchController::class, 'store']);
            Route::get('/batches/{id}',                   [BatchController::class, 'show'])->whereNumber('id');
            Route::put('/batches/{id}',                   [BatchController::class, 'update'])->whereNumber('id');
            Route::delete('/batches/{id}',                [BatchController::class, 'destroy'])->whereNumber('id');
            Route::get('/batches/{id}/students',          [BatchController::class, 'students'])->whereNumber('id');
            Route::get('/subjects',                       [SubjectController::class, 'index']);
            Route::post('/subjects',                      [SubjectController::class, 'store']);
            Route::get('/subjects/{id}',                  [SubjectController::class, 'show'])->whereNumber('id');
            Route::put('/subjects/{id}',                  [SubjectController::class, 'update'])->whereNumber('id');
            Route::delete('/subjects/{id}',               [SubjectController::class, 'destroy'])->whereNumber('id');
            Route::get('/teachers',                       [TeacherController::class, 'index']);
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
        Route::middleware(['role:admin,teacher', 'module:attendance'])->group(function () {
            Route::get('/attendance',                     [AttendanceController::class, 'index']);    // ?batch_id=&date=
            Route::post('/attendance',                    [AttendanceController::class, 'store']);    // { batch_id, date, records[] }
            Route::put('/attendance/{id}',                [AttendanceController::class, 'update'])->whereNumber('id');
            Route::get('/attendance/report',              [AttendanceController::class, 'report']);   // ?batch_id=&month=
            Route::get('/attendance/summary/{id}',        [AttendanceController::class, 'summary'])->whereNumber('id');
        });

        // ── Fees (Step 4.4; slice: dues -> collect -> receipt) ──
        Route::middleware('module:fees')->group(function () {
            Route::get('/fees/payments/student/{id}',     [FeeController::class, 'studentPayments'])->whereNumber('id')->middleware('role:admin,accountant,parent');   // parent: own child only (404)
            Route::middleware('role:admin,accountant')->group(function () {
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
        Route::middleware(['role:admin,teacher', 'module:question_bank'])->prefix('question-bank')->group(function () {
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
            Route::get('/sms-logs',                       [SmsLogController::class, 'index'])->middleware('role:admin,accountant');
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
        Route::get('/accountant/dashboard',               [DashboardController::class, 'accountant'])->middleware('role:accountant');
        Route::get('/teacher/dashboard',                  [DashboardController::class, 'teacher'])->middleware('role:teacher');

        // ── Reports (Step 4.8): PDF / Excel ──
        Route::middleware('module:reports')->group(function () {
            Route::get('/admin/reports/{type}',           [ReportController::class, 'generate'])->middleware('role:admin');
            Route::get('/accountant/reports/{type}',      [ReportController::class, 'financial'])->middleware('role:accountant');
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
            });
            Route::middleware('role:admin,teacher')->group(function () {
                Route::get('/results',                    [ResultController::class, 'index']);
                Route::get('/exams/{id}/subjects/{subjectId}/entry', [ResultController::class, 'entrySheet'])->whereNumber(['id', 'subjectId']);
                Route::post('/results/bulk',              [ResultController::class, 'bulkStore']);
                Route::put('/results/{id}',               [ResultController::class, 'update'])->whereNumber('id');
            });
            Route::get('/results/marksheet/{studentId}',  [ResultController::class, 'marksheet'])->whereNumber('studentId')->middleware('role:admin,teacher,parent');
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
