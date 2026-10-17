<?php

namespace Tests\Feature\Inventory;

use App\Models\{Institution, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

abstract class InventoryTestCase extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-15 12:00:00');
    }

    protected function tenant(string $slug = 'store-school', string $type = 'school', string $role = 'admin'): array
    {
        $i = $this->makeInstitution($slug, $type);
        return [$i, $this->makeUser($i, $role)];
    }

    protected function item(Institution $i, User $as, array $changes = []): int
    {
        return $this->api('POST', $this->hostOf($i), 'inventory/items', $as, array_replace(['code' => 'BK-01', 'name' => 'Exercise book',
            'sale_price' => '80.00', 'reorder_level' => '20', 'is_sellable' => true], $changes))->assertCreated()->json('data.id');
    }

    protected function move(Institution $i, User $as, string $type, array $data): \Illuminate\Testing\TestResponse
    {
        return $this->api('POST', $this->hostOf($i), 'inventory/' . $type, $as, $data);
    }
}
