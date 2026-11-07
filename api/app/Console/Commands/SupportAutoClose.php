<?php

namespace App\Console\Commands;

use App\Models\SupportTicket;
use App\Models\PlatformSetting;
use Illuminate\Console\Command;

// D193 SUP.1 (platform-ops.md section 1.1): a resolved ticket with no institution answer for `support.auto_close_days` (default 7)
// closes by itself. Runs over every institution (anyInstitution; ticket status columns only).
class SupportAutoClose extends Command
{
    protected $signature = 'support:auto-close';
    protected $description = 'Close resolved support tickets nobody answered within the auto-close days';

    public function handle(): int
    {
        $days = (int) (PlatformSetting::read('support.auto_close_days') ?: 7);
        $n = SupportTicket::anyInstitution()->where('status', 'resolved')->where('resolved_at', '<=', now()->subDays($days))
            ->update(['status' => 'closed', 'closed_at' => now(), 'updated_at' => now()]);
        $this->info("support tickets closed: {$n}");
        return self::SUCCESS;
    }
}
