<?php
namespace Tests\Feature\Accounting;
use App\Exceptions\BusinessException;

// accounting.md §1.6/§7: manual vouchers cannot touch the donation-fund accounts 4300 / 4300.<fund>
class FundAccountGuardTest extends AccountingTestCase
{
    public function test_manual_voucher_cannot_touch_fund_accounts(): void
    {
        $this->acc()->account('4300.7');
        foreach(['4300','4300.7'] as $code){
            try{$this->journal([['account_code'=>'1100','debit'=>'10.00'],['account_code'=>$code,'credit'=>'10.00']]);$this->fail('fund account touched manually');}
            catch(BusinessException $e){$this->assertSame([422,'fund_account'],[$e->status,$e->errorCode]);}
        }
        $auto=$this->acc()->create(['type'=>'receipt','date'=>'2026-10-15','source'=>'donation','source_id'=>9],[['account_code'=>'1100','debit'=>'10.00'],['account_code'=>'4300.7','credit'=>'10.00']],null,true,true);
        $this->assertSame('posted',$auto->status,'automatic donation posting is allowed');
    }
}
