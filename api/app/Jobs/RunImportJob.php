<?php

namespace App\Jobs;

use App\Models\ImportJob;
use App\Services\ImportService;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// docs/modules/data-migration.md "Run": inside its institution (TenantAwareJob); a crash marks the job failed, never half-silent
class RunImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public int $tries = 1;
    public int $timeout = 1800;

    public function __construct(public int $jobId, int $institutionId)
    {
        $this->institutionId = $institutionId;
    }

    public function handle(ImportService $imports): void
    {
        $job = ImportJob::findOrFail($this->jobId);
        try {
            $imports->run($job);
        } catch (\Throwable $e) {
            $job->update(['status' => 'failed', 'summary' => ($job->summary ?? []) + ['failure' => mb_substr($e->getMessage(), 0, 200)]]);
            throw $e;
        }
    }
}
