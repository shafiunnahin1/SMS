<?php

namespace Tests\Feature\Inventory;

class InventoryTenancyTest extends InventoryTestCase
{
    public function test_another_institutions_items_are_invisible_and_codes_are_unique_per_institution(): void
    {
        [$mine, $admin] = $this->tenant('store-mine');
        [$other, $foreign] = $this->tenant('store-foreign');
        $foreignId = $this->item($other, $foreign);
        $this->move($other, $foreign, 'receive', ['item_id' => $foreignId, 'qty' => '5', 'unit_amount' => '10'])->assertCreated();
        $receipt = $this->move($other, $foreign, 'sale', ['item_id' => $foreignId, 'qty' => '1'])->assertCreated()->json('data.receipt_no');

        $host = $this->hostOf($mine);
        $this->item($mine, $admin);   // same code BK-01 is fine in another institution
        $this->api('POST', $host, 'inventory/items', $admin, ['code' => 'BK-01', 'name' => 'Duplicate'])->assertStatus(422);
        $this->api('PUT', $host, "inventory/items/{$foreignId}", $admin, ['name' => 'X'])->assertNotFound();
        $this->api('DELETE', $host, "inventory/items/{$foreignId}", $admin)->assertNotFound();
        $this->api('GET', $host, "inventory/items/{$foreignId}/ledger", $admin)->assertNotFound();
        $this->move($mine, $admin, 'receive', ['item_id' => $foreignId, 'qty' => '1', 'unit_amount' => '1'])->assertNotFound();
        $this->api('GET', $host, "inventory/sales/{$receipt}/receipt.pdf", $admin)->assertNotFound();
        $this->api('GET', $host, 'inventory/items', $admin)->assertOk()->assertJsonCount(1, 'data');
        $this->api('GET', $host, 'inventory/reports/sales', $admin)->assertOk()->assertJsonPath('data.count', 0);
    }
}
