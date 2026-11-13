<?php

use App\Http\Controllers\Public\PublicShellController;
use Illuminate\Support\Facades\Route;

// D202 PUB.4 (docs/modules/public-website.md "SEO Shell"): exactly the paths infra/nginx.conf sends to Laravel. No `web` group:
// no session, no CSRF, no cookie. The controller reads the tenant from the Host itself and binds nothing.
Route::get('/',            [PublicShellController::class, 'home']);
Route::get('/notices',     [PublicShellController::class, 'notices']);
Route::get('/admission',   [PublicShellController::class, 'admission']);
Route::get('/privacy',     [PublicShellController::class, 'privacy']);
Route::get('/terms',       [PublicShellController::class, 'terms']);
Route::get('/robots.txt',  [PublicShellController::class, 'robots']);
Route::get('/sitemap.xml', [PublicShellController::class, 'sitemap']);
