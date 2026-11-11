<?php

namespace Tests\Feature\Substitution;

use App\Models\{LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionOperation, LeaveSubstitutionSlot, LeaveType, Routine, Teacher, User};
use App\Services\Substitution\LeaveCoverService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D200 SUBL.3 (API.md materialization and reconciliation): creating a Teacher's leave makes unassigned slots for periods that
// have not started; approval gives every occurrence one final event - an eligible explicit choice is offered (never confirmed),
// an unavailable choice is a gap with a reason while the leave is still approved, covers the applicant owed on those dates go
// back to a gap; reject / cancel cancel live slots and a new leave gets new slots; Idempotency-Key replay and conflict; a stale
// occurrence_scope is refused; without a key the old behaviour stays and every period is a gap.
class LeaveCoverTest extends TestCase
{
    use RefreshDatabase, ExamFixture, SubstitutionFixture;

    private function keyed(string $key, \Closure $call)
    {
        $this->withHeader('Idempotency-Key', $key);
        try { return $call(); } finally { $this->flushHeaders(); }
    }

    public function test_leave_lifecycle_materializes_and_reconciles_cover_slots(): void
    {
        $this->travelTo('2030-01-01 08:00:00');                                       // a Tuesday
        $s = $this->school('lcv');
        $h = $s['host'];
        [$karim, $other, $free, $type, $r1, $r2, $r4] = Tenancy::as($s['i'], function () use ($s) {
            $karim = Teacher::where('user_id', $s['karimUser']->id)->first();
            $other = Teacher::where('user_id', $s['otherUser']->id)->first();
            $fu = User::create(['institution_id' => $s['i']->id, 'name' => 'Free teacher', 'email' => 'free@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            $free = Teacher::create(['user_id' => $fu->id, 'employee_id' => 'T-F']);
            $type = LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 20, 'is_paid' => true]);
            $mk = fn ($t, $day, $start, $end, $batch) => Routine::create(['program_id' => $s['p']->id, 'batch_id' => $batch, 'subject_id' => $s['bangla']->id, 'teacher_id' => $t, 'day_of_week' => $day, 'start_time' => $start, 'end_time' => $end]);
            $r1 = $mk($karim->id, 'sun', '09:00', '09:45', $s['a']->id);
            $r2 = $mk($karim->id, 'mon', '09:00', '09:45', $s['a']->id);
            $mk($other->id, 'mon', '09:30', '10:15', $s['b']->id);                    // Other is busy on Monday then
            $r4 = $mk($other->id, 'sun', '11:00', '11:45', $s['b']->id);
            return [$karim, $other, $free, $type, $r1, $r2, $r4];
        });
        $slots = fn (int $leave) => Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::where('leave_application_id', $leave)->orderBy('routine_id')->get());
        $last = fn (LeaveSubstitutionSlot $x) => Tenancy::as($s['i'], fn () => LeaveSubstitutionEvent::where('leave_substitution_slot_id', $x->id)->orderByDesc('version')->first());
        $body = ['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-07', 'reason' => 'Family'];

        // create with a key: two unassigned slots at version 1; the same key replays, another body under it conflicts
        $leave = $this->keyed('k-create', fn () => $this->api('POST', $h, 'hr/leaves', $s['admin'], $body))->assertCreated()->json('data.id');
        $this->assertSame($leave, $this->keyed('k-create', fn () => $this->api('POST', $h, 'hr/leaves', $s['admin'], $body))->assertCreated()->json('data.id'));
        $this->keyed('k-create', fn () => $this->api('POST', $h, 'hr/leaves', $s['admin'], ['reason' => 'Other'] + $body))->assertStatus(409)->assertJsonPath('error', 'idempotency_conflict');
        $this->assertSame(1, Tenancy::as($s['i'], fn () => LeaveApplication::count()));
        $this->assertSame([[$r1->id, 'unassigned', 1], [$r2->id, 'unassigned', 1]], $slots($leave)->map(fn ($x) => [$x->routine_id, $x->status, $x->version])->all());
        $this->assertSame('slot_created', $last($slots($leave)[0])->event_type);

        // Karim owes a cover on the Sunday of his own leave (Other's leave, confirmed)
        $otherLeave = Tenancy::as($s['i'], fn () => LeaveApplication::create(['user_id' => $s['otherUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06', 'total_days' => 1, 'status' => 'approved']));
        $owed = $this->slot($s, ['leave' => $otherLeave, 'routine' => $r4, 'karim' => $other], '2030-01-06', 'confirmed', $karim->id);

        // approval: choices must cover every occurrence; a stale scope is refused; nothing was written by either
        $pick = fn ($a, $b) => [['routine_id' => $r1->id, 'occurrence_date' => '2030-01-06', 'substitute_teacher_id' => $a], ['routine_id' => $r2->id, 'occurrence_date' => '2030-01-07', 'substitute_teacher_id' => $b]];
        $this->api('PATCH', $h, "hr/leaves/{$leave}/approve", $s['admin'], ['cover_choices' => [$pick($free->id, null)[0]]])->assertStatus(422);
        $this->api('PATCH', $h, "hr/leaves/{$leave}/approve", $s['admin'], ['cover_choices' => $pick(999999, null)])->assertStatus(422);
        $this->api('PATCH', $h, "hr/leaves/{$leave}/approve", $s['admin'], ['cover_choices' => $pick($free->id, null), 'expected_versions' => ['occurrence_scope' => str_repeat('a', 64)]])
            ->assertStatus(409)->assertJsonPath('error', 'substitution_version_conflict');
        $this->assertSame('pending', Tenancy::as($s['i'], fn () => LeaveApplication::find($leave)->status));
        $scope = Tenancy::as($s['i'], fn () => app(LeaveCoverService::class)->scope(LeaveApplication::find($leave), $karim, ['2030-01-06', '2030-01-07']));

        // Free is eligible -> offered; Other is busy on Monday -> a gap with the reason, and the leave is approved all the same
        $approve = fn () => $this->keyed('k-approve', fn () => $this->api('PATCH', $h, "hr/leaves/{$leave}/approve", $s['admin'], ['cover_choices' => $pick($free->id, $other->id), 'expected_versions' => ['occurrence_scope' => $scope]]));
        $approve()->assertOk()->assertJsonPath('data.status', 'approved')->assertJsonPath('cover_gaps', [['routine_id' => $r2->id, 'occurrence_date' => '2030-01-07', 'reason' => 'target_busy']]);
        [$a, $b] = $slots($leave)->all();
        $this->assertSame([['offered', 2, $free->id, 'offer_created'], ['unassigned', 2, null, 'leave_approved']], [[$a->status, $a->version, $a->substitute_teacher_id, $last($a)->event_type], [$b->status, $b->version, $b->substitute_teacher_id, $last($b)->event_type]]);
        $this->assertSame('target_busy', $last($b)->reason_code);
        $this->assertSame([['unassigned', 2, null], 'substitute_leave_invalidated'], [[$owed->fresh()->status, $owed->fresh()->version, $owed->fresh()->substitute_teacher_id], $last($owed)->event_type]);
        $op = Tenancy::as($s['i'], fn () => LeaveSubstitutionOperation::where('action', 'leave_approve')->first());
        $this->assertSame([3, $leave], [$op->result_slot_count, $op->leave_application_id]);
        $approve()->assertOk();                                                        // replay: no new version or event (the stale scope is not even looked at)
        $this->assertSame([2, 2, 1], [$slots($leave)[0]->version, $slots($leave)[1]->version, Tenancy::as($s['i'], fn () => LeaveSubstitutionOperation::where('action', 'leave_approve')->count())]);

        // cancel before the leave starts: its live slots are cancelled; the other leave's slot is not touched
        $this->api('PATCH', $h, "hr/leaves/{$leave}/cancel", $s['admin'], ['reason' => 'Plans changed'])->assertOk();
        $this->assertSame([['cancelled', 3, 'leave_cancelled'], ['cancelled', 3, 'leave_cancelled']], $slots($leave)->map(fn ($x) => [$x->status, $x->version, $last($x)->event_type])->all());
        $this->assertSame(2, $owed->fresh()->version);

        // a new leave for the same dates gets new slots; the old ones keep their history. Without a key and choices: gaps
        $again = $this->api('POST', $h, 'hr/leaves', $s['admin'], $body)->assertCreated()->json('data.id');
        $new = $slots($again);
        $this->assertSame(2, $new->count());
        $this->assertEmpty(array_intersect($new->pluck('id')->all(), $slots($leave)->pluck('id')->all()));
        Tenancy::as($s['i'], fn () => $new[0]->forceFill(['status' => 'nominated', 'substitute_teacher_id' => $free->id])->save());
        $this->api('PATCH', $h, "hr/leaves/{$again}/approve", $s['admin'])->assertOk()->assertJsonMissingPath('cover_gaps');
        $this->assertSame([['unassigned', 'nomination_cleared'], ['unassigned', 'leave_approved']], $slots($again)->map(fn ($x) => [$x->status, $last($x)->event_type])->all());

        // reject: a pending leave's slots are cancelled
        $third = $this->api('POST', $h, 'hr/leaves', $s['admin'], ['from_date' => '2030-01-13', 'to_date' => '2030-01-13'] + $body)->assertCreated()->json('data.id');
        $this->api('PATCH', $h, "hr/leaves/{$third}/reject", $s['admin'])->assertOk();
        $this->assertSame([['cancelled', 'leave_rejected']], $slots($third)->map(fn ($x) => [$x->status, $last($x)->event_type])->all());
        // every slot: one event per version
        Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::all()->each(fn ($x) => $this->assertSame($x->version, LeaveSubstitutionEvent::where('leave_substitution_slot_id', $x->id)->count(), "slot {$x->id}")));
    }
}
