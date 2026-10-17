<?php
namespace Tests\Feature\Hr;
use App\Exceptions\BusinessException;
use App\Models\{Expense,PayrollItem,SalaryAdjustment,SalaryAdvance,SalaryPayAccount};
use App\Services\Hr\PayrollPaymentService;

// staff-payroll.md §8/§17, D87/D104: partial payment; one expenses summary row per run and method; first payment applies the item's
// adjustments and advance installments exactly once; a returned payment offsets the expense and is repayable; closed cash days refuse.
class PayrollPaymentTest extends PayrollRunTestCase
{
    private function pay(): PayrollPaymentService { return app(PayrollPaymentService::class); }

    private function approvedRun(): array
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        SalaryPayAccount::factory()->create(['payee_id'=>$staff->id,'method'=>'bank']);
        $adjustment=SalaryAdjustment::factory()->create(['payee_id'=>$staff->id,'status'=>'approved','approved_by'=>$admin->id,'kind'=>'allowance','amount'=>'500.00']);
        $advance=SalaryAdvance::factory()->create(['payee_id'=>$staff->id,'status'=>'active','amount'=>'100.00','installment_amount'=>'100.00','installments'=>1,'requested_by'=>$accountant->id]);
        $run=$this->draft($accountant);$this->runs()->transition($accountant,$run->id,'review');
        return [$this->runs()->transition($admin,$run->id,'approve'),$i,$admin,$accountant,$staff,$adjustment,$advance];
    }

    public function test_payment_settles_adjustments_and_advances_once_and_writes_one_summary_expense_per_method(): void
    {
        [$run,$i,$admin,$accountant,$staff,$adjustment,$advance]=$this->approvedRun();
        $item=$run->items->first();
        $this->assertContains('adjustment',array_column($item->breakdown,'source'));
        $this->assertContains('advance',array_column($item->breakdown,'source'));

        $paid=$this->pay()->pay($accountant,$run->id,['reference'=>'BANK-1']);
        $this->assertSame(['paid','paid','bank'],[$paid->status,$paid->items->first()->status,$paid->items->first()->payment_method]);
        $this->assertSame(['applied',$item->id],[$adjustment->fresh()->status,$adjustment->fresh()->payroll_item_id]);
        $this->assertSame(['100.00','closed'],[$advance->fresh()->recovered,$advance->fresh()->status]);
        $expenses=Expense::where('source','payroll')->where('payroll_run_id',$run->id)->get();
        $this->assertSame([[ 'bank',$item->net]],$expenses->map(fn($e)=>[$e->payment_method,$e->amount])->all());

        $this->pay()->pay($accountant,$run->id,['item_ids'=>[$item->id]]);   // identical retry
        $this->assertSame(1,Expense::where('source','payroll')->count());
        $this->assertSame('100.00',$advance->fresh()->recovered);
    }

    public function test_returned_payment_offsets_the_expense_and_repays_without_settling_twice(): void
    {
        [$run,$i,$admin,$accountant,,$adjustment,$advance]=$this->approvedRun();
        $this->pay()->pay($accountant,$run->id,[]);$item=PayrollItem::where('run_id',$run->id)->first();
        $failed=$this->pay()->fail($accountant,$item->id,['reason'=>'account closed']);
        $this->assertSame(['failed','approved'],[$failed->status,$run->fresh()->status]);
        $this->assertSame('0.00',\App\Support\Money::format(\App\Support\Money::toPaisa((string)Expense::where('source','payroll')->sum('amount'))));
        $this->pay()->pay($accountant,$run->id,['method'=>'cash','reference'=>'CASH-2']);
        $this->assertSame(['paid','cash'],[$item->fresh()->status,$item->fresh()->payment_method]);
        $this->assertSame(['100.00','applied'],[$advance->fresh()->recovered,$adjustment->fresh()->status]);
        $this->assertSame(3,Expense::where('source','payroll')->count(),'pay, offset, repay: append-only');
    }

    public function test_partial_payment_held_items_and_unapproved_runs(): void
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        $run=$this->draft($accountant);$item=$run->items->first();
        $this->assertSame(['held','no_pay_account'],[$item->status,$item->hold_reason]);
        try {$this->pay()->pay($accountant,$run->id,[]);$this->fail('draft paid');}catch(BusinessException $e){$this->assertSame(409,$e->status);}
        try {$this->pay()->hold($accountant,$item->id,['action'=>'release']);$this->fail('released without account');}catch(BusinessException $e){$this->assertSame(409,$e->status);}
        SalaryPayAccount::factory()->create(['payee_id'=>$staff->id]);
        $this->assertSame('ready',$this->pay()->hold($accountant,$item->id,['action'=>'release'])->status);
        $this->runs()->transition($accountant,$run->id,'review');$this->runs()->transition($admin,$run->id,'approve');
        $this->pay()->hold($accountant,$item->id,['action'=>'hold','reason'=>'verify bank']);
        $this->assertSame('approved',$this->pay()->pay($accountant,$run->id,[])->status,'held items stay unpaid; the run is not paid');
        $this->assertSame(0,Expense::where('source','payroll')->count());
    }

    public function test_a_closed_cash_day_refuses_cash_payment_atomically(): void
    {
        [$run,$i,$admin,$accountant,,$adjustment]=$this->approvedRun();
        $this->api('POST',$this->hostOf($i),'cashbook/2026-10-15/close',$admin,['opening_cash'=>'0.00','counted_cash'=>'0.00'])->assertCreated();
        $this->bindTenant($i);
        try {$this->pay()->pay($accountant,$run->id,['method'=>'cash']);$this->fail('closed day');}catch(BusinessException $e){$this->assertSame('day_closed',$e->errorCode);}
        $this->assertSame(['ready','approved',0],[PayrollItem::where('run_id',$run->id)->value('status'),$adjustment->fresh()->status,Expense::where('source','payroll')->count()]);
    }
}
