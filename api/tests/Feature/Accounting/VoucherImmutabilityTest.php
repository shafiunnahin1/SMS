<?php
namespace Tests\Feature\Accounting;
use App\Exceptions\BusinessException;
use App\Models\{Voucher,VoucherLine};
use App\Support\Money;

// accounting.md §1.2/§7, D32: a posted voucher cannot be edited or deleted (422); reverse = a new opposite voucher;
// the original stays unchanged and original + reversal net to 0; a second reversal is refused
class VoucherImmutabilityTest extends AccountingTestCase
{
    public function test_posted_voucher_is_final_and_reversal_nets_to_zero(): void
    {
        $v=$this->journal([['account_code'=>'5200','debit'=>'3000.00'],['account_code'=>'1100','credit'=>'3000.00']]);
        foreach([fn()=>$v->update(['narration'=>'x']),fn()=>$v->delete(),fn()=>$v->lines->first()->update(['debit'=>'1.00']),fn()=>$v->lines->first()->delete()] as $attempt){
            try{$attempt();$this->fail('posted voucher changed');}catch(BusinessException $e){$this->assertSame([422,'voucher_final'],[$e->status,$e->errorCode]);}
        }
        $r=$this->acc()->reverse($this->admin,$v->id,'wrong account');
        $this->assertSame(['reversed',$v->id],[$r->status,$r->reverses_id]);
        $this->assertSame(['posted','3000.00'],[$v->fresh()->status,$v->fresh()->lines->first()->debit],'original unchanged');
        $net=VoucherLine::get()->groupBy('account_id')->map(fn($ls)=>$ls->sum(fn($l)=>Money::toPaisa((string)$l->debit)-Money::toPaisa((string)$l->credit)));
        $this->assertSame([0],$net->unique()->values()->all(),'every account nets to zero');
        try{$this->acc()->reverse($this->admin,$v->id,'again');$this->fail('reversed twice');}catch(BusinessException $e){$this->assertSame('already_reversed',$e->errorCode);}
    }

    public function test_drafts_can_change_and_post_once(): void
    {
        $d=$this->journal([['account_code'=>'5200','debit'=>'10.00'],['account_code'=>'1100','credit'=>'10.00']],post:false);
        $d->update(['narration'=>'edited']);
        $this->assertSame('posted',$this->acc()->post($this->admin,$d->id)->status);
        $this->assertSame('posted',$this->acc()->post($this->admin,$d->id)->status,'identical retry');
        $this->assertSame(1,Voucher::count());
    }
}
