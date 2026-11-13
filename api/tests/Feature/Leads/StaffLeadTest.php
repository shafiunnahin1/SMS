<?php

namespace Tests\Feature\Leads;

use App\Models\{AdmissionLead, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D204 GAP.3: department staff work admission leads with exact duty keys - staff.lead.read (list, referral summary),
// staff.lead.create (new lead), staff.lead.update (status, follow-up, note, referrer); no key implies another; delete and convert
// are never theirs; without the department header, in another department or without the key it is 403.
class StaffLeadTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private array $s;

    private function staff(string $name, array $keys): array
    {
        $i = $this->s['i'];
        $u = User::create(['institution_id' => $i->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
        $u->forceFill(['must_change_password' => false])->save();
        $d = Tenancy::as($i, function () use ($u, $name, $keys) {
            $svc = app(DepartmentService::class);
            $d = $svc->create($this->s['admin'], ['name' => "Dept {$name}"]);
            $m = $svc->addMember($this->s['admin'], $d->id, ['user_id' => $u->id]);
            $duty = $svc->createDuty($this->s['admin'], $d->id, ['code' => strtoupper($name), 'name' => $name, 'permission_keys' => $keys]);
            $svc->assignDuties($this->s['admin'], $m->id, ['duty_ids' => [$duty->id]]);
            return $d->id;
        });
        return [$u, $d];
    }

    private function as(User $u, ?int $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken] + ($department !== null ? ['X-Department-Id' => (string) $department] : []);
        return $this->json($method, 'http://' . $this->s['host'] . '/api/v1/' . $path, $body, $headers);
    }

    public function test_each_key_opens_only_its_own_lead_work(): void
    {
        $s = $this->s = $this->school('slead');
        $s['i']->forceFill(['staff_department_mode' => 'department'])->save();
        $lead = Tenancy::as($s['i'], fn () => AdmissionLead::create(['name' => 'Rafi', 'phone' => '01711223344', 'status' => 'new']));
        [$reader, $rd] = $this->staff('Reader', ['staff.lead.read']);
        [$maker, $md] = $this->staff('Maker', ['staff.lead.create']);
        [$editor, $ed] = $this->staff('Editor', ['staff.lead.update']);

        // read: the list and the summary, only with the header, in their own department
        $this->as($reader, $rd, 'GET', 'leads')->assertOk()->assertJsonPath('meta.total', 1);
        $this->as($reader, $rd, 'GET', 'leads/referral-summary')->assertOk();
        $this->as($reader, null, 'GET', 'leads')->assertForbidden();
        $this->as($reader, $md, 'GET', 'leads')->assertForbidden();
        $this->as($reader, $rd, 'POST', 'leads', ['name' => 'X', 'phone' => '01811223344'])->assertForbidden();
        $this->as($reader, $rd, 'PUT', "leads/{$lead->id}", ['status' => 'contacted'])->assertForbidden();

        // create: only with its key; the maker is recorded; it does not read
        $id = $this->as($maker, $md, 'POST', 'leads', ['name' => 'Mitu', 'phone' => '01811223344', 'source' => 'walk_in'])->assertCreated()->json('data.id');
        $this->assertSame($maker->id, Tenancy::as($s['i'], fn () => AdmissionLead::find($id)->created_by));
        $this->as($maker, $md, 'GET', 'leads')->assertForbidden();
        $this->as($maker, $md, 'POST', 'leads', ['name' => 'X'])->assertStatus(422);                             // with the key: validation answers
        $this->as($reader, $rd, 'POST', 'leads', ['name' => 'X'])->assertForbidden();                           // without it: 403 before validation

        // update: status, follow-up, note, referrer
        $this->as($editor, $ed, 'PUT', "leads/{$lead->id}", ['status' => 'contacted', 'follow_up_date' => '2030-01-09', 'note' => 'called', 'referred_by' => $s['karimUser']->id])
            ->assertOk()->assertJsonPath('data.status', 'contacted')->assertJsonPath('data.referrer', $s['karimUser']->name);
        $this->as($editor, $ed, 'POST', 'leads', ['name' => 'X', 'phone' => '01911223344'])->assertForbidden();

        // never theirs: delete and convert - even holding every key
        [$all, $ad] = $this->staff('All', ['staff.lead.read', 'staff.lead.create', 'staff.lead.update']);
        $this->as($all, $ad, 'DELETE', "leads/{$lead->id}")->assertForbidden();
        $this->as($all, $ad, 'POST', "leads/{$lead->id}/convert", ['batch_ids' => [$s['a']->id]])->assertForbidden();
        $this->assertSame('contacted', Tenancy::as($s['i'], fn () => AdmissionLead::find($lead->id)->status));

        // the accountant stays read-only
        $acct = $this->makeUser($s['i'], 'accountant');
        $this->api('PUT', $s['host'], "leads/{$lead->id}", $acct, ['status' => 'lost'])->assertForbidden();
        $this->api('POST', $s['host'], 'leads', $acct, ['name' => 'X', 'phone' => '01911223344'])->assertForbidden();
    }
}
