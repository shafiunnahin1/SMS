<?php

namespace App\Services\Substitution;

use App\Models\{LeaveSubstitutionEvent, LeaveSubstitutionSlot, Routine};
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

// D200 SUBL.2 (routine.md D199 writer inventory; academics-advanced.md D96 event mapping): a source writer invalidates the future
// live slots it affects in its own transaction, under the institution lock: one version increment and one `source_invalidated`
// event per slot, linked to one server-made receipt. `cancel` = the source or the original teacher is gone (status cancelled);
// `clear` = only the target is gone (back to unassigned). Past or already cancelled slots are history and never touched.
// The event keeps the slot version's accepted source snapshot, so the old context survives the routine being edited afterwards.
class SlotInvalidator
{
    public function __construct(private OperationReceipts $receipts) {}

    public function futureLive(): Builder
    {
        return LeaveSubstitutionSlot::where('status', '!=', 'cancelled')->whereRaw('TIMESTAMP(occurrence_date, source_start_time) > ?', [now()->format('Y-m-d H:i:s')]);
    }

    /** the routines' source changed or went away: their future live slots are cancelled */
    public function sourceChanged(array $routineIds, string $reason, string $resourceType, int $resourceId): int
    {
        if (!$routineIds) return 0;
        return $this->apply($this->futureLive()->whereIn('routine_id', $routineIds)->pluck('id')->mapWithKeys(fn ($id) => [$id => ['cancel', $reason]])->all(), $resourceType, $resourceId);
    }

    /** a teacher stopped being active: their own slots are cancelled, slots they were to cover go back to a gap */
    public function teacherInactive(int $teacherId): int
    {
        $own = $this->futureLive()->where('original_teacher_id', $teacherId)->pluck('id')->mapWithKeys(fn ($id) => [$id => ['cancel', 'teacher_inactive']])->all();
        $cover = $this->futureLive()->where('substitute_teacher_id', $teacherId)->whereIn('status', ['nominated', 'offered', 'confirmed'])->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['clear', 'target_inactive']])->all();
        return $this->apply($own + $cover, 'teacher', $teacherId);
    }

    /** @param array<int, array{0: 'cancel'|'clear', 1: string}> $changes slot id => [mode, reason_code] */
    public function apply(array $changes, string $resourceType, int $resourceId): int
    {
        if (!$changes) return 0;
        $actor = auth()->user() ?? throw new \LogicException('a source change that invalidates cover slots needs an authenticated actor');
        ksort($changes);
        $slots = LeaveSubstitutionSlot::whereIn('id', array_keys($changes))->orderBy('id')->lockForUpdate()->get();
        $payload = ['changes' => $slots->map(fn ($s) => [(string) $s->id, (string) $s->version, $changes[$s->id][0], $changes[$s->id][1]])->all()];
        $digest = $this->receipts->payloadDigest($this->receipts->envelope('source_invalidate', ['type' => $resourceType, 'id' => (string) $resourceId],
            $this->receipts->context($actor), $payload, new \stdClass()));
        // no client request key exists for a side effect of another write: the server makes a unique one (never replayed)
        $op = $this->receipts->record($actor, 'source_invalidate', $this->receipts->keyDigest('server:' . Str::uuid()), $digest, 'invalidated', 200, $slots->count());
        foreach ($slots as $slot) {
            [$mode, $reason] = $changes[$slot->id];
            $last = LeaveSubstitutionEvent::where('leave_substitution_slot_id', $slot->id)->orderByDesc('version')->first();
            $routine = $last ? null : Routine::find($slot->routine_id);
            $status = $mode === 'cancel' ? 'cancelled' : 'unassigned';
            $slot->forceFill(['status' => $status, 'substitute_teacher_id' => null, 'version' => $slot->version + 1])->save();
            LeaveSubstitutionEvent::create(['leave_substitution_operation_id' => $op->id, 'leave_substitution_slot_id' => $slot->id, 'leave_application_id' => $slot->leave_application_id,
                'version' => $slot->version, 'result_status' => $status, 'event_type' => 'source_invalidated', 'user_id' => $actor->id, 'original_teacher_id' => $slot->original_teacher_id,
                'source_program_id' => $last?->source_program_id ?? $routine->program_id, 'source_batch_id' => $last ? $last->source_batch_id : $routine->batch_id,
                'source_subject_id' => $last?->source_subject_id ?? $routine->subject_id, 'substitute_teacher_id' => null,
                'occurrence_date' => $slot->occurrence_date->toDateString(), 'source_start_time' => $slot->source_start_time, 'source_end_time' => $slot->source_end_time,
                'source_room_no' => $slot->source_room_no, 'reason_code' => $reason, 'idempotency_key' => $this->receipts->eventKey($op, $slot->id), 'payload_sha256' => $digest]);
        }
        return $slots->count();
    }
}
