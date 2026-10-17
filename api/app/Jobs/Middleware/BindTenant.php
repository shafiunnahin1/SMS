<?php

namespace App\Jobs\Middleware;

use App\Models\Institution;
use App\Support\Tenancy;

// Runs every tenant job inside Tenancy::as(), so a long-lived worker never carries job A's tenant into job B.
class BindTenant
{
    public function __construct(private int $institutionId) {}

    public function handle($job, $next)
    {
        $institution = Institution::find($this->institutionId);
        if (!$institution) { $job->delete(); return; }                                  // institution was removed: drop the job
        return Tenancy::as($institution, fn () => $next($job));
    }
}
