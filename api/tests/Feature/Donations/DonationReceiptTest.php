<?php
namespace Tests\Feature\Donations;
use App\Models\{DonationFund,Donor};
use App\Support\Tenancy;

// donations.md §2.1: DON-{YYYY}-{seq}, unique per institution; an anonymous donation gets a receipt too; another institution has its own sequence
class DonationReceiptTest extends DonationTestCase
{
    public function test_numbers_are_sequential_per_institution_and_anonymous_has_a_receipt(): void
    {
        $f=$this->fund();$donor=Donor::create(['name'=>'Karim','phone'=>'01711000001']);
        $a=$this->give($f,'500.00',['donor_id'=>$donor->id]);$b=$this->give($f,'250.50');
        $this->assertSame(['DON-2026-00001','DON-2026-00002'],[$a->receipt_no,$b->receipt_no]);
        $this->assertNull($b->donor_id);$this->assertSame('250.50',(string)$b->amount);
        $other=$this->makeInstitution('madrasa-2');
        $other->forceFill(['settings'=>['opt_in_modules'=>['donations']]])->save();
        $no=Tenancy::as($other->fresh(),fn()=>$this->svc()->record($this->makeUser($other,'admin'),['fund_id'=>DonationFund::create(['name'=>'X'])->id,'amount'=>'10'])->receipt_no);
        $this->assertSame('DON-2026-00001',$no);
    }
}
