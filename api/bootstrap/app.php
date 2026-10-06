<?php

use App\Exceptions\TenantNotBoundException;
use App\Http\Middleware\{EnsureUserBelongsToTenant, PlatformScope, RoleMiddleware, TenantMiddleware};
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
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
            'role'           => RoleMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // A tenant model used without a bound tenant is a code bug that could have leaked data: alert loudly
        $exceptions->level(TenantNotBoundException::class, LogLevel::CRITICAL);
    })->create();
