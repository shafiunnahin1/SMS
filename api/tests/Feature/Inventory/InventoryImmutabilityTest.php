<?php

namespace Tests\Feature\Inventory;

use App\Exceptions\BusinessException;
use App\Models\{InventoryItem, InventoryMovement};
use App\Support\Tenancy;

class InventoryImmutabilityTest extends InventoryTestCase
{
    public function test_movements_cannot_be_changed_or_deleted_and_a_mistake_is_an_opposite_movement(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $id = $this->item($i, $admin);
        $movement = $this->move($i, $admin, 'receive', ['item_id' => $id, 'qty' => '10', 'unit_amount' => '5'])->assertCreated()->json('data.id');
        // the only write route for movements is POST: there is no edit or delete verb
        $this->api('PUT', $host, 'inventory/receive', $admin, ['id' => $movement, 'qty' => '1'])->assertStatus(405);
        $this->api('DELETE', $host, 'inventory/receive', $admin, ['id' => $movement])->assertStatus(405);
        Tenancy::as($i, function () use ($movement) {
            foreach ([fn ($m) => $m->update(['qty' => '1']), fn ($m) => $m->delete()] as $operation) {
                try { $operation(InventoryMovement::findOrFail($movement)); $this->fail('ledger changed'); }
                catch (BusinessException $e) { $this->assertSame('inventory_immutable', $e->errorCode); }
            }
        });
        // a mistaken receipt of 10 is corrected by a counted adjustment, never by editing it
        $this->move($i, $admin, 'adjust', ['item_id' => $id, 'qty' => '-10'])->assertStatus(422);   // reason required
        $this->move($i, $admin, 'adjust', ['item_id' => $id, 'qty' => '-10', 'note' => 'Wrong delivery'])->assertCreated();
        Tenancy::as($i, function () use ($id) {
            $this->assertSame(2, InventoryMovement::where('item_id', $id)->count());
            $this->assertSame('0.00', InventoryItem::findOrFail($id)->stock);
        });
        foreach (['direction' => 1, 'balance_after' => '5', 'receipt_no' => 'STR-X', 'total_amount' => '1'] as $field => $value) {
            $this->move($i, $admin, 'receive', ['item_id' => $id, 'qty' => '1', 'unit_amount' => '1', $field => $value])->assertStatus(422);
        }
    }

    public function test_items_with_history_are_only_deactivated_and_large_adjustments_need_an_admin(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $accountant = $this->makeUser($i, 'accountant');
        $unused = $this->item($i, $admin, ['code' => 'UNUSED']);
        $this->api('DELETE', $host, "inventory/items/{$unused}", $admin)->assertOk()->assertJsonPath('data.deleted', true);
        $id = $this->item($i, $admin);
        $this->move($i, $accountant, 'receive', ['item_id' => $id, 'qty' => '100', 'unit_amount' => '5'])->assertCreated();
        $this->move($i, $accountant, 'adjust', ['item_id' => $id, 'qty' => '-10', 'note' => 'Count'])->assertCreated();   // 10% is fine
        $this->move($i, $accountant, 'adjust', ['item_id' => $id, 'qty' => '-20', 'note' => 'Count'])->assertStatus(403)
            ->assertJsonPath('error', 'inventory_adjust_needs_admin');
        $this->move($i, $admin, 'adjust', ['item_id' => $id, 'qty' => '-20', 'note' => 'Count'])->assertCreated();
        $this->api('DELETE', $host, "inventory/items/{$id}", $admin)->assertOk()->assertJsonPath('data.is_active', false)->assertJsonPath('data.deleted', false);
        $this->move($i, $admin, 'receive', ['item_id' => $id, 'qty' => '1', 'unit_amount' => '1'])->assertStatus(422)->assertJsonPath('error', 'inventory_inactive');
        $this->api('GET', $host, "inventory/items/{$id}/ledger", $admin)->assertOk()->assertJsonCount(3, 'data');
    }
}
