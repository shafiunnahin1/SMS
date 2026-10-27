<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Step 8.1 retention (docs/legal/privacy-and-consent.md section 4): sms:trim daily, audit:trim weekly
\Illuminate\Support\Facades\Schedule::command('sms:trim')->dailyAt('02:10');
\Illuminate\Support\Facades\Schedule::command('audit:trim')->weeklyOn(0, '02:30');

// QB.10: quiz attempts whose time is over are submitted by the server
\Illuminate\Support\Facades\Schedule::command('qb:close-quiz-attempts')->everyMinute()->withoutOverlapping();

// Step 9.1 (D64): queue backlog alert - Laravel's queue:monitor fires QueueBusy above the limit (listener: AppServiceProvider)
\Illuminate\Support\Facades\Schedule::command('queue:monitor ' . collect(config('monitoring.queues'))->map(fn ($q) => 'redis:' . $q)->implode(',')
    . ' --max=' . config('monitoring.queue_depth'))->everyFiveMinutes();

// php artisan ops:alert-test - a forced error through the normal reporter: proves the alert path end to end (Done When of 9.1)
Artisan::command('ops:alert-test', function () {
    if (!app(\App\Services\Ops\AlertService::class)->enabled()) { $this->error('No ALERT_WEBHOOK_URL / ALERT_EMAIL set - nothing would be sent.'); return 1; }
    report(new \RuntimeException('ops:alert-test - a forced error, safe to ignore'));
    $this->info('Forced error reported - check the webhook / mailbox.');
    return 0;
})->purpose('Send a forced error through the alert path');

// D86 / R3.5: only due approved revisions; no payroll execution.
\Illuminate\Support\Facades\Schedule::command('payroll:apply-revisions')->dailyAt('00:15')->withoutOverlapping();

// D166 (5) AI-Q5: chat photos are kept one day
\Illuminate\Support\Facades\Schedule::command('ai:attachments-purge')->hourly()->withoutOverlapping();
