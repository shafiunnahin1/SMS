<?php

namespace App\Console\Commands;

use App\Services\ModuleGate;
use App\Services\Risk\RiskEvaluator;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D216 RISK.1: daily - evaluate the risk rules, one institution at a time (Tenancy::each binds the tenant)
class RiskEvaluate extends Command
{
    protected $signature = 'risk:evaluate';
    protected $description = 'Evaluate the rule-based risk flags of every institution that has the module';

    public function handle(ModuleGate $modules, RiskEvaluator $risk): int
    {
        $n = 0;
        Tenancy::each(function ($institution) use ($modules, $risk, &$n) {
            if (!$modules->allows($institution, 'risk_alerts')) return;
            $written = $risk->run();
            app(\App\Services\Risk\RiskNotifier::class)->announce($written);   // D216 RISK.2
            $n += count($written);
        });
        $this->info("{$n} flag(s) written");
        return self::SUCCESS;
    }
}
