<?php

namespace App\Services\Substitution;

use App\Exceptions\BusinessException;
use App\Models\{LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionOperation, LeaveSubstitutionSlot, Routine, Teacher, User};
use App\Services\ModuleGate;
use App\Services\PeriodAttendanceService;
use App\Support\Tenancy;
use Carbon\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

// D200 SUBL.3 (docs/API.md "D96/D99 leave-wide materialization and reconciliation"): a Teacher's leave owns one cover slot per
// routine period that has not started. Called by LeaveService inside its transaction, under the institution lock.
//  create  -> unassigned slots, version 1, slot_created
//  approve -> every not-started occurrence gets exactly one final event: an explicit eligible choice = offered (never confirmed);
//             a gap = unassigned (nomination_cleared from a nomination, leave_approved otherwise); a chosen Teacher who has become
//             unavailable is a gap with a reason and the leave is still approved (P3); occurrences no longer in the working dates
//             are cancelled; covers the applicant was to give on those dates go back to a gap (substitute_leave_invalidated)
//  reject / cancel -> live slots cancelled (leave_rejected / leave_cancelled); a new leave later gets new slots
// Owner (2026-11-11): the Idempotency-Key is optional on the leave routes so the existing leave screens keep working; with a key
// the D99 replay / conflict rules apply, without one the server makes a unique key and LeaveService's own retry rule stays.
class LeaveCoverService
{
    /** reviewer-visible result of the last approval: the gaps and why */
    public array $gaps = [];

    public function __construct(private OperationReceipts $receipts, private ModuleGate $modules) {}

    /** the Teacher whose leave gets cover slots, or null (module off, or a staff member's leave) */
    public function teacherOf(?int $userId): ?Teacher
    {
        if ($userId === null || !$this->modules->allows(Tenancy::current(), 'substitution')) return null;
        return Teacher::where('user_id', $userId)->first();
    }

    /** [key digest, payload digest, the earlier receipt or null] for this request */
    public function begin(User $actor, string $action, array $resource, array $payload, ?string $scope): array
    {
        $raw = request()->header('Idempotency-Key');
        $key = $this->receipts->keyDigest($raw ?? 'server:' . Str::uuid());
        $digest = $this->receipts->payloadDigest($this->receipts->envelope($action, $resource, $this->receipts->context($actor), self::strings($payload),
            $scope === null ? new \stdClass() : ['occurrence_scope' => $scope]));
        return [$key, $digest, $raw === null ? null : $this->receipts->replay($actor, $key, $digest)];
    }

    public function created(LeaveApplication $leave, Teacher $teacher, array $dates, User $actor, string $key, string $digest): void
    {
        $occ = $this->occurrences($teacher, $dates);
        $this->assertFree($occ, $leave->id);
        $op = $this->receipts->record($actor, 'leave_create', $key, $digest, 'created', 201, count($occ), $leave->id);
        foreach ($occ as [$routine, $date]) $this->open($op, $leave, $teacher, $routine, $date, 'unassigned', null, null, $actor);
    }

    /** @param array<int, array{routine_id: mixed, occurrence_date: mixed, substitute_teacher_id: mixed}>|null $choices */
    public function approved(LeaveApplication $leave, Teacher $teacher, array $dates, ?array $choices, User $actor, string $key, string $digest): void
    {
        $occ = $this->occurrences($teacher, $dates);
        $this->assertFree($occ, $leave->id);
        $targets = $this->choices($choices, $occ, $teacher);
        $live = LeaveSubstitutionSlot::where('leave_application_id', $leave->id)->where('status', '!=', 'cancelled')->orderBy('id')->lockForUpdate()->get()
            ->keyBy(fn ($s) => $s->routine_id . '|' . $s->occurrence_date->toDateString());
        $obsolete = $live->reject(fn ($s, $k) => isset($occ[$k]) || !$this->future($s->occurrence_date->toDateString(), $s->source_start_time));
        $collateral = LeaveSubstitutionSlot::where('substitute_teacher_id', $teacher->id)->where('leave_application_id', '!=', $leave->id)
            ->whereIn('status', ['nominated', 'offered', 'confirmed'])->whereIn('occurrence_date', $dates ?: ['1000-01-01'])->orderBy('id')->lockForUpdate()->get()
            ->filter(fn ($s) => $this->future($s->occurrence_date->toDateString(), $s->source_start_time));
        $op = $this->receipts->record($actor, 'leave_approve', $key, $digest, 'approved', 200, count($occ) + $obsolete->count() + $collateral->count(), $leave->id);
        $this->gaps = [];
        foreach ($occ as $k => [$routine, $date]) {
            $slot = $live->get($k);
            $target = $targets[$k] ?? null;
            $why = $target ? $this->unavailable($target, $routine, $date, $slot?->id) : null;
            if ($why) { $this->gaps[] = ['routine_id' => $routine->id, 'occurrence_date' => $date, 'reason' => $why]; $target = null; }
            if (!$slot) { $this->open($op, $leave, $teacher, $routine, $date, $target ? 'offered' : 'unassigned', $target, $why, $actor); continue; }
            if ($target) $this->move($op, $slot, 'offered', $target, 'offer_created', null, $actor);
            else $this->move($op, $slot, 'unassigned', null, $slot->status === 'nominated' ? 'nomination_cleared' : 'leave_approved', $why, $actor);
        }
        foreach ($obsolete as $slot) $this->move($op, $slot, 'cancelled', null, 'source_invalidated', 'working_dates_changed', $actor);
        foreach ($collateral as $slot) $this->move($op, $slot, 'unassigned', null, 'substitute_leave_invalidated', 'substitute_on_leave', $actor);
    }

    public function closed(LeaveApplication $leave, string $state, User $actor, string $key, string $digest): void
    {
        $live = LeaveSubstitutionSlot::where('leave_application_id', $leave->id)->where('status', '!=', 'cancelled')->orderBy('id')->lockForUpdate()->get();
        $op = $this->receipts->record($actor, $state === 'rejected' ? 'leave_reject' : 'leave_cancel', $key, $digest, $state, 200, $live->count(), $leave->id);
        foreach ($live as $slot) $this->move($op, $slot, 'cancelled', null, $state === 'rejected' ? 'leave_rejected' : 'leave_cancelled', null, $actor);
    }

    /** API.md `occurrence_scope`: one digest over the leave, its working dates, the source occurrences, its slots and the covers it would invalidate */
    public function scope(LeaveApplication $leave, Teacher $teacher, array $dates): string
    {
        sort($dates);
        $head = $this->leaveFields($leave, $dates);
        $occ = $this->occurrences($teacher, $dates);
        $tuple = fn ($s) => [(string) $s->id, (string) $s->version, $this->source($head, $s)];
        return CanonicalJson::sha256(['format' => 'leave-substitution-scope-v1', 'leave' => array_diff_key($head, ['working_dates' => 1]), 'working_dates' => $dates,
            'sources' => array_values(array_map(fn ($o) => $this->routineFields($o[0]) + ['occurrence_date' => $o[1]], $occ)),
            'slots' => LeaveSubstitutionSlot::where('leave_application_id', $leave->id)->orderBy('id')->get()->map($tuple)->all(),
            'affected_covers' => LeaveSubstitutionSlot::where('substitute_teacher_id', $teacher->id)->where('leave_application_id', '!=', $leave->id)
                ->whereIn('status', ['nominated', 'offered', 'confirmed'])->whereIn('occurrence_date', $dates ?: ['1000-01-01'])->orderBy('id')->get()->map($tuple)->all()]);
    }

    /** API.md source digest of one slot (a state fingerprint, not a revision number) */
    public function source(array $leaveHead, LeaveSubstitutionSlot $s): string
    {
        $r = Routine::find($s->routine_id);
        return CanonicalJson::sha256(['format' => 'leave-substitution-source-v1', 'leave' => $leaveHead, 'routine' => $r ? $this->routineFields($r) : null,
            'occurrence' => ['id' => (string) $s->id, 'routine_id' => (string) $s->routine_id, 'original_teacher_id' => (string) $s->original_teacher_id,
                'occurrence_date' => $s->occurrence_date->toDateString(), 'source_start_time' => self::hms($s->source_start_time), 'source_end_time' => self::hms($s->source_end_time),
                'source_room_no' => $s->source_room_no]]);
    }

    public function leaveFields(LeaveApplication $l, array $dates): array
    {
        sort($dates);
        return ['id' => (string) $l->id, 'user_id' => $l->user_id === null ? null : (string) $l->user_id, 'staff_id' => $l->staff_id === null ? null : (string) $l->staff_id,
            'status' => $l->status, 'from_date' => $l->from_date->toDateString(), 'to_date' => $l->to_date->toDateString(), 'working_dates' => array_values($dates)];
    }

    /** null = may cover this period; otherwise why not (never another person's details) */
    public function unavailable(int $teacherId, Routine $r, string $date, ?int $exceptSlotId = null): ?string
    {
        $t = Teacher::with('user:id,is_active')->find($teacherId);
        if (!$t || $t->status === 'inactive' || !$t->user?->is_active) return 'target_inactive';
        if ($t->id === (int) $r->teacher_id) return 'target_is_original';
        $overlap = fn ($q, string $a, string $b) => $q->where($a, '<', $r->end_time)->where($b, '>', $r->start_time);
        if ($overlap(Routine::where('teacher_id', $t->id)->where('day_of_week', $r->day_of_week), 'start_time', 'end_time')->exists()) return 'target_busy';
        if (LeaveApplication::where('user_id', $t->user_id)->whereIn('status', ['pending', 'approved'])->whereDate('from_date', '<=', $date)->whereDate('to_date', '>=', $date)->exists()) return 'target_on_leave';
        if ($overlap(LeaveSubstitutionSlot::where('substitute_teacher_id', $t->id)->whereIn('status', ['offered', 'confirmed'])->whereDate('occurrence_date', $date)
            ->when($exceptSlotId, fn ($q) => $q->whereKeyNot($exceptSlotId)), 'source_start_time', 'source_end_time')->exists()) return 'target_busy';
        return null;
    }

    /** "routine|date" => [Routine, date] for the Teacher's periods on these dates that have not started (never past periods) */
    public function occurrences(Teacher $teacher, array $dates): array
    {
        $byDay = Routine::where('teacher_id', $teacher->id)->orderBy('id')->get()->groupBy('day_of_week');
        $out = [];
        foreach ($dates as $date) {
            foreach ($byDay->get(PeriodAttendanceService::DAY[Carbon::parse($date)->dayOfWeek] ?? '-', []) as $r) {
                if ($this->future($date, $r->start_time)) $out[$r->id . '|' . $date] = [$r, $date];
            }
        }
        ksort($out, SORT_NATURAL);
        return $out;
    }

    private function future(string $date, string $start): bool
    {
        return Carbon::parse($date . ' ' . $start)->greaterThan(now());
    }

    /** another leave's live slot already claims the same period: refused (the per-leave unique key does not see it) */
    private function assertFree(array $occ, int $leaveId): void
    {
        foreach ($occ as [$r, $date]) {
            if (LeaveSubstitutionSlot::where('routine_id', $r->id)->whereDate('occurrence_date', $date)->where('status', '!=', 'cancelled')->where('leave_application_id', '!=', $leaveId)->exists()) {
                throw new BusinessException('occurrence taken', 'substitution_state_conflict', 409);
            }
        }
    }

    /** validated explicit choices: key => teacher id or null; absent = every occurrence stays a gap */
    private function choices(?array $choices, array $occ, Teacher $applicant): array
    {
        if ($choices === null) return [];
        $out = [];
        foreach ($choices as $c) {
            $k = (int) ($c['routine_id'] ?? 0) . '|' . ($c['occurrence_date'] ?? '');
            if (!isset($occ[$k]) || array_key_exists($k, $out)) throw ValidationException::withMessages(['cover_choices' => __('hr.invalid')]);
            $id = $c['substitute_teacher_id'] ?? null;
            if ($id !== null && !Teacher::whereKey((int) $id)->exists()) throw ValidationException::withMessages(['cover_choices' => __('hr.invalid')]);
            $out[$k] = $id === null ? null : (int) $id;
        }
        if (count($out) !== count($occ)) throw ValidationException::withMessages(['cover_choices' => __('hr.invalid')]);
        return $out;
    }

    private function open(LeaveSubstitutionOperation $op, LeaveApplication $leave, Teacher $teacher, Routine $r, string $date, string $status, ?int $target, ?string $reason, User $actor): void
    {
        $slot = LeaveSubstitutionSlot::create(['leave_application_id' => $leave->id, 'routine_id' => $r->id, 'original_teacher_id' => $teacher->id, 'occurrence_date' => $date,
            'source_start_time' => $r->start_time, 'source_end_time' => $r->end_time, 'source_room_no' => $r->room_no, 'substitute_teacher_id' => $target, 'status' => $status, 'version' => 1]);
        $this->event($op, $slot, 'slot_created', $reason, $actor, [$r->program_id, $r->batch_id, $r->subject_id]);
    }

    private function move(LeaveSubstitutionOperation $op, LeaveSubstitutionSlot $slot, string $status, ?int $target, string $type, ?string $reason, User $actor): void
    {
        $slot->forceFill(['status' => $status, 'substitute_teacher_id' => $target, 'version' => $slot->version + 1])->save();
        $this->event($op, $slot, $type, $reason, $actor, null);
    }

    private function event(LeaveSubstitutionOperation $op, LeaveSubstitutionSlot $slot, string $type, ?string $reason, User $actor, ?array $src): void
    {
        if (!$src) {
            $last = LeaveSubstitutionEvent::where('leave_substitution_slot_id', $slot->id)->orderByDesc('version')->first();
            $src = [$last->source_program_id, $last->source_batch_id, $last->source_subject_id];
        }
        LeaveSubstitutionEvent::create(['leave_substitution_operation_id' => $op->id, 'leave_substitution_slot_id' => $slot->id, 'leave_application_id' => $slot->leave_application_id,
            'version' => $slot->version, 'result_status' => $slot->status, 'event_type' => $type, 'user_id' => $actor->id, 'original_teacher_id' => $slot->original_teacher_id,
            'source_program_id' => $src[0], 'source_batch_id' => $src[1], 'source_subject_id' => $src[2], 'substitute_teacher_id' => $slot->substitute_teacher_id,
            'occurrence_date' => Carbon::parse($slot->occurrence_date)->toDateString(), 'source_start_time' => $slot->source_start_time, 'source_end_time' => $slot->source_end_time,
            'source_room_no' => $slot->source_room_no, 'reason_code' => $reason, 'idempotency_key' => $this->receipts->eventKey($op, $slot->id), 'payload_sha256' => $op->payload_sha256]);
    }

    private function routineFields(Routine $r): array
    {
        return ['id' => (string) $r->id, 'program_id' => (string) $r->program_id, 'batch_id' => $r->batch_id === null ? null : (string) $r->batch_id, 'subject_id' => (string) $r->subject_id,
            'teacher_id' => (string) $r->teacher_id, 'day_of_week' => $r->day_of_week, 'start_time' => self::hms($r->start_time), 'end_time' => self::hms($r->end_time), 'room_no' => $r->room_no];
    }

    private static function hms(string $t): string { return strlen($t) === 5 ? $t . ':00' : $t; }

    /** ids and numbers become decimal strings; booleans and null stay */
    private static function strings(mixed $v): mixed
    {
        if (is_array($v)) return array_map(self::strings(...), $v);
        return is_int($v) || is_float($v) ? (string) $v : $v;
    }
}
