<?php

namespace App\Services\Substitution;

use App\Models\{LeaveApplication, LeaveSubstitutionEvent, LeaveSubstitutionSlot, Routine, Teacher, User};
use Illuminate\Support\Collection;

// D200 SUBL.5 (docs/API.md D199 read surfaces): what the screens need and nothing more - date, time, room, the CURRENT class /
// subject names (never presented as historical), the substitute, the latest event, and the two digests a later action must send
// back (`source` per slot, `occurrence_scope` per leave). Never the leave reason or type, contact, payroll or another teacher's
// calendar. Reads write nothing and take no lock; an action re-checks everything.
class SlotReadService
{
    public function __construct(private SlotActionService $actions, private LeaveCoverService $cover) {}

    public function forLeave(LeaveApplication $leave): array
    {
        $teacher = Teacher::where('user_id', $leave->user_id)->first();
        $slots = LeaveSubstitutionSlot::where('leave_application_id', $leave->id)->orderBy('occurrence_date')->orderBy('source_start_time')->orderBy('id')->get();
        return ['leave' => ['id' => $leave->id, 'status' => $leave->status, 'from_date' => $leave->from_date->toDateString(), 'to_date' => $leave->to_date->toDateString()],
            'occurrence_scope' => $teacher && in_array($leave->status, ['pending', 'approved'], true) ? $this->cover->scope($leave, $teacher, $this->actions->workingDates($leave)) : null,
            'slots' => $this->rows($slots, collect([$leave->id => $leave]))];
    }

    /** future slots of approved leaves that still need a decision */
    public function needing(string $from, string $to, string $status, int $page): array
    {
        $q = LeaveSubstitutionSlot::where('status', $status)->whereBetween('occurrence_date', [$from, $to])
            ->whereRaw('TIMESTAMP(occurrence_date, source_start_time) > ?', [now()->format('Y-m-d H:i:s')])
            ->whereIn('leave_application_id', LeaveApplication::where('status', 'approved')->select('id'));
        $total = (clone $q)->count();
        $slots = $q->orderBy('occurrence_date')->orderBy('source_start_time')->orderBy('id')->forPage($page, 50)->get();
        $leaves = LeaveApplication::whereIn('id', $slots->pluck('leave_application_id')->unique())->get()->keyBy('id');
        $names = User::inTenant()->whereIn('id', $leaves->pluck('user_id'))->pluck('name', 'id');
        return ['total' => $total, 'page' => $page, 'per_page' => 50,
            'slots' => array_map(fn ($r) => $r + ['applicant' => $names[$leaves[$r['leave_id']]->user_id] ?? null], $this->rows($slots, $leaves))];
    }

    /** the teacher's own offers and confirmed covers that have not started */
    public function offers(Teacher $me): array
    {
        $slots = LeaveSubstitutionSlot::where('substitute_teacher_id', $me->id)->whereIn('status', ['offered', 'confirmed'])
            ->whereRaw('TIMESTAMP(occurrence_date, source_start_time) > ?', [now()->format('Y-m-d H:i:s')])->orderBy('occurrence_date')->orderBy('source_start_time')->limit(200)->get();
        $leaves = LeaveApplication::whereIn('id', $slots->pluck('leave_application_id')->unique())->get()->keyBy('id');
        return $this->rows($slots, $leaves);
    }

    /** teachers who may cover this slot right now (advisory: the action checks again) */
    public function candidates(LeaveApplication $leave, LeaveSubstitutionSlot $slot): array
    {
        $routine = Routine::find($slot->routine_id);
        if (!$routine) return [];
        $applicant = Teacher::where('user_id', $leave->user_id)->value('id');
        return Teacher::with('user:id,name,is_active')->where('status', '!=', 'inactive')->whereNotNull('user_id')->whereNotIn('id', array_filter([$slot->original_teacher_id, $applicant]))
            ->orderBy('id')->get()->filter(fn ($t) => $t->user?->is_active && $this->cover->unavailable($t->id, $routine, $slot->occurrence_date->toDateString(), $slot->id) === null)
            ->take(100)->map(fn ($t) => ['id' => $t->id, 'name' => $t->user->name])->values()->all();
    }

    private function rows(Collection $slots, Collection $leaves): array
    {
        $slots->load(['routine.program:id,name', 'routine.batch:id,name', 'routine.subject:id,name', 'substituteTeacher.user:id,name', 'originalTeacher.user:id,name']);
        $latest = LeaveSubstitutionEvent::whereIn('leave_substitution_slot_id', $slots->pluck('id'))->orderBy('version')->get(['leave_substitution_slot_id', 'event_type', 'reason_code'])->keyBy('leave_substitution_slot_id');
        return $slots->map(fn (LeaveSubstitutionSlot $s) => ['id' => $s->id, 'leave_id' => $s->leave_application_id, 'version' => (string) $s->version, 'status' => $s->status,
            'occurrence_date' => $s->occurrence_date->toDateString(), 'source_start_time' => substr((string) $s->source_start_time, 0, 5), 'source_end_time' => substr((string) $s->source_end_time, 0, 5),
            'source_room_no' => $s->source_room_no, 'routine_id' => $s->routine_id, 'program' => $s->routine?->program?->name, 'batch' => $s->routine?->batch?->name, 'subject' => $s->routine?->subject?->name,
            'original_teacher' => $s->originalTeacher?->user?->name,
            'substitute' => $s->substituteTeacher ? ['id' => $s->substituteTeacher->id, 'name' => $s->substituteTeacher->user?->name] : null,
            'source' => $this->actions->sourceOf($leaves[$s->leave_application_id], $s),
            'latest_event' => $latest[$s->id]->event_type ?? null, 'reason_code' => $latest[$s->id]->reason_code ?? null])->values()->all();
    }
}
