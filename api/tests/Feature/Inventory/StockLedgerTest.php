<?php

namespace Tests\Feature\Inventory;

use App\Models\{InventoryItem, InventoryMovement};
use App\Support\{Money, Tenancy};
use Illuminate\Support\Facades\Artisan;

// docs/modules/inventory.md §3 golden sequence (independently computed in infra/spec-verify/refs_r11.py).
class StockLedgerTest extends InventoryTestCase
{
    public function test_the_golden_moving_average_sequence_and_the_cache_equals_the_ledger(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $id = $this->item($i, $admin);
        $step = fn (string $type, array $data) => $this->move($i, $admin, $type, ['item_id' => $id] + $data);

        $step('receive', ['qty' => '100', 'unit_amount' => '50'])->assertCreated()->assertJsonPath('data.balance_after', '100.00');
        $step('receive', ['qty' => '50', 'unit_amount' => '56'])->assertCreated()->assertJsonPath('data.total_amount', '2800.00');
        $this->assertItem($i, $id, '150.00', '52.00');
        $sale = $step('sale', ['qty' => '30', 'unit_amount' => '80'])->assertCreated()
            ->assertJsonPath('data.total_amount', '2400.00')->assertJsonPath('data.balance_after', '120.00')->json('data');
        $this->assertSame('1560.00', Money::format(30 * Money::toPaisa('52.00')), 'cost of goods sold');
        $this->assertSame('840.00', Money::format(Money::toPaisa($sale['total_amount']) - 30 * Money::toPaisa('52.00')), 'margin');
        $step('issue', ['qty' => '10', 'issued_to_type' => 'department'])->assertCreated()->assertJsonPath('data.balance_after', '110.00');
        $step('damage', ['qty' => '5', 'note' => 'Wet'])->assertCreated()->assertJsonPath('data.total_amount', '260.00');
        $step('adjust', ['qty' => '-2', 'note' => 'Count'])->assertCreated()->assertJsonPath('data.balance_after', '103.00')->assertJsonPath('data.direction', -1);
        $step('sale', ['qty' => '200'])->assertStatus(422)->assertJsonPath('error', 'insufficient_stock');
        $step('return', ['qty' => '5', 'reference' => $sale['receipt_no']])->assertCreated()->assertJsonPath('data.balance_after', '108.00');
        $this->assertItem($i, $id, '108.00', '52.00');

        Tenancy::as($i, function () use ($id) {
            $ledger = InventoryMovement::where('item_id', $id)->get()->sum(fn ($m) => $m->direction * Money::toPaisa($m->qty));
            $this->assertSame('108.00', Money::format($ledger));
            InventoryItem::whereKey($id)->update(['stock' => '0', 'avg_cost' => '0']);   // corrupt the cache on purpose
        });
        Artisan::call('inventory:rebuild');
        $this->assertItem($i, $id, '108.00', '52.00');
        $this->api('GET', $host, "inventory/items/{$id}/ledger", $admin)->assertOk()->assertJsonCount(7, 'data');   // the refused sale left no row
    }

    public function test_stock_cannot_be_edited_directly_and_low_stock_is_listed(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $id = $this->item($i, $admin);
        $this->api('PUT', $host, "inventory/items/{$id}", $admin, ['stock' => '99'])->assertStatus(422);
        $this->api('PUT', $host, "inventory/items/{$id}", $admin, ['avg_cost' => '1'])->assertStatus(422);
        $this->api('POST', $host, 'inventory/items', $admin, ['code' => 'X-1', 'name' => 'X', 'stock' => '5'])->assertStatus(422);
        $this->move($i, $admin, 'receive', ['item_id' => $id, 'qty' => '10', 'unit_amount' => '5'])->assertCreated();
        $this->api('GET', $host, 'inventory/stock?low=1', $admin)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_low', true);
        $this->move($i, $admin, 'receive', ['item_id' => $id, 'qty' => '20', 'unit_amount' => '5'])->assertCreated();
        $this->api('GET', $host, 'inventory/stock?low=1', $admin)->assertOk()->assertJsonCount(0, 'data');
        $this->api('PUT', $host, "inventory/items/{$id}", $admin, ['name' => 'Notebook', 'sale_price' => '90'])->assertOk()
            ->assertJsonPath('data.stock', '30.00')->assertJsonPath('data.sale_price', '90.00');
    }

    private function assertItem($i, int $id, string $stock, string $avg): void
    {
        $item = Tenancy::as($i, fn () => InventoryItem::findOrFail($id));
        $this->assertSame([$stock, $avg], [$item->stock, $item->avg_cost]);
    }
}
