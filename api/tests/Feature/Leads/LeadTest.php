<?php

namespace Tests\Feature\Leads;

use App\Models\{AdmissionLead, AuditLog, Enrollment, Student};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D202 PUB.1 (coaching-private-batch.md "Leads"): the admin keeps admission leads (new -> contacted -> visited -> enrolled |
// lost) with a follow-up date; the accountant only reads; `enrolled` is never set by hand - convert admits the Student and enrols
// them, once; a converted lead is neither edited nor deleted; another institution's lead is 404; the module gates everything.
class LeadTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_follow_up_convert_and_who_may_do_what(): void
    {
        $this->travelTo('2030-01-05 10:00:00');
        $s = $this->school('lead');
        $o = $this->school('lead2');
        $h = $s['host'];
        $acct = $this->makeUser($s['i'], 'accountant');

        // create: a valid Bangladeshi number is stored normalised; status starts new; never a hand-set enrolled
        $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Rafi', 'phone' => '12345'])->assertStatus(422);
        $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Rafi', 'phone' => '01711223344', 'status' => 'enrolled'])->assertStatus(422);
        $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Rafi', 'phone' => '01711223344', 'interested_program_id' => $o['p']->id])->assertStatus(422);   // another institution's program
        $id = $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Rafi', 'phone' => '+8801711223344', 'guardian_name' => 'Abdul', 'current_class' => 'Class 9, XYZ School',
            'interested_program_id' => $s['p']->id, 'source' => 'facebook', 'follow_up_date' => '2030-01-05', 'note' => 'call after 5 pm'])
            ->assertCreated()->assertJsonPath('data.status', 'new')->assertJsonPath('data.phone', '01711223344')->assertJsonPath('data.program', 'Class 10')->json('data.id');
        $second = $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Mitu', 'phone' => '01811223344', 'follow_up_date' => '2030-01-09'])->assertCreated()->json('data.id');
        $this->api('POST', $h, 'leads', $acct, ['name' => 'X', 'phone' => '01711223345'])->assertForbidden();
        $this->api('POST', $h, 'leads', $s['karimUser'], ['name' => 'X', 'phone' => '01711223345'])->assertForbidden();

        // list: filters; the follow-up card counts open leads due today; the accountant reads; no IP hash ever
        $list = $this->api('GET', $h, 'leads', $acct)->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('meta.follow_up_today', 1);
        $this->assertStringNotContainsString('ip_hash', $list->getContent());
        $this->assertSame([$id], array_column($this->api('GET', $h, 'leads?follow_up_date=2030-01-05', $s['admin'])->json('data'), 'id'));
        $this->api('PUT', $h, "leads/{$second}", $s['admin'], ['status' => 'contacted', 'follow_up_date' => '2030-01-12'])->assertOk()->assertJsonPath('data.status', 'contacted');
        $this->assertSame([$second], array_column($this->api('GET', $h, 'leads?status=contacted', $s['admin'])->json('data'), 'id'));
        $this->api('PUT', $h, "leads/{$second}", $s['admin'], ['status' => 'enrolled'])->assertStatus(422);
        $this->api('PUT', $h, "leads/{$second}", $acct, ['status' => 'lost'])->assertForbidden();

        // another institution's lead is not there
        $this->api('PUT', $o['host'], "leads/{$id}", $o['admin'], ['status' => 'lost'])->assertNotFound();
        $this->api('POST', $o['host'], "leads/{$id}/convert", $o['admin'])->assertNotFound();
        $this->assertSame(0, $this->api('GET', $o['host'], 'leads', $o['admin'])->json('meta.total'));

        // convert: the Student is admitted from the lead's own details and enrolled in the batch - once
        $this->api('POST', $h, "leads/{$id}/convert", $s['admin'], ['batch_ids' => [$o['a']->id]])->assertStatus(422);          // another institution's batch
        $done = $this->api('POST', $h, "leads/{$id}/convert", $s['admin'], ['batch_ids' => [$s['a']->id], 'gender' => 'male'])->assertCreated()
            ->assertJsonPath('data.status', 'enrolled')->json('data');
        $student = Tenancy::as($s['i'], fn () => Student::with('user:id,name')->find($done['converted_student_id']));
        $this->assertSame(['Rafi', '01711223344', 'Abdul', 'Class 9, XYZ School', 'male', $done['student_code']],
            [$student->user->name, $student->guardian_phone, $student->father_name, $student->studying_at, $student->gender, $student->student_id]);
        $this->assertSame([$s['a']->id], Tenancy::as($s['i'], fn () => Enrollment::where('student_id', $student->id)->where('status', 'active')->pluck('batch_id')->all()));
        $this->assertTrue(Tenancy::as($s['i'], fn () => AuditLog::where('action', 'lead.converted')->exists()));
        $this->api('POST', $h, "leads/{$id}/convert", $s['admin'], ['batch_ids' => [$s['a']->id]])->assertStatus(422)->assertJsonPath('error', 'lead_converted');
        $this->api('PUT', $h, "leads/{$id}", $s['admin'], ['status' => 'lost'])->assertStatus(422)->assertJsonPath('error', 'lead_converted');
        $this->api('DELETE', $h, "leads/{$id}", $s['admin'])->assertStatus(422);
        $this->assertSame(1, Tenancy::as($s['i'], fn () => Student::whereKey($student->id)->count()));

        // a lead that was not converted can be removed; a convert without a batch admits without an enrollment
        $third = $this->api('POST', $h, 'leads', $s['admin'], ['name' => 'Sumi', 'phone' => '01911223344'])->assertCreated()->json('data.id');
        $this->api('POST', $h, "leads/{$third}/convert", $s['admin'])->assertCreated();
        $this->api('DELETE', $h, "leads/{$second}", $s['admin'])->assertOk();
        $this->assertSame(2, Tenancy::as($s['i'], fn () => AdmissionLead::count()));

        // the module gates everything: a private batch does not have `leads`
        $pb = $this->makeInstitution('lead-pb', 'private_batch');
        $this->api('GET', $this->hostOf($pb), 'leads', $this->makeUser($pb, 'admin'))->assertForbidden();
    }
}
