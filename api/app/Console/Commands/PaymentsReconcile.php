<?php

namespace App\Console\Commands;

use App\Services\Payments\OnlinePaymentService;
use Illuminate\Console\Command;

// D217 OPAY.1: every 5 minutes - settle online payments whose notification was lost, close attempts whose time is over
class PaymentsReconcile extends Command
{
    protected $signature = 'payments:reconcile';
    protected $description = 'Reconcile open online fee payments';

    public function handle(OnlinePaymentService $payments): int
    {
        [$done, $cancelled] = $payments->reconcile();
        $this->info("{$done} settled, {$cancelled} cancelled");
        return self::SUCCESS;
    }
}
