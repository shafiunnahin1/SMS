<?php

use App\Http\Controllers\Academic\{AttendanceController, BatchController, ConsentController, EnrollmentController, ProgramController, StudentController, SubjectController, TeacherController};
use App\Http\Controllers\Admin\{SettingController, TerminologyController, ThemeController};
use App\Http\Controllers\Fees\FeeController;
use App\Http\Controllers\Public\{BootstrapController, HealthController};
use App\Http\Controllers\Shared\{AuditLogController, DashboardController, NotificationController};
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
            });
            Route::post('/enrollments',                   [EnrollmentController::class, 'store'])->middleware('module:enrollments');
        });

        // ── Admin + Teacher: attendance (Step 4.3; Spike S5b) ──
        Route::middleware(['role:admin,teacher', 'module:attendance'])->group(function () {
            Route::get('/attendance',                     [AttendanceController::class, 'index']);    // ?batch_id=&date=
            Route::post('/attendance',                    [AttendanceController::class, 'store']);    // { batch_id, date, records[] }
        });

        // ── Fees (Step 4.4; slice: dues -> collect -> receipt) ──
        Route::middleware('module:fees')->group(function () {
            Route::get('/fees/payments/student/{id}',     [FeeController::class, 'studentPayments'])->whereNumber('id');   // admin, accountant, own child's parent
            Route::middleware('role:admin,accountant')->group(function () {
                Route::post('/fees/collect',              [FeeController::class, 'collect']);
                Route::get('/fees/dues',                  [FeeController::class, 'dues']);
                Route::get('/fees/receipt/{id}',          [FeeController::class, 'receipt'])->whereNumber('id');
            });
            Route::get('/parent/fees',                    [FeeController::class, 'dues'])->middleware('role:parent');
        });

        // ── Parent (Step 4.7) ──
        Route::middleware('role:parent')->group(function () {
            Route::get('/parent/children',                [DashboardController::class, 'parentChildren']);
            Route::get('/parent/consents',                [ConsentController::class, 'mine'])->middleware('module:students');
            Route::put('/parent/consents/{type}',         [ConsentController::class, 'update'])->middleware('module:students');
        });
    });
});
