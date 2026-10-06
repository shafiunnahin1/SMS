<?php

use App\Http\Controllers\Admin\TerminologyController;
use Illuminate\Support\Facades\Route;

// Structure: docs/templates/laravel-core-files.md "routes/api.php". Every group runs on exactly one kind of host.
Route::prefix('v1')->group(function () {

    // ─── Tenant host only ───────────────────────────────────────
    Route::middleware(['tenant', 'auth:sanctum', 'tenant.user', 'subscription'])->group(function () {

        // ── Institution Admin ─────────────────────────────────
        Route::middleware('role:admin')->group(function () {
            Route::get('/admin/settings/terminology', [TerminologyController::class, 'show']);
            Route::put('/admin/settings/terminology', [TerminologyController::class, 'update']);
        });
    });
});
