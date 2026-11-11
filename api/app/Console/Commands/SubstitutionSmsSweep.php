<?php

namespace App\Console\Commands;

use App\Jobs\SendSubstitutionSmsJob;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D201 SUBM.2: a cover notice whose SMS is still `pending` five minutes after it was written (the queue push was lost after the
// commit) is queued again. The job's claim keeps it to one send. One institution at a time.
class SubstitutionSmsSweep extends Command
{
    protected $signature = 'substitution:sms-sweep';
    protected $description = 'Re-queue cover notice SMS left pending';

    public function handle(): int
    {
        $n = 0;
        Tenancy::each(function ($institution) use (&$n) {
            $pending = fn ($q) => $q->where('data->type', 'leave_substitution')->where('data->data->sms', 'pending')->where('created_at', '<=', now()->subMinutes(5));
            foreach (User::inTenant()->whereHas('notifications', $pending)->get() as $u) {
                foreach ($pending($u->notifications())->pluck('id') as $id) { SendSubstitutionSmsJob::dispatch($u->id, (string) $id, $institution->id); $n++; }
            }
        });
        $this->info("cover notice sms re-queued: {$n}");
        return self::SUCCESS;
    }
}
