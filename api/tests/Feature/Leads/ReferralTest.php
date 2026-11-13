<?php

namespace Tests\Feature\Leads;

use App\Models\{AdmissionLead, AuditLog, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D203 REF.1: a teacher or staff member who fills in an application in their own account is its referrer; they see only their own
// referrals (no phone, no note); the admin sets, changes or clears the referrer of any lead (audited), sees and filters it, and with
// the accountant reads the per-referrer summary; the public form never has a referrer; another institution is never involved.
class ReferralTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function staff(array $s, string $name): User
    {
        $u = User::create(['institution_id' => $s['i']->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
        $u->forceFill(['must_change_password' => false])->save();
        return $u;
    }

    public function test_referrers_and_what_each_role_sees(): void
    {
        $this->travelTo('2030-05-10 10:00:00');
        $s = $this->school('ref');
        $o = $this->school('ref2');
        $h = $s['host'];
        $teacher = $s['karimUser'];
        $staff = $this->staff($s, 'Office');
        $acct = $this->makeUser($s['i'], 'accountant');

        // the teacher refers: source referral, referrer = the teacher; they cannot name anyone else or set the status
        $this->api('POST', $h, 'referrals', $teacher, ['name' => 'Rafi', 'phone' => '12345'])->assertStatus(422);
        $this->api('POST', $h, 'referrals', $teacher, ['name' => 'Rafi', 'phone' => '01711223344', 'referred_by' => $s['otherUser']->id])->assertStatus(422);
        $this->api('POST', $h, 'referrals', $teacher, ['name' => 'Rafi', 'phone' => '01711223344', 'status' => 'enrolled'])->assertStatus(422);
        $this->api('POST', $h, 'referrals', $teacher, ['name' => 'Rafi', 'phone' => '01711223344', 'interested_program_id' => $o['p']->id])->assertStatus(422);
        $a = $this->api('POST', $h, 'referrals', $teacher, ['name' => 'Rafi', 'phone' => '+8801711223344', 'interested_program_id' => $s['p']->id, 'interested_batch_id' => $s['a']->id])
            ->assertCreated()->assertJsonPath('data.status', 'new')->assertJsonPath('data.program', 'Class 10')->json('data.id');
        $lead = Tenancy::as($s['i'], fn () => AdmissionLead::find($a));
        $this->assertSame(['referral', $teacher->id, $teacher->id, '01711223344'], [$lead->source, $lead->referred_by, $lead->created_by, $lead->phone]);
        $b = $this->api('POST', $h, 'referrals', $staff, ['name' => 'Mitu', 'phone' => '01811223344'])->assertCreated()->json('data.id');
        $this->api('POST', $h, 'referrals', $s['admin'], ['name' => 'X', 'phone' => '01911223344'])->assertForbidden();
        $this->api('POST', $h, 'referrals', $acct, ['name' => 'X', 'phone' => '01911223344'])->assertForbidden();
        $this->api('POST', $h, 'referrals', $s['parent'], ['name' => 'X', 'phone' => '01911223344'])->assertForbidden();

        // each sees only their own, without the phone
        $mine = $this->api('GET', $h, 'referrals', $teacher)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.name', 'Rafi');
        $this->assertStringNotContainsString('01711223344', $mine->getContent());
        $this->assertSame([$b], array_column($this->api('GET', $h, 'referrals', $staff)->assertOk()->json('data'), 'id'));
        $this->assertSame(0, $this->api('GET', $h, 'referrals', $s['otherUser'])->json('meta.total'));

        // the public form never has a referrer, even when it sends one
        $s['i']->forceFill(['settings' => ['public_site' => ['enabled' => true]]])->save();
        $this->post("http://{$h}/api/v1/public/admission", ['name' => 'Web', 'phone' => '01611223344', 'consent' => true, 'referred_by' => $teacher->id])->assertCreated();
        $web = Tenancy::as($s['i'], fn () => AdmissionLead::where('phone', '01611223344')->sole());
        $this->assertSame(['website', null], [$web->source, $web->referred_by]);

        // the admin: names a referrer on a new lead, changes and clears it; only an active teacher / staff of this institution
        $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Walk', 'phone' => '01511223344', 'referred_by' => $o['karimUser']->id])->assertStatus(422);   // another institution
        $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Walk', 'phone' => '01511223344', 'referred_by' => $acct->id])->assertStatus(422);              // not a teacher / staff
        $s['otherUser']->forceFill(['is_active' => false])->save();
        $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Walk', 'phone' => '01511223344', 'referred_by' => $s['otherUser']->id])->assertStatus(422);    // inactive
        $c = $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Walk', 'phone' => '01511223344', 'referred_by' => $staff->id])->assertCreated()
            ->assertJsonPath('data.referrer', 'Office')->json('data.id');
        $this->api('PUT', $h, "leads/{$web->id}", $s['admin'], ['referred_by' => $teacher->id])->assertOk()->assertJsonPath('data.referrer', $teacher->name);
        $this->api('PUT', $h, "leads/{$web->id}", $s['admin'], ['referred_by' => null])->assertOk()->assertJsonPath('data.referred_by', null);
        $this->api('PUT', $h, "leads/{$a}", $acct, ['referred_by' => null])->assertForbidden();
        $audits = Tenancy::as($s['i'], fn () => AuditLog::where('action', 'lead.referrer_changed')->orderBy('id')->get());
        $this->assertCount(3, $audits);   // set on create, set, cleared - the self-referrals are not admin changes

        // list: shows the referrer and filters by it
        $this->assertEqualsCanonicalizing([$b, $c], array_column($this->api('GET', $h, "leads?referred_by={$staff->id}", $s['admin'])->json('data'), 'id'));

        // a converted lead keeps its referrer; only the referrer may still change on it
        $this->api('POST', $h, "leads/{$a}/convert", $s['admin'], ['batch_ids' => [$s['a']->id]])->assertCreated()->assertJsonPath('data.referrer', $teacher->name);
        $this->api('PUT', $h, "leads/{$a}", $s['admin'], ['status' => 'lost'])->assertStatus(422)->assertJsonPath('error', 'lead_converted');
        $this->api('PUT', $h, "leads/{$a}", $s['admin'], ['referred_by' => $staff->id])->assertOk()->assertJsonPath('data.status', 'enrolled');
        $this->api('PUT', $h, "leads/{$a}", $s['admin'], ['referred_by' => $teacher->id])->assertOk();
        $this->assertSame('enrolled', $this->api('GET', $h, 'referrals', $teacher)->json('data.0.status'));
        $this->assertSame(1, $this->api('GET', $h, 'referrals', $teacher)->json('meta.admitted'));

        // summary: per referrer, applications and admitted; the period counts by application date
        $sum = $this->api('GET', $h, 'leads/referral-summary', $acct)->assertOk();
        $by = collect($sum->json('data'))->keyBy('user_id');
        $this->assertSame([1, 1], [$by[$teacher->id]['applications'], $by[$teacher->id]['admitted']]);
        $this->assertSame([2, 0], [$by[$staff->id]['applications'], $by[$staff->id]['admitted']]);
        $this->assertSame([3, 1], [$sum->json('meta.applications'), $sum->json('meta.admitted')]);
        $this->assertSame([], $this->api('GET', $h, 'leads/referral-summary?from=2030-06-01&to=2030-06-30', $s['admin'])->json('data'));
        $this->api('GET', $h, 'leads/referral-summary?from=2030-06-01&to=2030-05-01', $s['admin'])->assertStatus(422);
        $this->api('GET', $h, 'leads/referral-summary', $teacher)->assertForbidden();
        $this->assertSame([], $this->api('GET', $o['host'], 'leads/referral-summary', $o['admin'])->json('data'));
    }
}
