<?php

namespace App\Console\Commands;

use App\Models\Institution;
use App\Services\LegacyStaffMappingDryRunService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// R3.6b (D90): read-only legacy staff mapping report for one institution; it changes nothing and grants nothing.
class StaffMappingDryRun extends Command
{
    protected $signature = 'staff:mapping-dry-run {institution : institution id or slug}';
    protected $description = 'Report how one institution\'s teacher/accountant/staff logins link to HR profiles (read-only)';

    public function handle(LegacyStaffMappingDryRunService $service): int
    {
        $key = $this->argument('institution');
        $institution = Institution::where(ctype_digit((string) $key) ? 'id' : 'slug', $key)->first();
        if (!$institution) { $this->error('institution not found'); return self::FAILURE; }
        $report = Tenancy::as($institution, fn () => $service->report());
        $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return self::SUCCESS;
    }
}
