<?php

namespace Tests\Feature\Substitution;

use App\Models\{LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionSlot, LeaveType, Routine, Teacher, User};
use App\Services\Substitution\SlotActionService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D200 SUBL.4 (API.md D96 slot actions, refresh-source, D199 notifications): who may do which action, the Idempotency-Key and
// expected_versions contract, every state and error code, one version + one event per change, and one in-app notice per
// recipient per event that a replay never repeats.
class SlotActionTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private array $s;
    private int $leave;
    private int $slot;
    private int $n = 0;

    private function act(?User $as, string $method, string $suffix, array $body = [], ?string $key = null, ?array $expected = null)
    {
        $expected ??= Tenancy::as($this->s['i'], function () {
            $slot = LeaveSubstitutionSlot::find($this->slot);
            return ['slot' => (string) $slot->version, 'source' => app(SlotActionService::class)->sourceOf(LeaveApplication::find($this->leave), $slot)];
        });
        $this->withHeader('Idempotency-Key', $key ?? 'auto-' . ++$this->n);
        try { return $this->api($method, $this->s['host'], "hr/leaves/{$this->leave}/substitution-slots/{$this->slot}/{$suffix}", $as, $body + ['expected_versions' => $expected]); }
        finally { $this->flushHeaders(); }
    }

    private function state(): array
    {
        return Tenancy::as($this->s['i'], function () {
            $x = LeaveSubstitutionSlot::find($this->slot);
            return [$x->status, $x->version, $x->substitute_teacher_id, LeaveSubstitutionEvent::where('leave_substitution_slot_id', $x->id)->orderByDesc('version')->value('event_type')];
        });
    }

    private function notices(User $u): int
    {
        return $u->fresh()->notifications()->where('data->type', 'leave_substitution')->count();
    }

    public function test_actions_errors_and_notifications(): void
    {
        $this->travelTo('2030-01-01 08:00:00');
        $s = $this->s = $this->school('sla');
        $h = $s['host'];
        [$karim, $other, $free, $freeUser, $type, $r1] = Tenancy::as($s['i'], function () use ($s) {
            $fu = User::create(['institution_id' => $s['i']->id, 'name' => 'Free teacher', 'email' => 'free@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            return [Teacher::where('user_id', $s['karimUser']->id)->first(), Teacher::where('user_id', $s['otherUser']->id)->first(), Teacher::create(['user_id' => $fu->id, 'employee_id' => 'T-F']), $fu,
                LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 20, 'is_paid' => true]),
                Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => Teacher::where('user_id', $s['karimUser']->id)->value('id'), 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45', 'room_no' => '101'])];
        });
        $this->leave = $this->api('POST', $h, 'hr/leaves', $s['admin'], ['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06'])->assertCreated()->json('data.id');
        $this->slot = Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::where('leave_application_id', $this->leave)->value('id'));
        $to = fn (Teacher $t) => ['substitute_teacher_id' => (string) $t->id];
        $base = "hr/leaves/{$this->leave}/substitution-slots/{$this->slot}";

        // the contract: a key, expected versions, string ids, no unknown field
        $this->api('PUT', $h, "{$base}/nomination", $s['karimUser'], $to($free) + ['expected_versions' => ['slot' => '1', 'source' => str_repeat('a', 64)]])->assertStatus(422)->assertJsonPath('error', 'idempotency_key_invalid');
        $this->act($s['karimUser'], 'PUT', 'nomination', ['substitute_teacher_id' => $free->id])->assertStatus(422);
        $this->act($s['karimUser'], 'PUT', 'nomination', $to($free) + ['status' => 'confirmed'])->assertStatus(422);
        $this->act($s['karimUser'], 'PUT', 'nomination', $to($free), null, ['slot' => '1', 'source' => str_repeat('a', 64)])->assertStatus(409)->assertJsonPath('error', 'substitution_version_conflict');

        // nomination: only the applicant, only while pending; no invitation is sent; replay and no-op
        $this->act($s['otherUser'], 'PUT', 'nomination', $to($free))->assertNotFound();
        $this->act($s['admin'], 'PUT', 'nomination', $to($free))->assertForbidden();
        $this->act($s['admin'], 'PUT', 'offer', $to($free))->assertStatus(409)->assertJsonPath('error', 'substitution_state_conflict');
        $before = Tenancy::as($s['i'], fn () => ['slot' => '1', 'source' => app(SlotActionService::class)->sourceOf(LeaveApplication::find($this->leave), LeaveSubstitutionSlot::find($this->slot))]);
        $first = $this->act($s['karimUser'], 'PUT', 'nomination', $to($free), 'nom-1')->assertOk()->assertJsonPath('data.result_slot_count', 1)->assertJsonPath('data.events.0.result_status', 'nominated')->json('data');
        $this->assertSame(['nominated', 2, $free->id, 'nomination_set'], $this->state());
        $this->assertSame($first, $this->act($s['karimUser'], 'PUT', 'nomination', $to($free), 'nom-1', $before)->assertOk()->json('data'));   // replay comes before the stale check
        $this->assertSame(2, $this->state()[1]);
        $this->act($s['karimUser'], 'PUT', 'nomination', $to($other), 'nom-1')->assertStatus(409)->assertJsonPath('error', 'idempotency_conflict');
        $this->act($s['karimUser'], 'PUT', 'nomination', $to($free))->assertOk()->assertJsonPath('data.result_code', 'unchanged')->assertJsonPath('data.events', []);
        $this->act($s['karimUser'], 'PUT', 'nomination', $to($karim))->assertStatus(409)->assertJsonPath('error', 'substitution_unavailable');
        $this->act($s['karimUser'], 'DELETE', 'nomination')->assertOk();
        $this->assertSame(['unassigned', 3, null, 'nomination_cleared'], $this->state());
        $this->assertSame(0, $this->notices($freeUser));

        // approval offers Free; only the target accepts; the reviewer and the applicant are told once, a replay tells nobody again
        $this->api('PATCH', $h, "hr/leaves/{$this->leave}/approve", $s['admin'], ['cover_choices' => [['routine_id' => $r1->id, 'occurrence_date' => '2030-01-06', 'substitute_teacher_id' => $free->id]]])->assertOk();
        $this->assertSame([['offered', 4, $free->id, 'offer_created'], 1], [$this->state(), $this->notices($freeUser)]);
        $this->act($s['karimUser'], 'PUT', 'nomination', $to($other))->assertStatus(409)->assertJsonPath('error', 'substitution_state_conflict');   // not pending any more
        $this->act($s['otherUser'], 'PATCH', 'accept')->assertForbidden();
        $this->act($freeUser, 'PATCH', 'accept', [], 'acc-1')->assertOk()->assertJsonPath('data.events.0.result_status', 'confirmed');
        $this->assertSame(['confirmed', 5, $free->id, 'offer_accepted'], $this->state());
        $this->assertSame([1, 1], [$this->notices($s['admin']), $this->notices($s['karimUser'])]);
        $this->act($freeUser, 'PATCH', 'accept', [], 'acc-1', ['slot' => '4', 'source' => Tenancy::as($s['i'], fn () => app(SlotActionService::class)->sourceOf(LeaveApplication::find($this->leave), LeaveSubstitutionSlot::find($this->slot)))])->assertOk();
        $this->assertSame([5, 1, 1], [$this->state()[1], $this->notices($s['admin']), $this->notices($s['karimUser'])]);
        $this->act($freeUser, 'PATCH', 'accept')->assertStatus(409)->assertJsonPath('error', 'substitution_state_conflict');

        // replacing a confirmed cover needs a reason and a fresh acceptance; decline returns a gap
        $this->act($s['admin'], 'PUT', 'offer', $to($other))->assertStatus(422);
        $this->act($s['admin'], 'PUT', 'offer', $to($other) + ['reason' => 'Free is needed elsewhere'])->assertOk();
        $this->assertSame([['offered', 6, $other->id, 'cover_replaced'], 1], [$this->state(), $this->notices($s['otherUser'])]);
        $this->act($s['otherUser'], 'PATCH', 'decline', ['reason' => 'Busy'])->assertOk();
        $this->assertSame(['unassigned', 7, null, 'offer_declined'], $this->state());
        $this->act($s['admin'], 'PUT', 'offer', $to($karim))->assertStatus(409)->assertJsonPath('error', 'substitution_unavailable');
        $this->act($s['admin'], 'PUT', 'offer', ['substitute_teacher_id' => '999999'])->assertStatus(422);
        $this->act($s['admin'], 'PUT', 'offer', $to($free))->assertOk();
        $this->act($s['admin'], 'DELETE', 'offer')->assertOk();
        $this->assertSame([['unassigned', 9, null, 'cover_cleared'], 3], [$this->state(), $this->notices($freeUser)]);   // offer, offer again, cleared
        $this->act($s['admin'], 'DELETE', 'offer')->assertOk()->assertJsonPath('data.result_code', 'unchanged');

        // a routine change cancels the slot; only refresh-source reopens it, as a fresh gap with the new time
        $this->act($s['admin'], 'PATCH', 'refresh-source', ['reason' => 'x'])->assertStatus(409)->assertJsonPath('error', 'substitution_state_conflict');
        $this->api('PUT', $h, "routines/{$r1->id}", $s['admin'], ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim->id, 'day_of_week' => 'sun', 'start_time' => '09:05', 'end_time' => '09:50', 'room_no' => '101'])->assertOk();
        $this->assertSame(['cancelled', 10, null, 'source_invalidated'], $this->state());
        $this->act($s['admin'], 'PUT', 'offer', $to($free))->assertStatus(409)->assertJsonPath('error', 'substitution_state_conflict');
        $this->act($s['admin'], 'PATCH', 'refresh-source')->assertStatus(422);
        $this->act($s['admin'], 'PATCH', 'refresh-source', ['reason' => 'Routine fixed'])->assertOk();
        $this->assertSame(['unassigned', 11, null, 'source_refreshed'], $this->state());
        $this->assertSame('09:05:00', Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::find($this->slot)->source_start_time));
        $this->assertSame(3, $this->notices($s['admin']));   // accepted, declined (the admin made both offers), refreshed

        // one event per version; nothing after the period started
        $this->assertSame(11, Tenancy::as($s['i'], fn () => LeaveSubstitutionEvent::where('leave_substitution_slot_id', $this->slot)->count()));
        $this->travelTo('2030-01-06 10:00:00');
        $this->act($s['admin'], 'PUT', 'offer', $to($free))->assertStatus(409)->assertJsonPath('error', 'substitution_period_started');
    }
}
