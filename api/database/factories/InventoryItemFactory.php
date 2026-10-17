<?php

namespace Database\Factories;

use App\Models\InventoryItem;
use Illuminate\Database\Eloquent\Factories\Factory;

class InventoryItemFactory extends Factory
{
    protected $model = InventoryItem::class;
    public function definition(): array
    {
        return ['code' => 'ITM-' . $this->faker->unique()->numberBetween(1, 99999), 'name' => 'Exercise book', 'unit' => 'pcs',
            'sale_price' => '80.00', 'reorder_level' => '10.00', 'is_sellable' => true, 'is_active' => true];
    }
}
