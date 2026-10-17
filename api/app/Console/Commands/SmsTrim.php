<?php

namespace App\Console\Commands;

use App\Services\Privacy\RetentionService;
use Illuminate\Console\Command;

// privacy-and-consent.md section 4: SMS log kept 180 days, its text only 90
class SmsTrim extends Command
{
    protected $signature = 'sms:trim';
    protected $description = 'Empty SMS texts older than 90 days and delete SMS log rows older than 180 days';

    public function handle(RetentionService $retention): int
    {
        $r = $retention->trimSms();
        $this->info("sms_logs: {$r['emptied']} texts emptied, {$r['deleted']} rows deleted");
        return self::SUCCESS;
    }
}
