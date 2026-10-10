<?php

namespace App\Console\Commands;

use App\Services\Privacy\RetentionService;
use Illuminate\Console\Command;

// privacy-and-consent.md section 4: the audit log is kept 2 years (incident investigation), then deleted
class AuditTrim extends Command
{
    protected $signature = 'audit:trim';
    protected $description = 'Delete audit log rows older than 2 years';

    public function handle(RetentionService $retention): int
    {
        $this->info('audit_logs: ' . $retention->trimAudit() . ' rows deleted');
        return self::SUCCESS;
    }
}
