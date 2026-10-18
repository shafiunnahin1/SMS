<?php
namespace Tests\Feature\Accounting;
use App\Exceptions\BusinessException;
use App\Models\Voucher;
use Illuminate\Validation\ValidationException;

// accounting.md §1.1/§7: an unbalanced voucher is never saved (422); equality is to the paisa; a line is debit or credit, never both
class VoucherBalanceTest extends AccountingTestCase
{
    public function test_unbalanced_voucher_is_refused_and_nothing_is_saved(): void
    {
        try {$this->journal([['account_code'=>'5200','debit'=>'100.00'],['account_code'=>'1100','credit'=>'99.99']]);$this->fail('unbalanced saved');}
        catch(BusinessException $e){$this->assertSame([422,'voucher_unbalanced'],[$e->status,$e->errorCode]);}
        $this->assertSame(0,Voucher::count());
    }

    public function test_balanced_to_the_paisa_is_posted_with_a_typed_number(): void
    {
        $v=$this->journal([['account_code'=>'5200','debit'=>'100.10'],['account_code'=>'5300','debit'=>'0.05'],['account_code'=>'1100','credit'=>'100.15']]);
        $this->assertSame(['posted','JV-2026-00001',3],[$v->status,$v->voucher_no,$v->lines->count()]);
        $this->assertSame('JV-2026-00002',$this->journal([['account_code'=>'5200','debit'=>'1.00'],['account_code'=>'1100','credit'=>'1.00']])->voucher_no);
    }

    public function test_a_line_with_both_sides_or_neither_is_invalid(): void
    {
        foreach([[['account_code'=>'5200','debit'=>'5.00','credit'=>'5.00'],['account_code'=>'1100','credit'=>'0']],
                 [['account_code'=>'5200','debit'=>'0'],['account_code'=>'1100','credit'=>'0']],
                 [['account_code'=>'5200','debit'=>'-5'],['account_code'=>'1100','credit'=>'-5']]] as $lines){
            try {$this->journal($lines);$this->fail('bad line accepted');}catch(ValidationException){}
        }
        $this->assertSame(0,Voucher::count());
    }
}
