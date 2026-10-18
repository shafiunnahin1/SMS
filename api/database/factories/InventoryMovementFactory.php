<?php

namespace Database\Factories;

use App\Models\InventoryMovement;
use Illuminate\Database\Eloquent\Factories\Factory;

// Raw ledger rows for tests only; real movements go through InventoryService so the item cache stays equal to the ledger.
class InventoryMovementFactory extends Factory
{
    protected $model = InventoryMovement::class;
    public function definition(): array
    {
        return ['type' => 'receive', 'qty' => '1.00', 'direction' => 1, 'unit_amount' => '0.00', 'total_amount' => '0.00', 'balance_after' => '1.00'];
    }
}
