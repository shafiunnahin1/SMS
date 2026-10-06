<?php

use App\Http\Controllers\Admin\{SettingController, TerminologyController, ThemeController};
use App\Http\Controllers\Public\BootstrapController;
use App\Http\Controllers\Auth\{LoginController, PasswordResetController, SessionController};
use Illuminate\Support\Facades\Route;

// Structure: docs/templates/laravel-core-files.md "routes/api.php". Every group runs on exactly one kind of host.
Route::prefix('v1')->group(function () {

    // ─── 1. Any host ───────────────────────────────────────────
    Route::middleware('tenant:optional')->group(function () {
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
    Route::middleware(['tenant', 'auth:sanctum', 'tenant.user', 'password.fresh', 'subscription'])->group(function () {
        Route::patch('/auth/change-password', [PasswordResetController::class, 'changePassword']);
        Route::get('/auth/sessions',          [SessionController::class, 'index']);
        Route::delete('/auth/sessions/{id}',  [SessionController::class, 'destroy'])->whereNumber('id');
        Route::post('/auth/logout-all',       [SessionController::class, 'logoutAll']);
        Route::put('/auth/locale',            [LoginController::class, 'locale']);

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
        });
    });
});
