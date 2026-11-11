<?php

namespace Tests\Feature\Substitution;

use App\Models\{LeaveSubstitutionSlot, LeaveType, Routine, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D200 SUBL.5 (API.md D199 reads; AUTHORIZATION.md D199): the slots of a leave (admin, the applicant; another teacher 404), the
// admin's "needs cover" list, the teacher's own offers, the candidate picker (free teachers only); the digests a read returns
// drive the next action; no read shows the leave reason; a confirmed cover puts the period into the substitute's day and lets
// them - and only them, only that date - take its attendance.
class SlotReadTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_reads_drive_the_flow_and_a_confirmed_cover_takes_attendance(): void
    {
        $this->travelTo('2030-01-01 08:00:00');
        $s = $this->school('srd');
        $h = $s['host'];
        [$karim, $other, $free, $freeUser, $type, $r1] = Tenancy::as($s['i'], function () use ($s) {
            $fu = User::create(['institution_id' => $s['i']->id, 'name' => 'Free teacher', 'email' => 'free@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            $karim = Teacher::where('user_id', $s['karimUser']->id)->first();
            $other = Teacher::where('user_id', $s['otherUser']->id)->first();
            $mk = fn ($t, $start, $end, $batch) => Routine::create(['program_id' => $s['p']->id, 'batch_id' => $batch, 'subject_id' => $s['bangla']->id, 'teacher_id' => $t, 'day_of_week' => 'sun', 'start_time' => $start, 'end_time' => $end]);
            $r1 = $mk($karim->id, '09:00', '09:45', $s['a']->id);
            $mk($other->id, '09:15', '10:00', $s['b']->id);                               // Other is busy then
            return [$karim, $other, Teacher::create(['user_id' => $fu->id, 'employee_id' => 'T-F']), $fu, LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 20, 'is_paid' => true]), $r1];
        });
        $leave = $this->api('POST', $h, 'hr/leaves', $s['admin'], ['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06', 'reason' => 'SECRET-REASON'])->assertCreated()->json('data.id');
        $base = "hr/leaves/{$leave}/substitution-slots";
        $act = function ($as, string $method, string $suffix, array $slot, array $body = []) use ($h, $base) {
            $this->withHeader('Idempotency-Key', 'k-' . uniqid());
            try { return $this->api($method, $h, "{$base}/{$slot['id']}/{$suffix}", $as, $body + ['expected_versions' => ['slot' => $slot['version'], 'source' => $slot['source']]]); }
            finally { $this->flushHeaders(); }
        };

        // the applicant reads their own leave; another teacher cannot; the reason is never in a read
        $own = $this->api('GET', $h, $base, $s['karimUser'])->assertOk()->assertJsonCount(1, 'data.slots')->assertJsonPath('data.slots.0.status', 'unassigned')->assertJsonPath('data.slots.0.subject', 'বাংলা');
        $this->assertStringNotContainsString('SECRET-REASON', $own->getContent());
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $own->json('data.occurrence_scope'));
        $this->api('GET', $h, $base, $s['otherUser'])->assertNotFound();
        $slot = $own->json('data.slots.0');

        // the picker: only teachers who are free then (not the original, not the busy one); the applicant nominates from it
        $this->assertSame([$free->id], array_column($this->api('GET', $h, "{$base}/{$slot['id']}/candidates", $s['karimUser'])->assertOk()->json('data'), 'id'));
        $this->api('GET', $h, "{$base}/{$slot['id']}/candidates", $s['otherUser'])->assertNotFound();
        $act($s['karimUser'], 'PUT', 'nomination', $slot, ['substitute_teacher_id' => (string) $free->id])->assertOk();

        // approval with the scope the read gave; the admin's list shows what is still open
        $read = $this->api('GET', $h, $base, $s['admin'])->assertOk()->json('data');
        $this->assertSame(['nominated', $free->id], [$read['slots'][0]['status'], $read['slots'][0]['substitute']['id']]);
        $this->api('PATCH', $h, "hr/leaves/{$leave}/approve", $s['admin'], ['expected_versions' => ['occurrence_scope' => $read['occurrence_scope']]])->assertOk();   // no choices: a gap
        $list = $this->api('GET', $h, 'hr/substitution-slots?from=2030-01-01&to=2030-01-20', $s['admin'])->assertOk()->json('data');
        $this->assertSame([1, $slot['id'], 'Teacher', 'nomination_cleared'], [$list['total'], $list['slots'][0]['id'], $list['slots'][0]['applicant'] ? 'Teacher' : null, $list['slots'][0]['latest_event']]);
        $this->assertStringNotContainsString('SECRET-REASON', json_encode($list));
        $this->api('GET', $h, 'hr/substitution-slots?from=2030-01-01&to=2030-03-20', $s['admin'])->assertStatus(422);
        $this->api('GET', $h, 'hr/substitution-slots', $s['karimUser'])->assertForbidden();
        $this->api('GET', $h, "{$base}/{$slot['id']}/candidates", $s['karimUser'])->assertForbidden();   // approved: the admin picks now

        // offer -> the target sees it among their offers (nobody else's), accepts with the digests from that read
        $act($s['admin'], 'PUT', 'offer', $list['slots'][0], ['substitute_teacher_id' => (string) $free->id])->assertOk();
        $this->assertSame(0, $this->api('GET', $h, 'hr/substitution-slots?from=2030-01-01&to=2030-01-20', $s['admin'])->json('data.total'));
        $this->assertSame(1, $this->api('GET', $h, 'hr/substitution-slots?from=2030-01-01&to=2030-01-20&status=offered', $s['admin'])->json('data.total'));
        $this->assertSame([], $this->api('GET', $h, 'teacher/substitution-offers', $s['otherUser'])->assertOk()->json('data'));
        $offer = $this->api('GET', $h, 'teacher/substitution-offers', $freeUser)->assertOk()->assertJsonCount(1, 'data')->json('data.0');
        $this->assertSame(['offered', 'বাংলা', $leave], [$offer['status'], $offer['subject'], $offer['leave_id']]);

        // before acceptance the period is not the target's and they may not take its attendance
        $this->travelTo('2030-01-06 09:10:00');
        $att = ['routine_id' => $r1->id, 'date' => '2030-01-06', 'records' => [['student_id' => $s['mine']->id, 'status' => 'present']]];
        $this->assertSame([], $this->api('GET', $h, 'teacher/periods/today', $freeUser)->assertOk()->json('data.periods'));
        $this->api('POST', $h, 'period-attendance', $freeUser, $att)->assertForbidden();
        $this->travelTo('2030-01-05 08:00:00');
        $act($freeUser, 'PATCH', 'accept', $offer)->assertOk();
        $this->assertSame('confirmed', $this->api('GET', $h, 'teacher/substitution-offers', $freeUser)->json('data.0.status'));

        // on the day: the cover is in the substitute's periods, marked, and they take the attendance; not on another date, not another teacher
        $this->travelTo('2030-01-06 09:10:00');
        $p = $this->api('GET', $h, 'teacher/periods/today', $freeUser)->assertOk()->json('data.periods');
        $this->assertSame([[$r1->id, true, 'Teacher']], array_map(fn ($x) => [$x['routine_id'], $x['cover'], $x['original_teacher'] ? 'Teacher' : null], $p));
        $this->assertFalse($this->api('GET', $h, 'teacher/periods/today', $s['karimUser'])->json('data.periods.0.cover'));
        $this->api('POST', $h, 'period-attendance', $freeUser, $att)->assertCreated();
        $this->api('POST', $h, 'period-attendance', $s['otherUser'], $att)->assertForbidden();
        $this->travelTo('2030-01-13 09:10:00');
        $this->api('POST', $h, 'period-attendance', $freeUser, ['date' => '2030-01-13'] + $att)->assertForbidden();
        $this->assertSame(1, Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::where('status', 'confirmed')->count()));
    }
}
