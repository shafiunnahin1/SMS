<?php

namespace Tests\Feature\CashBook;

use App\Models\{CashBookClosing, Expense};
use App\Support\Tenancy;

class CashBookLockTest extends CashBookTestCase
{
    public function test_close_reopen_reclose_keeps_snapshots_and_cash_mutation_locks(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $id = $this->api('POST', $host, 'expenses', $admin, $this->expense())->assertCreated()->json('data.id');
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $admin, ['opening_cash' => '50', 'counted_cash' => '39.90'])->assertCreated();
        $original = Tenancy::as($i, fn () => CashBookClosing::first()->getRawOriginal());
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $admin, ['counted_cash' => '0'])->assertStatus(409);
        $this->api('POST', $host, 'expenses', $admin, $this->expense())->assertStatus(409)->assertJsonPath('error', 'day_closed');
        $this->api('PUT', $host, "expenses/{$id}", $admin, ['expense_date' => '2026-10-15', 'payment_method' => 'bank'])->assertStatus(409);
        $this->api('DELETE', $host, "expenses/{$id}", $admin)->assertStatus(409);
        $this->api('POST', $host, 'expenses', $admin, $this->expense(['payment_method' => 'bank']))->assertCreated();
        $this->api('POST', $host, 'cashbook/2026-10-14/reopen', $admin, [])->assertUnprocessable();
        $this->api('POST', $host, 'cashbook/2026-10-14/reopen', $admin, ['reason' => 'Correction'])->assertCreated()->assertJsonPath('data.revision', 2)->assertJsonPath('data.closed_by', $admin->id);
        $this->api('POST', $host, 'cashbook/2026-10-14/reopen', $admin, ['reason' => 'Again'])->assertStatus(409);
        $this->api('PUT', $host, "expenses/{$id}", $admin, ['amount' => '20.20'])->assertOk();
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $admin, ['counted_cash' => '29.80'])->assertCreated()->assertJsonPath('data.revision', 3)->assertJsonPath('data.expected_closing', '29.80');
        $this->api('GET', $host, 'cashbook?date=2026-10-14', $admin)->assertOk()->assertJsonCount(3, 'data.history')->assertJsonPath('data.status', 'closed');
        $this->assertSame($original, Tenancy::as($i, fn () => CashBookClosing::first()->getRawOriginal()));
        Tenancy::as($i, function () {
            foreach (['save', 'delete'] as $method) {
                $row = CashBookClosing::first();
                try { $row->note = 'Tamper'; $row->$method(); $this->fail('immutable write accepted'); }
                catch (\App\Exceptions\BusinessException $e) { $this->assertSame('cashbook_immutable', $e->errorCode); }
            }
        });
    }
    public function test_correction_into_closed_cash_day_and_future_expense_is_rejected(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $id = $this->api('POST', $host, 'expenses', $admin, $this->expense(['expense_date' => '2026-10-13', 'payment_method' => 'bank']))->assertCreated()->json('data.id');
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $admin, ['opening_cash' => '0', 'counted_cash' => '0'])->assertCreated();
        $this->api('PUT', $host, "expenses/{$id}", $admin, ['expense_date' => '2026-10-14', 'payment_method' => 'cash'])->assertStatus(409);
        $this->assertSame(1, Tenancy::as($i, fn () => Expense::count()));
        $this->api('POST', $host, 'expenses', $admin, $this->expense(['expense_date' => '2026-10-16']))->assertUnprocessable();
    }
    public function test_fee_collection_rejects_closed_cash_day_but_allows_bank(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i); $student = $this->studentWithDues($i);
        $lines = $this->api('GET', $host, 'fees/dues?student_id=' . $student->id, $admin)->assertOk()->json('data.lines');
        $input = ['student_id' => $student->id, 'lines' => array_map(fn ($line) => ['key' => $line['key']], $lines)];
        $this->api('POST', $host, 'cashbook/2026-10-15/close', $admin, ['opening_cash' => '0', 'counted_cash' => '0'])->assertCreated();
        $this->api('POST', $host, 'fees/collect', $admin, $input + ['payment_method' => 'cash'])->assertStatus(409)->assertJsonPath('error', 'day_closed');
        $this->api('POST', $host, 'fees/collect', $admin, $input + ['payment_method' => 'bank_transfer'])->assertCreated();
    }

    public function test_prior_reopened_day_blocks_later_close_and_writes_take_institution_lock_first(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        \Illuminate\Support\Facades\DB::enableQueryLog();
        $id = $this->api('POST', $host, 'expenses', $admin, $this->expense(['expense_date' => '2026-10-12']))->assertCreated()->json('data.id');
        $sql = array_column(\Illuminate\Support\Facades\DB::getQueryLog(), 'query');
        $lock = collect($sql)->search(fn ($q) => str_contains($q, '`institutions`') && str_contains($q, 'for update'));
        $insert = collect($sql)->search(fn ($q) => str_starts_with($q, 'insert into `expenses`'));
        $this->assertNotFalse($lock); $this->assertNotFalse($insert); $this->assertLessThan($insert, $lock);
        \Illuminate\Support\Facades\DB::flushQueryLog();
        $this->api('PUT', $host, "expenses/{$id}", $admin, ['amount' => '20'])->assertOk();
        $locks = array_values(array_filter(array_column(\Illuminate\Support\Facades\DB::getQueryLog(), 'query'), fn ($q) => str_contains($q, 'for update')));
        $this->assertStringContainsString('`institutions`', $locks[0]); $this->assertStringContainsString('`expenses`', $locks[1]);
        \Illuminate\Support\Facades\DB::disableQueryLog();
        $this->api('POST', $host, 'cashbook/2026-10-12/close', $admin, ['opening_cash' => '20', 'counted_cash' => '0'])->assertCreated();
        $this->api('POST', $host, 'cashbook/2026-10-13/close', $admin, ['counted_cash' => '0'])->assertCreated();
        $this->api('POST', $host, 'cashbook/2026-10-12/reopen', $admin, ['reason' => 'Correction'])->assertCreated();
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $admin, ['counted_cash' => '0'])->assertUnprocessable();
    }

    public function test_multi_line_receipt_uses_the_checked_day_when_midnight_passes(): void
    {
        $this->travelTo('2026-10-15 23:59:59');
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i); $student = $this->studentWithDues($i);
        Tenancy::as($i, function () {
            \App\Models\FeeCategory::create(['name' => 'Additional fee', 'amount' => '20', 'frequency' => 'monthly']);
            CashBookClosing::factory()->create(['date' => '2026-10-16']);
        });
        $lines = $this->api('GET', $host, 'fees/dues?student_id=' . $student->id, $admin)->assertOk()->json('data.lines');
        $this->assertCount(2, $lines);
        \Illuminate\Support\Facades\DB::listen(function ($query) {
            if (str_starts_with($query->sql, 'insert into `fee_payments`')) $this->travelTo('2026-10-16 00:00:01');
        });
        $this->api('POST', $host, 'fees/collect', $admin, ['student_id' => $student->id, 'payment_method' => 'cash',
            'lines' => array_map(fn ($line) => ['key' => $line['key']], $lines)])->assertCreated();
        $dates = Tenancy::as($i, fn () => \App\Models\FeePayment::orderBy('line_no')->get()->map(fn ($row) => $row->paid_at->format('Y-m-d H:i:s'))->all());
        $this->assertSame(['2026-10-15 23:59:59', '2026-10-15 23:59:59'], $dates);
    }
}
