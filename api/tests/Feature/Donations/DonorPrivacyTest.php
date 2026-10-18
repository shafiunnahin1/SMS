<?php
namespace Tests\Feature\Donations;
use App\Models\Donor;

// donations.md §2.6 / D107: teacher, student and parent never reach donor data (403); signed-out callers get 401; the public bootstrap carries no donor
class DonorPrivacyTest extends DonationTestCase
{
    public function test_only_admin_and_accountant_see_donors(): void
    {
        $donor=Donor::create(['name'=>'Secret Donor','phone'=>'01799999999']);
        $h=$this->hostOf($this->i);
        foreach(['teacher','student','parent','institution_staff'] as $role){
            $user=$this->makeUser($this->i,$role);
            foreach(['donors',"donors/{$donor->id}",'donations','donation-funds'] as $path) $this->api('GET',$h,$path,$user)->assertForbidden();
        }
        $this->api('GET',$h,'donors')->assertUnauthorized();
        $this->assertStringNotContainsString('Secret Donor',$this->api('GET',$h,'bootstrap')->getContent());
        $this->api('GET',$h,'donors',$this->admin)->assertOk()->assertJsonPath('data.0.name','Secret Donor');
    }
}
