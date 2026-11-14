<?php

namespace App\Console\Commands;

use App\Services\Risk\RiskEvaluator;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D216 RISK.1: retention - resolved risk flags older than 90 days are removed
class RiskPrune extends Command
{
    protected $signature = 'risk:prune';
    protected $description = 'Delete resolved risk flags older than 90 days';

    public function handle(RiskEvaluator $risk): int
    {
        $n = 0;
        Tenancy::each(function () use ($risk, &$n) { $n += $risk->prune(); });
        $this->info("{$n} flag(s) pruned");
        return self::SUCCESS;
    }
}
