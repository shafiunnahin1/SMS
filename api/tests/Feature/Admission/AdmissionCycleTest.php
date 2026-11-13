<?php

namespace Tests\Feature\Admission;

use App\Models\{AdmissionCycle, AdmissionDraw, AdmissionLead, AuditLog};
use App\Services\Admission\AdmissionCycleService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D209 ACY.1 (docs/modules/admission-cycle.md section 6): CycleStateMachineTest, ApplicationNoTest, the commitment half of
// CommitmentTest and FreezeTest - draft -> open -> testing -> (listing: ACY.3) -> closed, one step, never back; the public form
// gives a random application_no while the cycle is open and refuses after the freeze; the lottery seed is returned once and only
// its sha256 is stored; the applicants' hash is fixed at the freeze; admin only.
class AdmissionCycleTest extends TestCase
{
    use RefreshDatabase, ExamFixture { school as baseSchool; }

    private function cycleBody(array $s, array $over = []): array
    {
        return array_replace_recursive(['name' => 'Class 6 admission 2031', 'program_id' => $s['p']->id, 'seats' => 5, 'apply_from' => '2030-01-01', 'apply_until' => '2030-12-31',
            'application_fee' => '0', 'rule' => ['mode' => 'merit', 'waiting' => 3]], $over);
    }

    private function apply(array $s, string $phone)
    {
        $this->app['auth']->forgetGuards();
        return $this->withServerVariables(['REMOTE_ADDR' => '10.2.0.' . substr($phone, -2)])->postJson("http://{$s['host']}/api/v1/public/admission", ['name' => 'Applicant', 'phone' => $phone, 'consent' => true, 'interested_program_id' => $s['p']->id]);
    }

    private function school(string $slug): array
    {
        $s = $this->baseSchool($slug);
        $s['i']->forceFill(['settings' => array_replace($s['i']->settings ?? [], ['public_site' => ['enabled' => true, 'admission_open' => true]])])->save();
        Tenancy::as($s['i'], fn () => $s['p']->forceFill(['is_public' => 1, 'is_active' => 1])->save());
        return $s;
    }

    public function test_state_machine_and_setup_edit_only_in_draft(): void
    {
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acy1');
        $h = $s['host'];
        $admin = $s['admin'];

        $this->api('POST', $h, 'admission/cycles', $admin, $this->cycleBody($s, ['rule' => ['mode' => 'raffle']]))->assertStatus(422);
        $this->api('POST', $h, 'admission/cycles', $admin, $this->cycleBody($s, ['apply_until' => '2029-01-01']))->assertStatus(422);
        $id = $this->api('POST', $h, 'admission/cycles', $admin, $this->cycleBody($s))->assertCreated()->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.rule.waiting', 3)->assertJsonPath('data.rule.publish_names', false)->json('data.id');

        // no jumps: draft cannot freeze or close
        $this->api('POST', $h, "admission/cycles/{$id}/freeze", $admin)->assertStatus(422)->assertJsonPath('error', 'cycle_wrong_state');
        $this->api('POST', $h, "admission/cycles/{$id}/close", $admin)->assertStatus(422);
        $this->api('PUT', $h, "admission/cycles/{$id}", $admin, $this->cycleBody($s, ['seats' => 8]))->assertOk()->assertJsonPath('data.seats', 8);

        $this->api('POST', $h, "admission/cycles/{$id}/open", $admin)->assertOk()->assertJsonPath('data.status', 'open')->assertJsonPath('data.seed', null);   // merit: no seed
        $this->api('PUT', $h, "admission/cycles/{$id}", $admin, $this->cycleBody($s))->assertStatus(422)->assertJsonPath('error', 'cycle_not_draft');
        $this->api('POST', $h, "admission/cycles/{$id}/open", $admin)->assertStatus(422);              // never twice
        $this->api('POST', $h, "admission/cycles/{$id}/close", $admin)->assertStatus(422);             // open -> closed is a jump
        $this->api('POST', $h, "admission/cycles/{$id}/freeze", $admin)->assertOk()->assertJsonPath('data.status', 'testing');
        $this->api('POST', $h, "admission/cycles/{$id}/open", $admin)->assertStatus(422);              // never back
        $this->api('POST', $h, "admission/cycles/{$id}/close", $admin)->assertStatus(422);             // listing comes first (ACY.3)

        Tenancy::as($s['i'], function () use ($id) {
            AdmissionCycle::whereKey($id)->update(['status' => 'listing']);
            AdmissionLead::create(['name' => 'S', 'phone' => '01711000101', 'cycle_id' => $id, 'application_no' => 'A30-SSSSS', 'list_status' => 'admitted']);
            AdmissionLead::create(['name' => 'W', 'phone' => '01711000102', 'cycle_id' => $id, 'application_no' => 'A30-WWWWW', 'list_status' => 'waiting']);
        });
        $this->api('POST', $h, "admission/cycles/{$id}/close", $admin)->assertOk()->assertJsonPath('data.status', 'closed');
        Tenancy::as($s['i'], fn () => $this->assertSame(['admitted', 'rejected'], AdmissionLead::orderBy('id')->pluck('list_status')->all()));

        $this->assertCount(1, $this->api('GET', $h, 'admission/cycles', $admin)->assertOk()->json('data'));
        $acct = $this->makeUser($s['i'], 'accountant');
        $this->api('GET', $h, 'admission/cycles', $acct)->assertForbidden();
        $this->assertCount(1, $this->api('GET', $h, 'admission/fee-cycles', $acct)->assertOk()->json('data'));   // ACY.2: the accountant's read-only list
        $this->api('GET', $h, 'admission/cycles', $s['karimUser'])->assertForbidden();
    }

    public function test_application_numbers_freeze_and_lottery_commitment(): void
    {
        Queue::fake();
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acy2');
        $h = $s['host'];
        $id = $this->api('POST', $h, 'admission/cycles', $s['admin'], $this->cycleBody($s, ['rule' => ['mode' => 'lottery']]))->json('data.id');

        // a draft cycle is not published yet: the form is an ordinary inquiry (no application number)
        $this->apply($s, '01711000201')->assertCreated()->assertJsonPath('application_no', null);

        $open = $this->api('POST', $h, "admission/cycles/{$id}/open", $s['admin'])->assertOk();
        $seed = $open->json('data.seed');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $seed);
        $this->assertSame(hash('sha256', hex2bin($seed)), $open->json('data.draw.seed_commitment'));
        $this->assertNull($this->api('GET', $h, "admission/cycles/{$id}", $s['admin'])->json('data.seed'));   // shown once
        // the seed is nowhere on the server: not in any table we write, not in the audit
        $this->assertSame(0, DB::table('admission_draws')->where('seed_commitment', $seed)->orWhere('seed_reveal', $seed)->count());
        $this->assertStringNotContainsString($seed, json_encode(DB::table('audit_logs')->get()) . json_encode(DB::table('admission_cycles')->get()));

        $nos = [];
        foreach (['01711000202', '01711000203', '01711000204'] as $phone) $nos[] = $this->apply($s, $phone)->assertCreated()->json('application_no');
        foreach ($nos as $no) $this->assertMatchesRegularExpression('/^A30-[2-9A-HJKMNP-Z]{5}$/', $no);
        $this->assertCount(3, array_unique($nos));
        $this->assertSame($nos[0], $this->apply($s, '01711000202')->assertOk()->json('application_no'));   // the same phone again: the same application

        $this->api('POST', $h, "admission/cycles/{$id}/freeze", $s['admin'])->assertOk()
            ->assertJsonPath('data.draw.applicants_count', 3)
            ->assertJsonPath('data.draw.applicants_hash', AdmissionCycleService::applicantsHash(collect($nos)->sort(SORT_STRING)->values()->all()));
        $this->apply($s, '01711000205')->assertStatus(422)->assertJsonPath('error', 'admission_cycle_closed');   // frozen
        Tenancy::as($s['i'], function () {
            $this->assertSame(3, AdmissionLead::whereNotNull('application_no')->count());
            $this->assertSame(1, AdmissionLead::whereNull('cycle_id')->count());
            $this->assertSame(1, AdmissionDraw::count());
        });
        // a frozen application cannot be deleted
        $leadId = Tenancy::as($s['i'], fn () => AdmissionLead::whereNotNull('cycle_id')->value('id'));
        $this->api('DELETE', $h, "leads/{$leadId}", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'lead_in_cycle');
        Tenancy::as($s['i'], fn () => $this->assertSame(['admission_cycle.created', 'admission_cycle.opened', 'admission_cycle.frozen'], AuditLog::orderBy('id')->pluck('action')->all()));
    }

    public function test_application_no_is_unique_per_institution(): void
    {
        $s = $this->school('acy3');
        Tenancy::as($s['i'], function () {
            $svc = app(AdmissionCycleService::class);
            $seen = [];
            for ($n = 0; $n < 200; $n++) $seen[] = $svc->newApplicationNo();
            $this->assertCount(200, array_unique($seen));
            AdmissionLead::create(['name' => 'A', 'phone' => '01711000301', 'application_no' => 'A30-XXXXX']);
            $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);
            AdmissionLead::create(['name' => 'B', 'phone' => '01711000302', 'application_no' => 'A30-XXXXX']);
        });
    }
}
