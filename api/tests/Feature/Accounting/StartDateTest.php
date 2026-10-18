<?php
namespace Tests\Feature\Accounting;
use App\Exceptions\BusinessException;
use App\Models\Voucher;

// accounting.md §1.4/§5/§7: nothing posts before start_date; the opening journal balances against 3100
class StartDateTest extends AccountingTestCase
{
    public function test_before_start_and_without_start_nothing_posts(): void
    {
        try{$this->journal([['account_code'=>'5200','debit'=>'1.00'],['account_code'=>'1100','credit'=>'1.00']],'2026-09-30');$this->fail('posted before start');}
        catch(BusinessException $e){$this->assertSame('accounting_before_start',$e->errorCode);}
        $this->settings(['start_date'=>null]);
        try{$this->journal([['account_code'=>'5200','debit'=>'1.00'],['account_code'=>'1100','credit'=>'1.00']]);$this->fail('posted without a start date');}
        catch(BusinessException $e){$this->assertSame('accounting_not_started',$e->errorCode);}
    }

    public function test_opening_balances_balance_against_3100_once(): void
    {
        $v=$this->acc()->opening($this->admin,[['account_code'=>'1100','debit'=>'5000.00'],['account_code'=>'1200','debit'=>'20000.00'],['account_code'=>'2100','credit'=>'3000.00']]);
        $this->assertSame(['2026-10-01','posted','opening'],[$v->date->toDateString(),$v->status,$v->source]);
        $equity=$v->lines->firstWhere('account_id',$this->acc()->account('3100')->id);
        $this->assertSame(['0.00','22000.00'],[$equity->debit,$equity->credit]);
        $this->expectException(BusinessException::class);
        $this->acc()->opening($this->admin,[['account_code'=>'1100','debit'=>'1.00']]);
    }
}
