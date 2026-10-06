<?php

use App\Exceptions\TenantNotBoundException;
use App\Http\Middleware\{AcademicYearMiddleware, EnsureUserBelongsToTenant, FeatureMiddleware, ModuleMiddleware, PlatformScope,
    RoleMiddleware, SubscriptionCheck, TenantMiddleware};
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Psr\Log\LogLevel;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'tenant'         => TenantMiddleware::class,            // modes: tenant | tenant:optional | tenant:central
            'tenant.user'    => EnsureUserBelongsToTenant::class,
            'tenancy.bypass' => PlatformScope::class,               // Super Admin /super/* only
            'module'         => ModuleMiddleware::class,
            'feature'        => FeatureMiddleware::class,
            'role'           => RoleMiddleware::class,
            'subscription'   => SubscriptionCheck::class,
            'academic_year'  => AcademicYearMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // A tenant model used without a bound tenant is a code bug that could have leaked data: alert loudly
        $exceptions->level(TenantNotBoundException::class, LogLevel::CRITICAL);

        // Standard error envelope for the API (docs/API-ERRORS.md)
        $api = fn (Request $request) => $request->is('api/*');
        $exceptions->render(fn (AuthenticationException $e, Request $request) => $api($request)
            ? response()->json(['success' => false, 'error' => 'unauthenticated', 'message' => 'লগিন করুন'], 401) : null);
        $exceptions->render(fn (ValidationException $e, Request $request) => $api($request)
            ? response()->json(['success' => false, 'error' => 'validation_failed', 'message' => 'ইনপুট যাচাইয়ে ত্রুটি', 'errors' => $e->errors()], 422) : null);
        $exceptions->render(fn (ModelNotFoundException $e, Request $request) => $api($request)
            ? response()->json(['success' => false, 'error' => 'not_found', 'message' => 'তথ্য পাওয়া যায়নি'], 404) : null);
    })->create();
