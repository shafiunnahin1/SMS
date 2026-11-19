<?php

namespace App\Console\Commands;

use App\Services\Hostel\MessService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D233 HST.3: on the 1st, close last month's mess for the hostels that bill by a fixed fee or fixed meal rates (meal_rate waits for staff)
class HostelMessClose extends Command
{
    protected $signature = 'hostel:mess-close';
    protected $description = "Close last month's hostel mess (fixed_monthly and per_meal modes)";

    public function handle(MessService $mess): int
    {
        $n = 0;
        Tenancy::each(function ($i) use ($mess, &$n) {
            if (!app(\App\Services\ModuleGate::class)->allows($i, 'hostel')) return;
            $n += $mess->autoClose();
        });
        $this->info("closed {$n}");
        return self::SUCCESS;
    }
}
