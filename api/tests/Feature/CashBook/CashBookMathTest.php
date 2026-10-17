<?php

namespace Tests\Feature\CashBook;

use App\Models\{CashBookClosing, Expense};
use App\Services\CashBookService;
use App\Support\Tenancy;
use Illuminate\Database\QueryException;

class CashBookMathTest extends CashBookTestCase
{
    public function test_independent_reference_and_actual_fee_expense_pennies(): void
    {
        $this->assertSame(['expected_closing' => '7000.00', 'difference' => '-20.00'], CashBookService::calculate('5000.00', '13500.00', '11500.00', '6980.00'));
        [$i, $admin] = $this->tenant();
        $this->fee($i, '100.11'); $this->fee($i, '20.02');
        Tenancy::as($i, fn () => Expense::factory()->create(['amount' => '10.10', 'expense_date' => '2026-10-14']));
        $this->api('POST', $this->hostOf($i), 'cashbook/2026-10-14/close', $admin, ['opening_cash' => '50.05', 'counted_cash' => '160.08'])
            ->assertCreated()->assertJsonPath('data.expected_closing', '160.08')->assertJsonPath('data.difference', '0.00');
        $this->api('POST', $this->hostOf($i), 'cashbook/2026-10-15/close', $admin, ['opening_cash' => '999', 'counted_cash' => '160.08'])
            ->assertCreated()->assertJsonPath('data.opening_cash', '160.08');
    }
    public function test_mismatch_note_date_order_validation_and_no_rows_on_failure(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        foreach ([['counted_cash' => '0'], ['opening_cash' => '10.00', 'counted_cash' => '9.00'],
            ['opening_cash' => '0', 'counted_cash' => 1.23], ['opening_cash' => '0', 'counted_cash' => '-1'],
            ['opening_cash' => '0', 'counted_cash' => '1e2'], ['opening_cash' => '0', 'counted_cash' => '10000000000.00'],
            ['opening_cash' => '0', 'counted_cash' => '0', 'revision' => 8]] as $input) {
            $this->api('POST', $host, 'cashbook/2026-10-12/close', $admin, $input)->assertUnprocessable();
        }
        $this->assertSame(0, Tenancy::as($i, fn () => CashBookClosing::count()));
        $this->api('POST', $host, 'cashbook/2026-10-16/close', $admin, ['opening_cash' => '0', 'counted_cash' => '0'])->assertUnprocessable();
        $this->api('POST', $host, 'cashbook/2026-10-12/close', $admin, ['opening_cash' => '10', 'counted_cash' => '9', 'note' => 'One taka short'])
            ->assertCreated()->assertJsonPath('data.difference', '-1.00');
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $admin, ['counted_cash' => '9'])->assertUnprocessable();
        $this->api('POST', $host, 'cashbook/2026-10-13/close', $admin, ['counted_cash' => '9'])->assertCreated()->assertJsonPath('data.opening_cash', '9.00');
    }
    public function test_duplicate_revision_is_rejected_by_the_database(): void
    {
        [$i] = $this->tenant();
        Tenancy::as($i, fn () => CashBookClosing::factory()->create());
        $this->expectException(QueryException::class);
        Tenancy::as($i, fn () => CashBookClosing::factory()->create());
    }

    public function test_day_and_range_queries_use_the_tenant_date_revision_index(): void
    {
        [$i] = $this->tenant();
        Tenancy::as($i, function () use ($i) {
            $rows = [];
            for ($revision = 1; $revision <= 1000; $revision++) $rows[] = ['institution_id' => $i->id, 'date' => '2026-10-13', 'revision' => $revision];
            \App\Support\TenantBulk::insert(CashBookClosing::class, $rows);
            CashBookClosing::factory()->create(['date' => '2026-10-14']);
            foreach ([['SELECT * FROM cash_book_closings WHERE institution_id = ? AND date = ? ORDER BY revision DESC LIMIT 1', [$i->id, '2026-10-14']],
                ['SELECT date,cash_in,cash_out FROM cash_book_closings WHERE institution_id = ? AND date BETWEEN ? AND ?', [$i->id, '2026-10-14', '2026-10-15']]] as [$sql, $bindings]) {
                $plan = \Illuminate\Support\Facades\DB::select('EXPLAIN ' . $sql, $bindings);
                $this->assertSame('unique_cash_day_revision', $plan[0]->key);
                $this->assertNotSame('ALL', $plan[0]->type);
            }
        });
    }
}
