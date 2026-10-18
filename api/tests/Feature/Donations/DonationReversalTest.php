<?php
namespace Tests\Feature\Donations;
use App\Exceptions\BusinessException;
use App\Models\Donation;

// donations.md §2.2 / D32: reversal = a new row; the original is unchanged; the fund balance drops; reversing twice is refused
class DonationReversalTest extends DonationTestCase
{
    public function test_reversal_is_a_new_row_once(): void
    {
        $f=$this->fund(false);$d=$this->give($f,'2000.00');
        $r=$this->svc()->reverse($this->admin,$d->id,['reason'=>'wrong fund']);
        $this->assertSame(['reversed',$d->id,'2000.00','DON-2026-00002'],[$r->status,$r->reverses_id,(string)$r->amount,$r->receipt_no]);
        $this->assertSame('received',$d->fresh()->status);
        $this->assertSame(0,$this->svc()->balance($f->id)['balance']);
        try{$this->svc()->reverse($this->admin,$d->id,['reason'=>'again']);$this->fail('twice');}catch(BusinessException $e){$this->assertSame('already_reversed',$e->errorCode);}
        try{$d->fresh()->update(['amount'=>'1.00']);$this->fail('edited');}catch(BusinessException $e){$this->assertSame('donation_final',$e->errorCode);}
        try{$d->fresh()->delete();$this->fail('deleted');}catch(BusinessException){}
        $this->assertSame(2,Donation::count());
    }

    public function test_a_spent_restricted_donation_cannot_be_reversed_below_zero(): void
    {
        $f=$this->fund();$d=$this->give($f,'1000.00');$this->spend($f,'600.00');
        $this->expectException(BusinessException::class);
        $this->svc()->reverse($this->admin,$d->id,['reason'=>'bounced']);
    }
}
