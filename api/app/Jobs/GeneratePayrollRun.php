<?php

namespace App\Jobs;

use App\Services\Hr\PayrollRunService;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// staff-payroll.md §7.4 / D25: builds a draft run's items inside its own institution; a non-draft run is never touched
class GeneratePayrollRun implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public int $tries = 1;
    public int $timeout = 900;

    public function __construct(public int $runId, int $institutionId)
    {
        $this->institutionId = $institutionId;
    }

    public function handle(PayrollRunService $runs): void
    {
        $runs->generateDraft($this->runId);
    }
}
