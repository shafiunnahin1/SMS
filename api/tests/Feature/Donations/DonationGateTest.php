<?php
namespace Tests\Feature\Donations;

// donations.md §5 / D107: opt-in - without opt_in_modules the routes answer 403 module_disabled; switched on, admin/accountant work
class DonationGateTest extends DonationTestCase
{
    public function test_opt_in_gates_the_module(): void
    {
        $h=$this->hostOf($this->i);
        $this->api('GET',$h,'donation-funds',$this->admin)->assertOk();
        $this->api('GET',$h,'donations',$this->makeUser($this->i,'accountant'))->assertOk();
        $off=$this->makeInstitution('school-no-donations');
        $this->api('GET',$this->hostOf($off),'donors',$this->makeUser($off,'admin'))->assertForbidden()->assertJsonPath('error','module_disabled');
        $batch=$this->makeInstitution('batch-donations','private_batch');
        $batch->forceFill(['settings'=>['opt_in_modules'=>['donations']]])->save();
        $this->api('GET',$this->hostOf($batch),'donors',$this->makeUser($batch,'admin'))->assertForbidden()->assertJsonPath('error','module_disabled');
    }

    public function test_donation_flow_over_http(): void
    {
        $h=$this->hostOf($this->i);$acct=$this->makeUser($this->i,'accountant');
        $fund=$this->api('POST',$h,'donation-funds',$acct,['name'=>'Mosque construction','kind'=>'project','restricted'=>true,'description'=>'Building only'])->assertCreated()->json('data.id');
        $donor=$this->api('POST',$h,'donors',$acct,['name'=>'Rahim','phone'=>'01711000002'])->assertCreated()->json('data.id');
        $this->api('POST',$h,'donors',$acct,['name'=>'Other','phone'=>'01711000002'])->assertStatus(422);
        $camp=$this->api('POST',$h,'donation-campaigns',$acct,['fund_id'=>$fund,'title'=>'Roof','goal_amount'=>'20000','status'=>'active'])->assertCreated()->json('data.id');
        $id=$this->api('POST',$h,'donations',$acct,['fund_id'=>$fund,'donor_id'=>$donor,'campaign_id'=>$camp,'amount'=>'10000'])->assertCreated()->assertJsonPath('data.receipt_no','DON-2026-00001')->json('data.id');
        $this->api('POST',$h,'donations',$acct,['fund_id'=>$fund,'amount'=>'500'])->assertCreated()->assertJsonPath('data.donor_id',null);
        $this->api('GET',$h,"donation-campaigns/$camp/progress",$acct)->assertOk()->assertJsonPath('data.raised','10000.00')->assertJsonPath('data.percent','50.00');
        $this->api('POST',$h,'expenses',$acct,['category'=>'construction','title'=>'Cement','amount'=>'7000','expense_date'=>'2026-10-15','fund_id'=>$fund])->assertCreated();
        $this->api('POST',$h,'expenses',$acct,['category'=>'construction','title'=>'Rods','amount'=>'4000','expense_date'=>'2026-10-15','fund_id'=>$fund])->assertStatus(422)->assertJsonPath('error','fund_overdrawn');
        $this->api('GET',$h,"donation-funds/$fund/statement",$acct)->assertOk()->assertJsonPath('data.balance','3500.00');
        $this->api('GET',$h,"donations/$id/receipt.pdf",$acct)->assertOk()->assertHeader('Content-Type','application/pdf');
        $this->api('GET',$h,"donors/$donor/statement.pdf?year=2026",$acct)->assertOk()->assertHeader('Content-Type','application/pdf');
        $this->api('POST',$h,"donations/$id/reverse",$acct,['reason'=>'wrong donor'])->assertStatus(422)->assertJsonPath('error','fund_overdrawn');
        $this->api('DELETE',$h,"donors/$donor",$acct)->assertOk();
        $this->api('GET',$h,"donations/$id",$acct)->assertOk()->assertJsonPath('data.donor_id',$donor);
    }
}
