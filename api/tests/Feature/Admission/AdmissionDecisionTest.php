<?php

namespace Tests\Feature\Admission;

use App\Jobs\SendSmsJob;
use App\Models\{AdmissionCycle, AdmissionLead, AuditLog, Student};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D209 ACY.4 (docs/modules/admission-cycle.md section 6 WaitingPromotionTest): selected [a,b,c], waiting [w1,w2]; b declines =>
// selected [a,c,w1], waiting [w2]; a deadline that passes moves the next one up (admission:promote), the order never changes;
// confirm stops the deadline; admit converts through the existing lead convert; the result SMS follows `admission_result`.
class AdmissionDecisionTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function listed(array $s): array
    {
        return Tenancy::as($s['i'], function () use ($s) {
            $c = AdmissionCycle::create(['name' => 'Six 2031', 'program_id' => $s['p']->id, 'seats' => 3, 'apply_from' => '2030-01-01', 'apply_until' => '2030-12-31',
                'status' => 'listing', 'rule' => ['mode' => 'merit', 'waiting' => 2, 'confirm_within_days' => 7]]);
            $ids = [];
            foreach (['a' => 'selected', 'b' => 'selected', 'c' => 'selected', 'w1' => 'waiting', 'w2' => 'waiting', 'r' => 'rejected'] as $k => $st) {
                $ids[$k] = AdmissionLead::create(['name' => strtoupper($k), 'phone' => '0171100060' . count($ids), 'cycle_id' => $c->id, 'application_no' => 'A30-' . str_pad(strtoupper($k), 5, 'X'),
                    'merit_rank' => count($ids) + 1, 'list_status' => $st, 'follow_up_date' => $st === 'selected' ? '2030-02-08' : null])->id;
            }
            return [$c, $ids];
        });
    }

    private function statuses(array $s, array $ids): array
    {
        return Tenancy::as($s['i'], fn () => array_map(fn ($id) => AdmissionLead::find($id)->list_status, $ids));
    }

    public function test_decline_promotes_the_next_waiting_and_the_deadline_job(): void
    {
        Queue::fake();
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acyd');
        [$c, $ids] = $this->listed($s);
        $h = $s['host'];

        $r = $this->api('POST', $h, "admission/leads/{$ids['b']}/decline", $s['admin'])->assertOk()->assertJsonPath('data.list_status', 'declined');
        $this->assertSame($ids['w1'], $r->json('data.promoted.id'));
        $this->assertSame('2030-02-08', $r->json('data.promoted.confirm_by'));
        $this->assertSame(['selected', 'declined', 'selected', 'selected', 'waiting', 'rejected'], $this->statuses($s, array_values($ids)));
        Queue::assertNothingPushed();   // admission_result is off by default: no SMS

        // a waiting applicant who declines frees nothing
        $this->assertNull($this->api('POST', $h, "admission/leads/{$ids['w2']}/decline", $s['admin'])->assertOk()->json('data.promoted'));
        $this->api('POST', $h, "admission/leads/{$ids['r']}/decline", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'lead_not_selected');

        // a confirms (no deadline); c lets the deadline pass: the job declines c - nobody is left waiting
        $this->api('POST', $h, "admission/leads/{$ids['a']}/confirm", $s['admin'])->assertOk()->assertJsonPath('data.confirm_by', null);
        $this->travelTo('2030-02-09 01:00:00');
        $this->artisan('admission:promote')->assertSuccessful();
        $this->assertSame(['selected', 'declined', 'declined', 'declined', 'declined', 'rejected'], $this->statuses($s, array_values($ids)));
        // w1 was offered on 2030-02-01 (deadline 02-08) and did not confirm either: the job declined both, in rank order
        Tenancy::as($s['i'], fn () => $this->assertSame(['deadline', 'deadline'], AuditLog::where('action', 'admission.declined')->orderBy('id')->get()->slice(2)->pluck('new_data.why')->values()->all()));
    }

    public function test_admit_converts_and_result_sms_follows_the_event_switch(): void
    {
        Queue::fake();
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acya');
        [$c, $ids] = $this->listed($s);
        $h = $s['host'];

        $this->api('POST', $h, "admission/leads/{$ids['w1']}/admit", $s['admin'], ['batch_ids' => [$s['a']->id]])->assertStatus(422)->assertJsonPath('error', 'lead_not_selected');
        $r = $this->api('POST', $h, "admission/leads/{$ids['a']}/admit", $s['admin'], ['batch_ids' => [$s['a']->id]])->assertCreated()->assertJsonPath('data.list_status', 'admitted');
        $this->assertNotNull($r->json('data.student_code'));
        Tenancy::as($s['i'], function () use ($ids) {
            $lead = AdmissionLead::find($ids['a']);
            $this->assertSame(['admitted', 'enrolled'], [$lead->list_status, $lead->status]);
            $this->assertNotNull(Student::find($lead->converted_student_id));
        });
        $this->api('POST', $h, "admission/leads/{$ids['a']}/admit", $s['admin'], ['batch_ids' => [$s['a']->id]])->assertStatus(422);   // once

        // the result SMS: off by default -> 422; on -> one per ranked applicant still selected / waiting / rejected
        $this->api('POST', $h, "admission/cycles/{$c->id}/result-sms", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'sms_event_off');
        $s['i']->forceFill(['settings' => array_replace($s['i']->settings ?? [], ['sms_events' => ['admission_result' => 'auto']])])->save();
        $this->api('POST', $h, "admission/cycles/{$c->id}/result-sms", $s['admin'])->assertOk()->assertJsonPath('data.sent', 5);
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'admission_result' && str_contains($j->message, 'A30-BXXXX') && $j->phone === '01711000601');
        Queue::assertPushed(SendSmsJob::class, 5);
        $this->api('POST', $h, "admission/leads/{$ids['b']}/confirm", $s['karimUser'])->assertForbidden();
    }
}
