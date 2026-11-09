<?php

namespace Tests\Feature\Substitution;

use App\Models\{AuditLog, LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionOperation, LeaveSubstitutionSlot, LeaveType, Routine, Teacher};
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D200 SUBL.1 (D96/D99/D199): the three leave-substitution tables are deployed with tenant-bound composite foreign keys; a slot, a
// receipt and an event cannot point at another institution's leave / routine / teacher / user; receipts and events are immutable;
// tenant purge removes them first; the module is on for school, college and coaching (D200), off for private batch.
class LeaveSubstitutionStorageTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    /** one leave of the tenant's teacher Karim and his routine slot */
    private function seedLeave(array $s): array
    {
        return Tenancy::as($s['i'], function () use ($s) {
            $karim = Teacher::where('user_id', $s['karimUser']->id)->first();
            $type = LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 10, 'is_paid' => true]);
            $leave = LeaveApplication::create(['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06', 'total_days' => 1, 'status' => 'pending']);
            $routine = Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim->id, 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45']);
            return compact('karim', 'leave', 'routine');
        });
    }

    public function test_tenant_bound_storage_immutability_purge_and_module(): void
    {
        $s = $this->school('lss');
        $o = $this->school('lss2');
        $mine = $this->seedLeave($s);
        $theirs = $this->seedLeave($o);

        [$slot, $op, $event] = Tenancy::as($s['i'], function () use ($s, $mine) {
            $slot = LeaveSubstitutionSlot::create(['leave_application_id' => $mine['leave']->id, 'routine_id' => $mine['routine']->id, 'original_teacher_id' => $mine['karim']->id,
                'occurrence_date' => '2030-01-06', 'source_start_time' => '09:00', 'source_end_time' => '09:45']);
            $op = LeaveSubstitutionOperation::create(['leave_application_id' => $mine['leave']->id, 'user_id' => $s['karimUser']->id, 'action' => 'leave_create',
                'idempotency_key_sha256' => str_repeat('a', 64), 'payload_sha256' => str_repeat('b', 64), 'result_code' => 'created', 'result_http_status' => 201, 'result_slot_count' => 1]);
            $event = LeaveSubstitutionEvent::create(['leave_substitution_operation_id' => $op->id, 'leave_substitution_slot_id' => $slot->id, 'leave_application_id' => $mine['leave']->id,
                'version' => 1, 'result_status' => 'unassigned', 'event_type' => 'slot_created', 'user_id' => $s['karimUser']->id, 'original_teacher_id' => $mine['karim']->id,
                'source_program_id' => $s['p']->id, 'source_batch_id' => $s['a']->id, 'source_subject_id' => $s['bangla']->id, 'occurrence_date' => '2030-01-06',
                'source_start_time' => '09:00', 'source_end_time' => '09:45', 'idempotency_key' => str_repeat('c', 64), 'payload_sha256' => str_repeat('b', 64)]);
            return [$slot, $op, $event];
        });
        $this->assertSame([1, 'unassigned'], [$slot->fresh()->version, $slot->fresh()->status]);

        // another institution's leave, routine or teacher cannot be referenced (composite foreign keys)
        foreach ([['leave_application_id' => $theirs['leave']->id], ['routine_id' => $theirs['routine']->id], ['original_teacher_id' => $theirs['karim']->id],
                  ['substitute_teacher_id' => $theirs['karim']->id]] as $foreign) {
            $this->assertFkRefused(fn () => Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::create($foreign + ['leave_application_id' => $mine['leave']->id, 'routine_id' => $mine['routine']->id,
                'original_teacher_id' => $mine['karim']->id, 'occurrence_date' => '2030-01-13', 'source_start_time' => '09:00', 'source_end_time' => '09:45'])), json_encode($foreign));
        }
        $this->assertFkRefused(fn () => Tenancy::as($s['i'], fn () => LeaveSubstitutionOperation::create(['user_id' => $o['karimUser']->id, 'action' => 'offer',
            'idempotency_key_sha256' => str_repeat('d', 64), 'payload_sha256' => str_repeat('b', 64), 'result_code' => 'ok', 'result_http_status' => 200, 'result_slot_count' => 0])), 'foreign user');
        // one occurrence per leave/routine/date; one event per slot version
        $this->assertFkRefused(fn () => Tenancy::as($s['i'], fn () => LeaveSubstitutionSlot::create(['leave_application_id' => $mine['leave']->id, 'routine_id' => $mine['routine']->id,
            'original_teacher_id' => $mine['karim']->id, 'occurrence_date' => '2030-01-06', 'source_start_time' => '09:00', 'source_end_time' => '09:45'])), 'duplicate occurrence');

        // receipts and events never change
        foreach ([$op, $event] as $row) {
            try { Tenancy::as($s['i'], fn () => $row->fresh()->update(['result_code' => 'x', 'reason_code' => 'x'])); $this->fail('updated '.class_basename($row)); } catch (\LogicException) { $this->addToAssertionCount(1); }
            try { Tenancy::as($s['i'], fn () => $row->fresh()->delete()); $this->fail('deleted '.class_basename($row)); } catch (\LogicException) { $this->addToAssertionCount(1); }
        }

        // the module: school, college and coaching (D200), not private batch
        $gate = app(\App\Services\ModuleGate::class);
        $this->assertTrue($gate->allows($s['i'], 'substitution'));
        $this->assertTrue($gate->allows($this->makeInstitution('lss-coach', 'coaching'), 'substitution'));
        $this->assertFalse($gate->allows($this->makeInstitution('lss-pb', 'private_batch'), 'substitution'));

        // tenant purge removes the history first; the other institution keeps its rows
        Tenancy::as($o['i'], fn () => LeaveSubstitutionSlot::create(['leave_application_id' => $theirs['leave']->id, 'routine_id' => $theirs['routine']->id,
            'original_teacher_id' => $theirs['karim']->id, 'occurrence_date' => '2030-01-06', 'source_start_time' => '09:00', 'source_end_time' => '09:45']));
        $s['i']->update(['status' => 'suspended']);
        $this->actingAs($s['admin']);
        Tenancy::as($s['i'], fn () => AuditLog::record('institution.suspended', $s['i'])->forceFill(['created_at' => now()->subDays(31)])->save());
        $out = app(\App\Services\Privacy\TenantPurgeService::class)->execute($s['i'], $this->makeUser(null, 'super_admin')->id);
        $this->assertSame([1, 1, 1], [$out['tables']['leave_substitution_events'], $out['tables']['leave_substitution_slots'], $out['tables']['leave_substitution_operations']]);
        $this->assertSame(1, Tenancy::as($o['i'], fn () => LeaveSubstitutionSlot::count()));
    }

    private function assertFkRefused(\Closure $write, string $what): void
    {
        try { $write(); $this->fail("accepted: {$what}"); } catch (QueryException) { $this->addToAssertionCount(1); }
    }
}
