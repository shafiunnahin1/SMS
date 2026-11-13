<?php

namespace App\Console\Commands;

use App\Services\Admission\AdmissionDecisionService;
use App\Services\ModuleGate;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D209 ACY.4 (admission-cycle.md section 4 "job admission:promote"): daily, a selected applicant whose confirmation deadline has
// passed is declined and the next waiting applicant is offered the seat, in rank order. One institution at a time.
class AdmissionPromote extends Command
{
    protected $signature = 'admission:promote';
    protected $description = 'Offer seats of applicants who did not confirm in time to the waiting list';

    public function handle(ModuleGate $modules, AdmissionDecisionService $decisions): int
    {
        $moved = 0;
        Tenancy::each(function ($institution) use ($modules, $decisions, &$moved) {
            if (!$modules->allows($institution, 'admission_cycle')) return;
            $moved += $decisions->promoteExpired();
        });
        $this->info("{$moved} seat(s) moved to the waiting list");
        return self::SUCCESS;
    }
}
