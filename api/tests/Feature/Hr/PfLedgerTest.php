<?php
namespace Tests\Feature\Hr;
use App\Exceptions\BusinessException;
use App\Models\{PayrollItem,ProvidentFundEntry,SalaryPayAccount};
use App\Services\Hr\PayrollPaymentService;

// staff-payroll.md §10/§17: PF employee share is a deduction line; the employer share never leaves the payee's pay and only
// enters the ledger; both rows are written once at payment; the ledger is append-only.
class PfLedgerTest extends PayrollRunTestCase
{
    private function withPf(array $pf): array
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        $i->forceFill(['settings'=>['payroll'=>['pf'=>$pf]]])->save();$this->bindTenant($i->fresh());
        SalaryPayAccount::factory()->create(['payee_id'=>$staff->id]);
        foreach(app(\App\Services\Hr\HrCalendar::class)->dates('2026-10-01','2026-10-31') as $date) \App\Models\StaffAttendance::create(['staff_id'=>$staff->id,'date'=>$date,'status'=>'present']);
        return [$i,$admin,$staff,$accountant];
    }

    public function test_employee_share_is_deducted_employer_share_is_ledger_only_and_written_once_at_payment(): void
    {
        [$i,$admin,$staff,$accountant]=$this->withPf(['enabled'=>true,'employee_percent'=>'10','employer_percent'=>'5','base'=>'basic']);
        $run=$this->draft($accountant);$item=$run->items->first();
        $line=collect($item->breakdown)->firstWhere('source','pf');
        $this->assertSame(['pf_employee','2000.00'],[$line['code'],$line['amount']],'10% of basic 20,000');
        $this->assertSame('pf',collect($item->breakdown)->where('type','deduction')->pluck('source')->first(fn($s)=>$s==='pf'));
        $this->assertSame(0,ProvidentFundEntry::count(),'nothing in the ledger before payment');

        $this->runs()->transition($accountant,$run->id,'review');$this->runs()->transition($admin,$run->id,'approve');
        $pay=app(PayrollPaymentService::class);$pay->pay($accountant,$run->id,[]);$pay->pay($accountant,$run->id,[]);
        $rows=ProvidentFundEntry::orderBy('id')->get(['kind','amount','payroll_item_id']);
        $this->assertSame([['employee','2000.00',$item->id],['employer','1000.00',$item->id]],$rows->map(fn($r)=>[$r->kind,$r->amount,$r->payroll_item_id])->all());
        $this->assertSame('26000.00',PayrollItem::find($item->id)->net,'28,000 - 2,000; the employer 1,000 is not deducted');
    }

    public function test_ledger_rows_cannot_be_changed_or_deleted(): void
    {
        $this->withPf(['enabled'=>false]);
        $row=ProvidentFundEntry::factory()->create();
        foreach([fn()=>$row->update(['amount'=>'1.00']),fn()=>$row->delete()] as $attempt){
            try{$attempt();$this->fail('PF ledger changed');}catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
        }
        $this->assertSame('1000.00',$row->fresh()->amount);
    }

    public function test_gross_base_and_disabled_pf(): void
    {
        [,,,$accountant]=$this->withPf(['enabled'=>true,'employee_percent'=>'10','employer_percent'=>'0','base'=>'gross']);
        $this->assertSame('2800.00',collect($this->draft($accountant)->items->first()->breakdown)->firstWhere('source','pf')['amount'],'10% of gross 28,000');
    }
}
