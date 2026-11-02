<?php

namespace App\Console\Commands;

use App\Models\Institution;
use App\Services\Billing\ModuleEntitlementService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D187 SUB.1: once a day, give every institution a row for each paid module of its type and store each row's current state
// (trial/active -> grace -> read_only). Access never waits for this: the gate computes the same state from the dates.
class SubscriptionsRefresh extends Command
{
    protected $signature = 'subscriptions:refresh';
    protected $description = 'Store the trial / grace / read-only state of every institution\'s module subscriptions';

    public function handle(ModuleEntitlementService $entitlements): int
    {
        $changed = 0;
        foreach (Institution::orderBy('id')->cursor() as $institution) {
            Tenancy::as($institution, function () use ($institution, $entitlements, &$changed) {
                foreach ($entitlements->all($institution) as $row) {
                    $state = ModuleEntitlementService::effective($row);
                    if ($row->status !== 'cancelled' && $row->status !== $state) { $row->update(['status' => $state]); $changed++; }
                }
            });
        }
        $this->info("module subscriptions: {$changed} changed");
        return self::SUCCESS;
    }
}
