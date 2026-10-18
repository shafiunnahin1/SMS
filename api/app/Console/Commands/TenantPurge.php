<?php

namespace App\Console\Commands;

use App\Models\Institution;
use App\Services\Privacy\TenantPurgeService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// privacy-and-consent.md 5.3: the same purge from the server shell. Without --execute it only prints the dry run.
class TenantPurge extends Command
{
    protected $signature = 'tenant:purge {institution : id} {--execute : really delete} {--confirm= : the institution slug, typed again}';
    protected $description = 'Remove an institution suspended or expired for 30+ days (dry run unless --execute)';

    public function handle(TenantPurgeService $purge): int
    {
        return Tenancy::withoutTenancy(function () use ($purge) {
            $i = Institution::find($this->argument('institution'));
            if (!$i) { $this->error('No such institution.'); return self::FAILURE; }
            if (!$purge->eligible($i)) { $this->error("Not suspended or expired for " . TenantPurgeService::WAIT_DAYS . " days."); return self::FAILURE; }
            $plan = $purge->dryRun($i);
            $this->table(['table', 'rows'], collect($plan['tables'])->map(fn ($n, $t) => [$t, $n])->values()->all());
            $this->line('files: private ' . $plan['files']['private'] . ', public ' . $plan['files']['public']);
            if (!$this->option('execute')) { $this->info('Dry run only. Add --execute --confirm=' . $i->slug . ' to delete.'); return self::SUCCESS; }
            if ($this->option('confirm') !== $i->slug) { $this->error('--confirm must be the institution slug.'); return self::FAILURE; }
            $done = $purge->execute($i, 0);
            $this->info('Purged: ' . array_sum($done['tables']) . ' rows.');
            return self::SUCCESS;
        });
    }
}
