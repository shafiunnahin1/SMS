<?php

namespace Tests\Feature\Admission;

use App\Models\{AdmissionCycle, AdmissionLead};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D209 ACY.5 (docs/modules/admission-cycle.md section 6 PublicStatusPrivacyTest): application_no AND phone are both needed (any
// mismatch is the same 404), throttled, only the applicant's own state and next step, no name; the published cycles list hides drafts.
class PublicAdmissionStatusTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_status_needs_both_is_private_and_throttled(): void
    {
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acys');
        $o = $this->school('acys2');
        foreach ([$s, $o] as $x) $x['i']->forceFill(['settings' => array_replace($x['i']->settings ?? [], ['public_site' => ['enabled' => true, 'admission_open' => true]])])->save();
        Tenancy::as($s['i'], function () use ($s) {
            AdmissionCycle::create(['name' => 'Draft one', 'program_id' => $s['p']->id, 'seats' => 1, 'apply_from' => '2030-01-01', 'apply_until' => '2030-12-31', 'status' => 'draft', 'rule' => ['mode' => 'merit']]);
            $c = AdmissionCycle::create(['name' => 'Six 2031', 'program_id' => $s['p']->id, 'seats' => 1, 'apply_from' => '2030-01-01', 'apply_until' => '2030-12-31',
                'status' => 'listing', 'application_fee' => '0', 'rule' => ['mode' => 'merit', 'waiting' => 1]]);
            AdmissionLead::create(['name' => 'Secret Name', 'phone' => '01711000701', 'cycle_id' => $c->id, 'application_no' => 'A30-SSSSS', 'test_roll' => '0001',
                'merit_rank' => 1, 'list_status' => 'selected', 'follow_up_date' => '2030-02-08']);
        });
        $get = function (array $x, string $q) { $this->app['auth']->forgetGuards(); return $this->getJson("http://{$x['host']}/api/v1/public/admission/status?{$q}"); };

        $r = $get($s, 'application_no=a30-sssss&phone=%2B8801711000701')->assertOk();
        $this->assertSame(['A30-SSSSS', 'selected', 'confirm', '2030-02-08', '0001'], [$r->json('data.application_no'), $r->json('data.list_status'), $r->json('data.next_step'), $r->json('data.confirm_by'), $r->json('data.test_roll')]);
        $this->assertStringNotContainsString('Secret Name', $r->getContent());
        $get($s, 'application_no=A30-SSSSS&phone=01711000799')->assertNotFound()->assertJsonPath('error', 'application_not_found');   // wrong phone
        $get($s, 'application_no=A30-XXXXX&phone=01711000701')->assertNotFound()->assertJsonPath('error', 'application_not_found');   // wrong number
        $get($o, 'application_no=A30-SSSSS&phone=01711000701')->assertNotFound();                                                   // another institution
        $get($s, 'application_no=A30-SSSSS')->assertStatus(422);                                                                   // both are required

        $cycles = $this->getJson("http://{$s['host']}/api/v1/public/admission/cycles")->assertOk();
        $this->assertSame(['Six 2031'], array_column($cycles->json('data'), 'name'));   // no draft

        for ($n = 0; $n < 6; $n++) $get($s, 'application_no=A30-XXXXX&phone=01711000701');
        $get($s, 'application_no=A30-SSSSS&phone=01711000701')->assertStatus(429);   // 10 a minute
    }
}
