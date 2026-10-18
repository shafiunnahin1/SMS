<?php

namespace App\Console\Commands;

use App\Services\Migration\QbankIdentityPlanner;
use Illuminate\Console\Command;

// R2.1.1 / D111 (5): plan (default, writes nothing) or apply the platform-account part of a qbank identity export.
// Running it on real qbank data is the owner's step, after reading the dry-run report.
class QbankImportIdentities extends Command
{
    protected $signature = 'qbank:import-identities {file : JSON export of qbank users/institutions/members/students} {--report= : where to write the plan JSON} {--apply : create the planned platform writer/moderator accounts}';
    protected $description = 'Plan (dry run) or apply the qbank identity import (D111)';

    public function handle(QbankIdentityPlanner $planner): int
    {
        $raw = @file_get_contents($this->argument('file'));
        $export = $raw === false ? null : json_decode($raw, true);
        if (!is_array($export)) { $this->error('cannot read the export (JSON object expected)'); return self::FAILURE; }
        $plan = $planner->plan($export);
        if ($path = $this->option('report')) file_put_contents($path, json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $s = $plan['summary'];
        $this->info("qbank users {$s['qbank_users']} · platform accounts {$s['platform_accounts']} · private batches {$s['private_batches']} · schools {$s['schools']} · review {$s['review']}");
        if (!$this->option('apply')) { $this->line('dry run: nothing written'); return self::SUCCESS; }
        $r = $planner->apply($plan);
        $this->info("created {$r['created']} platform accounts, skipped {$r['skipped']} (already present); private batches and schools are not created here (D90 provisioning)");
        return self::SUCCESS;
    }
}
