<?php

namespace App\Services\Substitution;

use App\Exceptions\BusinessException;
use App\Models\{LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionSlot, Routine, Teacher, User};
use App\Services\Hr\{HrCalendar, LeaveService};
use App\Services\PeriodAttendanceService;
use Carbon\Carbon;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;

// D200 SUBL.4 (docs/API.md "D96 dated slot actions" and "source refresh boundary"; AUTHORIZATION.md D199): the six actions on an
// existing slot plus refresh_source. Order inside the institution lock: find leave -> slot (404), who may act (403), replay by
// Idempotency-Key, then stale version / source (409 substitution_version_conflict), period started, state, availability; a
// change is exactly one version, one event, one receipt and its notices. The applicant nominates on their own pending leave;
// the admin (never the applicant) offers, clears and refreshes on an approved leave; only the current target accepts or declines.
class SlotActionService
{
    public const ACTIONS = ['nominate', 'clear_nomination', 'offer', 'clear_offer', 'accept', 'decline', 'refresh_source'];

    public function __construct(private InstitutionLock $lock, private OperationReceipts $receipts, private LeaveCoverService $cover,
        private SubstitutionNotifier $notifier, private LeaveService $leaves, private HrCalendar $calendar) {}

    /** @param array{expected_versions: array{slot: string, source: string}, substitute_teacher_id?: string, reason?: ?string} $in */
    public function act(string $action, int $leaveId, int $slotId, array $in, User $actor, ?string $rawKey, ?int $departmentId = null): array
    {
        $key = $this->receipts->keyDigest($rawKey);                                   // mandatory here (422 without it)
        return $this->lock->run(function () use ($action, $leaveId, $slotId, $in, $actor, $key, $departmentId) {
            $leave = LeaveApplication::findOrFail($leaveId);
            $me = Teacher::where('user_id', $actor->id)->first();
            $applicant = $leave->user_id !== null && (int) $leave->user_id === (int) $actor->id;
            if (in_array($action, ['nominate', 'clear_nomination'], true) && $actor->role === 'teacher' && !$applicant) abort(404);   // another teacher's leave is not visible
            $slot = LeaveSubstitutionSlot::where('leave_application_id', $leave->id)->whereKey($slotId)->lockForUpdate()->firstOrFail();
            $may = match ($action) {
                'nominate', 'clear_nomination' => $applicant && $me !== null,
                // the admin, or (D201 SUBM.3) department staff whose exact duty key the middleware has just checked; never the applicant
                'offer', 'clear_offer', 'refresh_source' => ($actor->role === 'admin' || ($actor->role === 'institution_staff' && $departmentId !== null)) && !$applicant,
                'accept', 'decline' => $me !== null && (int) $slot->substitute_teacher_id === $me->id,
            };
            if (!$may) throw new AuthorizationException();

            $reason = isset($in['reason']) && trim((string) $in['reason']) !== '' ? trim((string) $in['reason']) : null;
            $target = isset($in['substitute_teacher_id']) ? (int) $in['substitute_teacher_id'] : null;
            $payload = array_filter(['substitute_teacher_id' => $target === null ? null : (string) $target], fn ($v) => $v !== null) + ['reason' => $reason];
            $digest = $this->receipts->payloadDigest($this->receipts->envelope($action, ['type' => 'leave_substitution_slot', 'leave_id' => (string) $leave->id, 'id' => (string) $slot->id],
                $this->receipts->context($actor, $departmentId), $payload, ['slot' => (string) $in['expected_versions']['slot'], 'source' => (string) $in['expected_versions']['source']]));
            if ($prior = $this->receipts->replay($actor, $key, $digest)) return $this->receipts->manifest($prior);

            if ((string) $slot->version !== (string) $in['expected_versions']['slot'] || !hash_equals($this->sourceOf($leave, $slot), (string) $in['expected_versions']['source'])) {
                throw new BusinessException('stale', 'substitution_version_conflict', 409);
            }
            $date = $slot->occurrence_date->toDateString();
            if (!Carbon::parse($date . ' ' . $slot->source_start_time)->greaterThan(now())) throw new BusinessException('started', 'substitution_period_started', 409);
            $routine = Routine::find($slot->routine_id);
            $state = fn () => throw new BusinessException('state', 'substitution_state_conflict', 409);
            $need = fn (string $leaveStatus, array $slotStatuses) => ($leave->status === $leaveStatus && in_array($slot->status, $slotStatuses, true)) || $state();
            $free = function (?int $target) use ($routine, $date, $slot, $action) {
                if (!$target || !Teacher::whereKey($target)->exists()) throw ValidationException::withMessages(['substitute_teacher_id' => __('hr.invalid')]);
                if (!$routine || $this->cover->unavailable($target, $routine, $date, $slot->id, $action !== 'accept')) throw new BusinessException('unavailable', 'substitution_unavailable', 409);
            };
            $needReason = fn () => $reason !== null || throw ValidationException::withMessages(['reason' => __('hr.invalid')]);

            // [new status, new target, event type] or null = nothing changes (a zero-event receipt)
            $change = null;
            $same = $target !== null && (int) $slot->substitute_teacher_id === $target;
            switch ($action) {
                case 'nominate':
                    $need('pending', ['unassigned', 'nominated']);
                    if (!($slot->status === 'nominated' && $same)) { $free($target); $change = ['nominated', $target, 'nomination_set']; }
                    break;
                case 'clear_nomination':
                    $need('pending', ['unassigned', 'nominated']);
                    if ($slot->status === 'nominated') $change = ['unassigned', null, 'nomination_cleared'];
                    break;
                case 'offer':
                    $need('approved', ['unassigned', 'offered', 'confirmed']);
                    if (!($slot->status === 'offered' && $same)) {
                        if ($slot->status === 'confirmed') $needReason();
                        $free($target);
                        $change = ['offered', $target, $slot->status === 'confirmed' ? 'cover_replaced' : 'offer_created'];
                    }
                    break;
                case 'clear_offer':
                    $need('approved', ['unassigned', 'offered', 'confirmed']);
                    if ($slot->status !== 'unassigned') {
                        if ($slot->status === 'confirmed') $needReason();
                        $change = ['unassigned', null, 'cover_cleared'];
                    }
                    break;
                case 'accept':
                    $need('approved', ['offered']);
                    $target = (int) $slot->substitute_teacher_id;
                    $free($target);
                    $change = ['confirmed', $target, 'offer_accepted'];
                    break;
                case 'decline':
                    $need('approved', ['offered']);
                    $change = ['unassigned', null, 'offer_declined'];
                    break;
                case 'refresh_source':
                    $this->refreshable($leave, $slot, $routine, $date, $needReason);
                    $change = ['unassigned', null, 'source_refreshed'];
                    break;
            }

            $op = $this->receipts->record($actor, $action, $key, $digest, $change ? 'applied' : 'unchanged', 200, $change ? 1 : 0, $leave->id, $departmentId);
            if ($change) {
                [$status, $newTarget, $type] = $change;
                $last = LeaveSubstitutionEvent::where('leave_substitution_slot_id', $slot->id)->orderByDesc('version')->first();
                $was = $slot->substitute_teacher_id;
                $fresh = $type === 'source_refreshed' ? ['source_start_time' => $routine->start_time, 'source_end_time' => $routine->end_time, 'source_room_no' => $routine->room_no] : [];
                $slot->forceFill($fresh + ['status' => $status, 'substitute_teacher_id' => $newTarget, 'version' => $slot->version + 1])->save();
                $src = $type === 'source_refreshed' ? [$routine->program_id, $routine->batch_id, $routine->subject_id] : [$last->source_program_id, $last->source_batch_id, $last->source_subject_id];
                $event = LeaveSubstitutionEvent::create(['leave_substitution_operation_id' => $op->id, 'leave_substitution_slot_id' => $slot->id, 'leave_application_id' => $leave->id,
                    'version' => $slot->version, 'result_status' => $status, 'event_type' => $type, 'user_id' => $actor->id, 'original_teacher_id' => $slot->original_teacher_id,
                    'source_program_id' => $src[0], 'source_batch_id' => $src[1], 'source_subject_id' => $src[2], 'substitute_teacher_id' => $newTarget, 'department_id' => $departmentId, 'occurrence_date' => $date,
                    'source_start_time' => $slot->source_start_time, 'source_end_time' => $slot->source_end_time, 'source_room_no' => $slot->source_room_no, 'reason_note' => $reason,
                    'idempotency_key' => $this->receipts->eventKey($op, $slot->id), 'payload_sha256' => $digest]);
                $this->notifier->notify($event, $was ? (int) $was : null);
            }
            return $this->receipts->manifest($op);
        });
    }

    /** the server's source digest of a slot (what `expected_versions.source` must equal) */
    public function sourceOf(LeaveApplication $leave, LeaveSubstitutionSlot $slot): string
    {
        return $this->cover->source($this->cover->leaveFields($leave, $this->workingDates($leave)), $slot);
    }

    public function workingDates(LeaveApplication $leave): array
    {
        return $leave->status === 'approved' ? $this->leaves->snapshot($leave)['dates'] : $this->calendar->dates($leave->from_date->toDateString(), $leave->to_date->toDateString());
    }

    /** a slot cancelled by a source change, whose routine period is again a valid, not-started period of the same teacher on that weekday */
    private function refreshable(LeaveApplication $leave, LeaveSubstitutionSlot $slot, ?Routine $routine, string $date, \Closure $needReason): bool
    {
        $needReason();
        $state = fn () => throw new BusinessException('state', 'substitution_state_conflict', 409);
        $last = LeaveSubstitutionEvent::where('leave_substitution_slot_id', $slot->id)->orderByDesc('version')->first();
        if (!in_array($leave->status, ['pending', 'approved'], true) || $slot->status !== 'cancelled' || $last?->event_type !== 'source_invalidated') $state();
        if (!in_array($date, $this->workingDates($leave), true)) $state();
        $original = Teacher::with('user:id,is_active')->find($slot->original_teacher_id);
        if (!$routine || (int) $routine->teacher_id !== (int) $slot->original_teacher_id || !$original || $original->status === 'inactive' || !$original->user?->is_active
            || $routine->day_of_week !== (PeriodAttendanceService::DAY[Carbon::parse($date)->dayOfWeek] ?? null)) $state();
        if (!Carbon::parse($date . ' ' . $routine->start_time)->greaterThan(now())) throw new BusinessException('started', 'substitution_period_started', 409);
        if (LeaveSubstitutionSlot::where('routine_id', $routine->id)->whereDate('occurrence_date', $date)->where('status', '!=', 'cancelled')->whereKeyNot($slot->id)->exists()) $state();
        return true;
    }
}
