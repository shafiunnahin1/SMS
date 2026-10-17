<?php

namespace Tests\Feature\Inventory;

use App\Models\{CashBookClosing, FeeCategory, FeePayment, InventoryMovement, Student};
use App\Support\Tenancy;

class StoreReceiptTest extends InventoryTestCase
{
    public function test_str_numbers_are_unique_gapless_and_independent_from_fee_receipts(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        Tenancy::as($i, function () {
            $student = Student::create(['student_id' => 'S-1', 'guardian_phone' => '01711111111']);
            $category = FeeCategory::create(['name' => 'Tuition', 'amount' => '100.00', 'frequency' => 'monthly']);
            FeePayment::create(['student_id' => $student->id, 'fee_category_id' => $category->id, 'amount' => '100', 'paid_amount' => '100',
                'receipt_no' => 'RCP-2026-00001', 'payment_method' => 'cash', 'paid_at' => '2026-10-15 09:00:00']);
        });
        $id = $this->item($i, $admin);
        $this->move($i, $admin, 'receive', ['item_id' => $id, 'qty' => '50', 'unit_amount' => '40'])->assertCreated();
        $numbers = [];
        for ($n = 0; $n < 10; $n++) {
            $numbers[] = $this->move($i, $admin, 'sale', ['item_id' => $id, 'qty' => '1'])->assertCreated()
                ->assertJsonPath('data.unit_amount', '80.00')->json('data.receipt_no');
        }
        $this->assertSame(array_map(fn ($n) => sprintf('STR-2026-%05d', $n), range(1, 10)), $numbers);
        $this->assertSame('RCP-2026-00001', Tenancy::as($i, fn () => FeePayment::value('receipt_no')), 'fee sequence untouched');
        $pdf = $this->api('GET', $host, "inventory/sales/{$numbers[0]}/receipt.pdf", $admin)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        $this->api('GET', $host, 'inventory/sales/STR-2026-99999/receipt.pdf', $admin)->assertNotFound();
        $this->move($i, $admin, 'issue', ['item_id' => $id, 'qty' => '1', 'issued_to_type' => 'teacher', 'issued_to_id' => 3])->assertCreated()->assertJsonPath('data.receipt_no', null);
    }

    public function test_sales_and_cash_returns_enter_the_cashbook_and_a_closed_day_refuses_them(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $id = $this->item($i, $admin);
        $other = $this->item($i, $admin, ['code' => 'PEN', 'name' => 'Pen', 'is_sellable' => false]);
        $this->move($i, $admin, 'receive', ['item_id' => $id, 'qty' => '20', 'unit_amount' => '40'])->assertCreated();
        $this->move($i, $admin, 'receive', ['item_id' => $other, 'qty' => '20', 'unit_amount' => '5'])->assertCreated();
        $this->move($i, $admin, 'sale', ['item_id' => $other, 'qty' => '1'])->assertStatus(422)->assertJsonPath('error', 'inventory_not_sellable');
        $receipt = $this->move($i, $admin, 'sale', ['item_id' => $id, 'qty' => '3'])->assertCreated()->json('data.receipt_no');
        $this->move($i, $admin, 'sale', ['item_id' => $id, 'qty' => '2', 'payment_method' => 'bkash'])->assertCreated();
        $this->move($i, $admin, 'return', ['item_id' => $id, 'qty' => '4', 'reference' => $receipt])->assertStatus(422)->assertJsonPath('error', 'inventory_return_invalid');
        $this->move($i, $admin, 'return', ['item_id' => $id, 'qty' => '1', 'reference' => $receipt, 'payment_method' => 'cash'])->assertCreated()
            ->assertJsonPath('data.total_amount', '80.00');
        $this->api('GET', $host, 'cashbook?date=2026-10-15&opening_cash=0', $admin)->assertOk()
            ->assertJsonPath('data.cash_in', '240.00')->assertJsonPath('data.cash_out', '80.00')->assertJsonPath('data.expected_closing', '160.00')
            ->assertJsonPath('data.store.sales', '400.00')->assertJsonPath('data.store.returns', '80.00');
        $this->api('GET', $host, 'inventory/reports/sales?from=2026-10-15&to=2026-10-15', $admin)->assertOk()
            ->assertJsonPath('data.count', 2)->assertJsonPath('data.total', '400.00');
        $this->api('POST', $host, 'cashbook/2026-10-15/close', $admin, ['opening_cash' => '0', 'counted_cash' => '160'])->assertCreated();
        $this->move($i, $admin, 'sale', ['item_id' => $id, 'qty' => '1'])->assertStatus(409)->assertJsonPath('error', 'day_closed');
        $this->move($i, $admin, 'sale', ['item_id' => $id, 'qty' => '1', 'payment_method' => 'bank'])->assertCreated();
        Tenancy::as($i, fn () => $this->assertSame(1, CashBookClosing::count()));
        foreach (['stock', 'movements', 'valuation'] as $name) {
            $this->api('GET', $host, "inventory/reports/{$name}?format=pdf", $admin)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        }
        $this->api('GET', $host, 'inventory/reports/valuation', $admin)->assertOk()->assertJsonPath('data.value', '700.00');   // 15 x 40 + 20 x 5
    }
}
