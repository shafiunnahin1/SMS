<?php

namespace App\Console\Commands;

use App\Services\Fees\InstallmentService;
use App\Services\ModuleGate;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D211 INST.2: daily - overdue installments and the two reminder SMS (InstallmentService::daily), one institution at a time
class InstallmentsDaily extends Command
{
    protected $signature = 'installments:daily';
    protected $description = 'Mark overdue fee installments and send the reminder SMS';

    public function handle(ModuleGate $modules, InstallmentService $installments): int
    {
        $o = 0; $s = 0;
        Tenancy::each(function ($institution) use ($modules, $installments, &$o, &$s) {
            if (!$modules->allows($institution, 'fee_installment')) return;
            [$a, $b] = $installments->daily();
            $o += $a; $s += $b;
        });
        $this->info("{$o} installment(s) overdue, {$s} reminder(s)");
        return self::SUCCESS;
    }
}
