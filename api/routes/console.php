<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Step 8.1 retention (docs/legal/privacy-and-consent.md section 4): sms:trim daily, audit:trim weekly
\Illuminate\Support\Facades\Schedule::command('sms:trim')->dailyAt('02:10');
\Illuminate\Support\Facades\Schedule::command('audit:trim')->weeklyOn(0, '02:30');
