<?php

use App\Exceptions\TenantNotBoundException;
use App\Http\Middleware\{AcademicYearMiddleware, EnsureHostUser, EnsurePasswordChanged, EnsureUserBelongsToTenant, FeatureMiddleware, ModuleMiddleware, PlatformScope,
    RoleMiddleware, SubscriptionCheck, TenantMiddleware};
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Psr\Log\LogLevel;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // D51: requests from our own SPA (same host) get a session + CSRF check (Sanctum stateful); SessionBearer then uses the
        // session's token. Requests without a matching Referer/Origin (mobile, API clients, tests) stay stateless Bearer requests.
        $middleware->statefulApi();
        $middleware->appendToGroup('api', \App\Http\Middleware\SessionBearer::class);
        // Laravel sorts middleware by priority and would run `auth:sanctum` first: the session's token must be in place before it
        $middleware->prependToPriorityList(\Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class, \App\Http\Middleware\SessionBearer::class);
        $middleware->alias([
            'tenant'         => TenantMiddleware::class,            // modes: tenant | tenant:optional | tenant:central
            'tenant.user'    => EnsureUserBelongsToTenant::class,
            'host.user'      => EnsureHostUser::class,              // routes on both hosts (/auth/me, /auth/logout)
            'password.fresh' => EnsurePasswordChanged::class,
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
        // Laravel turns ModelNotFoundException into this before render callbacks run; also covers unknown API paths
        $exceptions->render(fn (NotFoundHttpException $e, Request $request) => $api($request)
            ? response()->json(['success' => false, 'error' => 'not_found', 'message' => 'তথ্য পাওয়া যায়নি'], 404) : null);
    })->create();
