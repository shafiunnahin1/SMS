<?php

namespace App\Providers;

use App\Models\User;
use App\Observers\UserObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        User::observe(UserObserver::class);

        // IDLE timeout + deactivated users. Must live in Sanctum's callback, NOT in a middleware: Sanctum overwrites
        // last_used_at before any middleware runs, so a middleware would always see "just now" (docs/AUTHORIZATION.md).
        Sanctum::authenticateAccessTokensUsing(function ($accessToken, bool $isValid) {
            if (!$isValid) return false;
            $user = $accessToken->tokenable;
            if (!$user || !$user->is_active) return false;
            [, $idle] = config("auth_policy.tokens.{$user->role}") ?? [null, 60];
            return !($accessToken->last_used_at && $accessToken->last_used_at->lt(now()->subMinutes($idle)));
        });

        // IP + identifier: slows guessing before the account lockout kicks in
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)->by($request->ip() . '|' . mb_strtolower((string) $request->input('login'))));
    }
}
