<?php

namespace Tests\Feature\Refunds;

use App\Jobs\SendSmsJob;
use App\Models\{Expense, FeePayment};
use App\Services\CashBookService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\{Event, Queue};

class RefundSettlementTest extends RefundTestCase
{
    public function test_cash_refund_has_one_outflow_and_one_notification_despite_retries(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00', 'cash', '2026-10-15');
        $id = $this->requestRefund($i, $admin, $this->payload($line)); $processed = $this->process($i, $admin, $id);
        $this->move($i, $admin, $id, 'process')->assertOk();
        Tenancy::as($i, function () use ($id, $processed) {
            $this->assertSame(1, Expense::where('source', 'refund')->count());
            $expense = Expense::where('source', 'refund')->firstOrFail();
            $this->assertSame($processed->json('data.reversal_receipt_no') . ' / refund #' . $id, $expense->note);
            $this->assertSame($expense->id, \App\Models\AuditLog::where('action', 'refund.processed')->firstOrFail()->new_data['expense_id']);
            $report = app(CashBookService::class)->show('2026-10-15', '0.00');
            $this->assertSame('100.00', $report['cash_in']);
            $this->assertSame('40.00', $report['cash_out']);
        });
        Queue::assertPushed(SendSmsJob::class, 1);
    }

    public function test_closed_cash_processing_day_rejects_atomically_and_non_cash_is_separate(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        $id = $this->requestRefund($i, $admin, $this->payload($line)); $this->move($i, $admin, $id, 'approve')->assertOk();
        $this->api('POST', $this->hostOf($i), 'cashbook/2026-10-15/close', $admin,
            ['opening_cash' => '100.00', 'counted_cash' => '100.00'])->assertCreated();
        $this->move($i, $admin, $id, 'process')->assertStatus(409)->assertJsonPath('error', 'day_closed');
        $this->assertCount(2, $this->snapshots($i, $id));
        Tenancy::as($i, fn () => $this->assertSame(0, FeePayment::whereNotNull('reverses_id')->count()));
        $bank = $this->requestRefund($i, $admin, $this->payload($line, '10.00', ['method' => 'bank'])); $this->process($i, $admin, $bank);
        Tenancy::as($i, function () {
            $expense = Expense::where('source', 'refund')->firstOrFail();
            $this->assertSame('bank', $expense->payment_method);
            $this->assertSame('10.00', $expense->amount);
            $this->assertSame('0.00', app(CashBookService::class)->show('2026-10-15')['cash_out']);
        });
    }

    public function test_failure_rolls_back_every_financial_effect_and_the_approved_state(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        $id = $this->requestRefund($i, $admin, $this->payload($line)); $this->move($i, $admin, $id, 'approve')->assertOk();
        new Expense(); // Boot the tenant listener before cloning the dispatcher for fault injection.
        $original = Expense::getEventDispatcher();
        $events = clone $original;
        Expense::setEventDispatcher($events);
        $events->listen('eloquent.creating: ' . Expense::class, fn () => throw new \RuntimeException('fixture failure'));
        try { $this->move($i, $admin, $id, 'process')->assertStatus(500); }
        finally { Expense::setEventDispatcher($original); }
        $this->assertCount(2, $this->snapshots($i, $id));
        Tenancy::as($i, function () {
            $this->assertSame(0, FeePayment::whereNotNull('reverses_id')->count());
            $this->assertSame(0, Expense::where('source', 'refund')->count());
        });
        Queue::assertNotPushed(SendSmsJob::class);
        $this->move($i, $admin, $id, 'process')->assertOk();
    }

    public function test_online_fields_and_client_owned_financial_state_are_rejected(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        foreach ([['online_payment_id' => 1], ['method' => 'online_gateway'], ['revision' => 9], ['status' => 'processed'], ['amount' => '1.00']] as $change) {
            $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($line, '40.00', $change))->assertUnprocessable();
        }
        $id = $this->requestRefund($i, $admin, $this->payload($line));
        $this->api('POST', $this->hostOf($i), "fee-refunds/{$id}/approve", $admin, ['method' => 'bank'])->assertUnprocessable();
        $this->assertCount(1, $this->snapshots($i, $id));
        $online = Tenancy::as($i, fn () => FeePayment::create($line->only(['student_id','fee_category_id','amount','paid_amount','paid_at']) +
            ['receipt_no' => 'ONLINE-FIXTURE', 'online_payment_id' => 1]));
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $this->payload($online))->assertUnprocessable();
        $float = $this->payload($line); $float['refund_lines'][0]['amount'] = 1.23;
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, $float)->assertUnprocessable();
    }

    public function test_processing_time_is_captured_once_across_midnight_for_multiple_lines(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        $second = Tenancy::as($i, fn () => FeePayment::create($line->only(['student_id','fee_category_id','amount','paid_amount','receipt_no','paid_at']) + ['line_no' => 2]));
        $input = $this->payload($line, '10.00'); $input['refund_lines'][] = ['fee_payment_id' => $second->id, 'amount' => '20.00'];
        $id = $this->requestRefund($i, $admin, $input); $this->move($i, $admin, $id, 'approve')->assertOk();
        $this->travelTo('2026-10-15 23:59:59');
        $original = FeePayment::getEventDispatcher();
        $events = clone $original;
        FeePayment::setEventDispatcher($events);
        $events->listen('eloquent.created: ' . FeePayment::class, function ($payment) {
            if ($payment->reverses_id) $this->travelTo('2026-10-16 00:00:01');
        });
        try { $this->move($i, $admin, $id, 'process')->assertOk(); }
        finally { FeePayment::setEventDispatcher($original); }
        Tenancy::as($i, function () {
            foreach (FeePayment::whereNotNull('reverses_id')->get() as $row) $this->assertSame('2026-10-15 23:59:59', $row->paid_at->format('Y-m-d H:i:s'));
            $this->assertSame('2026-10-15', Expense::where('source','refund')->firstOrFail()->expense_date->toDateString());
        });
    }

    public function test_approved_tenant_purge_removes_actual_refund_history_only_for_that_tenant(): void
    {
        \Illuminate\Support\Facades\Storage::fake('private');
        \Illuminate\Support\Facades\Storage::fake('public');
        [$gone, $admin] = $this->tenant('refund-gone'); [$kept, $other] = $this->tenant('refund-kept');
        foreach ([[$gone, $admin], [$kept, $other]] as [$i, $actor]) {
            $line = $this->fee($i, '100.00'); $id = $this->requestRefund($i, $actor, $this->payload($line));
            $this->process($i, $actor, $id);
        }
        $gone->update(['status' => 'expired', 'subscription_expires_at' => '2026-09-01']);
        $super = $this->makeUser(null, 'super_admin');
        $this->api('POST', 'admin.' . config('tenancy.base_domain'), "super/tenant-purge/{$gone->id}/execute", $super,
            ['confirm_slug' => $gone->slug, 'confirm_export_sent' => true])->assertOk();
        $this->assertSame(0, \Illuminate\Support\Facades\DB::table('fee_refunds')->where('institution_id', $gone->id)->count());
        Tenancy::as($kept, function () {
            $this->assertSame(3, \App\Models\FeeRefund::count());
            $this->assertSame(1, Expense::where('source', 'refund')->count());
            $this->assertSame(1, FeePayment::whereNotNull('reverses_id')->count());
        });
    }
}
