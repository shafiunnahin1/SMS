<?php

namespace Tests\Feature\Substitution;

use App\Models\{LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionOperation, LeaveSubstitutionSlot, LeaveType, Routine, Teacher};
use App\Services\Substitution\OperationReceipts;
use App\Support\Tenancy;
use Illuminate\Support\Str;

// D200: a teacher's leave with one routine period and (optionally) a cover slot at version 1 with its slot_created event
trait SubstitutionFixture
{
    /** @return array{karim: Teacher, other: Teacher, leave: LeaveApplication, routine: Routine} */
    protected function leaveWithRoutine(array $s, string $date = '2030-01-06', string $day = 'sun'): array
    {
        return Tenancy::as($s['i'], function () use ($s, $date, $day) {
            $karim = Teacher::where('user_id', $s['karimUser']->id)->first();
            $other = Teacher::where('user_id', $s['otherUser']->id)->first();
            $type = LeaveType::firstOrCreate(['name' => 'Casual'], ['max_days_per_year' => 10, 'is_paid' => true]);
            $leave = LeaveApplication::create(['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => $date, 'to_date' => $date, 'total_days' => 1, 'status' => 'approved']);
            $routine = Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim->id, 'day_of_week' => $day,
                'start_time' => '09:00', 'end_time' => '09:45', 'room_no' => '101']);
            return compact('karim', 'other', 'leave', 'routine');
        });
    }

    protected function slot(array $s, array $f, string $date = '2030-01-06', string $status = 'unassigned', ?int $substitute = null): LeaveSubstitutionSlot
    {
        return Tenancy::as($s['i'], function () use ($s, $f, $date, $status, $substitute) {
            $r = app(OperationReceipts::class);
            $slot = LeaveSubstitutionSlot::create(['leave_application_id' => $f['leave']->id, 'routine_id' => $f['routine']->id, 'original_teacher_id' => $f['karim']->id,
                'occurrence_date' => $date, 'source_start_time' => '09:00', 'source_end_time' => '09:45', 'source_room_no' => '101', 'status' => $status, 'substitute_teacher_id' => $substitute]);
            $op = LeaveSubstitutionOperation::create(['leave_application_id' => $f['leave']->id, 'user_id' => $s['admin']->id, 'action' => 'leave_create',
                'idempotency_key_sha256' => $r->keyDigest('fixture:' . Str::uuid()), 'payload_sha256' => str_repeat('f', 64), 'result_code' => 'created', 'result_http_status' => 201, 'result_slot_count' => 1]);
            LeaveSubstitutionEvent::create(['leave_substitution_operation_id' => $op->id, 'leave_substitution_slot_id' => $slot->id, 'leave_application_id' => $f['leave']->id, 'version' => 1,
                'result_status' => $status, 'event_type' => 'slot_created', 'user_id' => $s['admin']->id, 'original_teacher_id' => $f['karim']->id, 'substitute_teacher_id' => $substitute,
                'source_program_id' => $s['p']->id, 'source_batch_id' => $s['a']->id, 'source_subject_id' => $s['bangla']->id, 'occurrence_date' => $date,
                'source_start_time' => '09:00', 'source_end_time' => '09:45', 'source_room_no' => '101', 'idempotency_key' => $r->eventKey($op, $slot->id), 'payload_sha256' => str_repeat('f', 64)]);
            return $slot;
        });
    }
}
