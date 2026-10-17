<?php

namespace App\Console\Commands;

use App\Services\InventoryService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// R3.9: the item stock/avg_cost cache can always be recomputed from the movement ledger.
class InventoryRebuild extends Command
{
    protected $signature = 'inventory:rebuild';
    protected $description = 'Recompute every store item stock and moving-average cost from its movement ledger';

    public function handle(InventoryService $inventory): int
    {
        $items = 0;
        Tenancy::each(function () use ($inventory, &$items) { $items += $inventory->rebuild()->count(); });
        $this->info('items=' . $items);
        return self::SUCCESS;
    }
}
