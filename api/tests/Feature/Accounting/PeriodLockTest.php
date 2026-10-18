<?php
namespace Tests\Feature\Accounting;
use App\Exceptions\BusinessException;

// accounting.md §1.5/§7: posting or reversing on or before locked_until is refused (422)
class PeriodLockTest extends AccountingTestCase
{
    public function test_locked_period_refuses_posting_and_reversal(): void
    {
        $old=$this->journal([['account_code'=>'5200','debit'=>'10.00'],['account_code'=>'1100','credit'=>'10.00']],'2026-10-05');
        $this->settings(['locked_until'=>'2026-10-10']);
        foreach(['2026-10-10','2026-10-05'] as $date){
            try{$this->journal([['account_code'=>'5200','debit'=>'1.00'],['account_code'=>'1100','credit'=>'1.00']],$date);$this->fail('posted into a locked period');}
            catch(BusinessException $e){$this->assertSame([422,'accounting_locked'],[$e->status,$e->errorCode]);}
        }
        try{$this->acc()->reverse($this->admin,$old->id,'late fix','2026-10-09');$this->fail('reversed into a locked period');}
        catch(BusinessException $e){$this->assertSame('accounting_locked',$e->errorCode);}
        $this->assertSame('posted',$this->journal([['account_code'=>'5200','debit'=>'1.00'],['account_code'=>'1100','credit'=>'1.00']],'2026-10-11')->status);
    }
}
