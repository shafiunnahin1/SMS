<?php

namespace App\Jobs;

use App\Models\Batch;
use App\Services\AttendanceService;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// After an attendance sheet is saved: queue one absence SMS per absent student's guardian (consent and preferences honoured)
class NotifyAbsentParentsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public function __construct(public array $studentIds, public string $date, public int $batchId, int $institutionId)
    {
        $this->institutionId = $institutionId;
    }

    public function handle(AttendanceService $attendance): void
    {
        $batch = Batch::find($this->batchId);
        if ($batch) $attendance->notifyAbsentParents($this->studentIds, $this->date, $batch);
    }
}
