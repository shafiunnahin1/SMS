<?php

namespace App\Providers;

use App\Models\User;
use App\Observers\UserObserver;
use App\Services\{ModuleGate, NotificationService, PdfService, SmsService, ThemeService};
use App\Services\Sms\{BulkSmsBdGateway, LogSmsGateway, SmsGateway, SslWirelessGateway};
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(SmsGateway::class, fn () => match (config('services.sms.driver')) {
            'bulksmsbd'    => new BulkSmsBdGateway(),
            'ssl_wireless' => new SslWirelessGateway(),
            default        => new LogSmsGateway(),
        });
        foreach ([SmsService::class, PdfService::class, NotificationService::class, ThemeService::class, ModuleGate::class] as $service) {
            $this->app->singleton($service);
        }
    }

    public function boot(): void
    {
        User::observe(UserObserver::class);

        // R3.10 (accounting.md §3): money records ask for their voucher after their own transaction commits
        $post = fn (string $source, $model) => \App\Jobs\PostAccountingVoucher::dispatch($source, (int) $model->id, (int) $model->institution_id)->afterCommit();
        \App\Models\FeePayment::created(function ($m) use ($post) { if ((int) $m->line_no === 1 && !$m->reverses_id && \App\Support\Money::toPaisa((string) $m->paid_amount) > 0) $post('fee', $m); });
        \App\Models\FeeRefund::created(function ($m) use ($post) { if ($m->status === 'processed') $post('refund', $m); });
        \App\Models\Expense::created(function ($m) use ($post) { if (!in_array($m->source, ['refund', 'payroll', 'advance', 'store'], true)) $post('expense', $m); });
        \App\Models\PayrollRun::updated(function ($m) use ($post) { if ($m->status === 'paid' && $m->wasChanged('status')) $post('payroll', $m); });
        \App\Models\SalaryAdvance::updated(function ($m) use ($post) { if ($m->expense_id && $m->wasChanged('expense_id')) $post('advance', $m); });
        \App\Models\InventoryMovement::created(function ($m) use ($post) { if (in_array($m->type, ['sale', 'return'], true)) $post('store', $m); });
        \App\Models\Donation::created(fn ($m) => $post('donation', $m));

        // Step 9.1 (D64): queue alerts - a backlog over QUEUE_ALERT_DEPTH (queue:monitor, scheduled) and a job that failed for good
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Queue\Events\QueueBusy::class, fn ($e) => app(\App\Services\Ops\AlertService::class)
            ->send('Queue backlog', ['queue' => $e->connection . ':' . $e->queue, 'jobs waiting' => $e->size, 'limit' => config('monitoring.queue_depth')], "queue-busy:{$e->connection}:{$e->queue}"));
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Queue\Events\JobFailed::class, fn ($e) => app(\App\Services\Ops\AlertService::class)
            ->send('Queue job failed', ['job' => $e->job->resolveName(), 'queue' => $e->connectionName . ':' . $e->job->getQueue(), 'error' => get_class($e->exception)], 'job-failed:' . $e->job->resolveName()));

        // IDLE timeout + deactivated users. Must live in Sanctum's callback, NOT in a middleware: Sanctum overwrites
        // last_used_at before any middleware runs, so a middleware would always see "just now" (docs/AUTHORIZATION.md).
        Sanctum::authenticateAccessTokensUsing(function ($accessToken, bool $isValid) {
            if (!$isValid) return false;
            $user = $accessToken->tokenable;
            if (!$user || !$user->is_active) return false;
            [, $idle] = config("auth_policy.tokens.{$user->role}") ?? [null, 60];
            // a token never used since login is idle from its creation (found in Step 3.5: last_used_at is NULL until the first use)
            $lastSeen = $accessToken->last_used_at ?? $accessToken->created_at;
            return !($lastSeen && $lastSeen->lt(now()->subMinutes($idle)));
        });

        RateLimiter::for('signup', fn (Request $r) => Limit::perHour(config('auth_policy.activation.signup_per_hour'))->by($r->ip()));
        RateLimiter::for('activation-verify', fn (Request $r) => Limit::perMinute(config('auth_policy.activation.verify_per_minute'))
            ->by(hash('sha256', is_string($r->input('public_id')) ? $r->input('public_id') : '').'|'.$r->ip()));
        RateLimiter::for('activation-resend', function (Request $r) {
            $value = $r->input('contact.value');
            $value = is_string($value) ? $value : '';
            $channel = $r->input('contact.channel') === 'phone' ? 'phone' : 'email';
            $value = $channel === 'phone' ? User::normalisePhone($value) : mb_strtolower(trim($value));
            $fingerprint = hash_hmac('sha256', $channel.'|'.$value, (string) config('app.key'));
            return [Limit::perMinute(config('auth_policy.activation.resend_per_minute'))->by('request:'.hash('sha256', is_string($r->input('public_id')) ? $r->input('public_id') : '')),
                Limit::perHour(config('auth_policy.activation.resend_contact_per_hour'))->by('contact:'.$fingerprint)];
        });

        RateLimiter::for('staff-activation-reissue', function (Request $r) {
            if ($r->user()?->role !== 'admin') return Limit::none(); // Preserve role-denial precedence; no invitation is sent.
            $tenant = \App\Support\Tenancy::current();
            $user = $tenant ? User::inTenant()->where('role', 'institution_staff')->whereKey($r->route('id'))->first() : null;
            $channel = $user?->email ? 'email' : 'phone';
            $value = $user?->email ? mb_strtolower(trim($user->email)) : User::normalisePhone($user?->phone);
            $fingerprint = hash_hmac('sha256', $channel.'|'.$value, (string) config('app.key'));
            $key = ($tenant?->id ?? 0).':'.$r->route('id');
            return [Limit::perMinute(config('auth_policy.activation.resend_per_minute'))->by('staff:'.$key),
                Limit::perHour(config('auth_policy.activation.resend_contact_per_hour'))->by('contact:'.($user ? $fingerprint : hash('sha256', $key)))];
        });

        // IP + identifier: slows guessing before the account lockout kicks in
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)->by($request->ip() . '|' . mb_strtolower((string) $request->input('login'))));
        // D68 (4): the code check counts per IP and per login attempt (its challenge), not per IP alone - a school's shared IP no longer
        // blocks everyone; each code is also voided after OtpService::MAX_WRONG wrong tries
        RateLimiter::for('otp', fn (Request $request) => Limit::perMinute(5)->by($request->ip() . '|' . hash('sha256', (string) $request->input('challenge'))));
        // owner 2026-10-11 (DECISIONS): 300/min - SECURITY.md's 60/min stopped a normal admin: per user once logged in, per IP before
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(config('auth_policy.api_per_minute'))
            ->by($request->user() ? 'u' . $request->user()->id : 'ip' . $request->ip()));
    }
}
