<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Attendance, Enrollment, PeriodAttendance, Routine, StudentLeaveRequest, Teacher, User};
use App\Support\{Tenancy, TenantBulk};
use Carbon\Carbon;

// D197 AAD.4 (academics-advanced.md section 3): a teacher's periods of the day (from the routine), the class list of a period
// (active enrollments of its batch, or of the whole program), saving it, and - only when settings.attendance.daily_from_periods
// is on - the daily status derived from the periods (taken_by NULL, note 'derived'; a hand-taken daily row always wins).
// No absent SMS from periods (a flood of messages); the daily sheet's own rule stays the only SMS path.
class PeriodAttendanceService
{
    public const DAY = [6 => 'sat', 0 => 'sun', 1 => 'mon', 2 => 'tue', 3 => 'wed', 4 => 'thu'];

    public function settings(): array
    {
        $a = (Tenancy::current()->settings ?? [])['attendance'] ?? [];
        $rule = $a['daily_rule'] ?? 'first_period';
        return ['daily_from_periods' => (bool) ($a['daily_from_periods'] ?? false), 'daily_rule' => in_array($rule, ['first_period', 'majority', 'any'], true) ? $rule : 'first_period'];
    }

    /** the teacher's routine periods on $date, each with its class list and the saved status */
    public function today(User $u, string $date): array
    {
        $teacher = Teacher::where('user_id', $u->id)->value('id');
        $day = self::DAY[Carbon::parse($date)->dayOfWeek] ?? null;
        if (!$teacher || !$day) return [];
        $row = fn (Routine $r, ?string $coverFor = null) => ['routine_id' => $r->id, 'start_time' => substr((string) $r->start_time, 0, 5), 'end_time' => substr((string) $r->end_time, 0, 5),
            'subject' => $r->subject?->name, 'batch' => $r->batch?->name, 'program' => $r->program?->name, 'room_no' => $r->room_no,
            'cover' => $coverFor !== null, 'original_teacher' => $coverFor, 'students' => $this->roster($r, $date)];
        $own = Routine::with(['subject:id,name', 'batch:id,name', 'program:id,name'])->where('teacher_id', $teacher)->where('day_of_week', $day)->get()->map(fn (Routine $r) => $row($r));
        // D200 SUBL.5: periods this teacher covers today (a confirmed slot) are theirs for the day, marked `cover`
        $covers = \App\Models\LeaveSubstitutionSlot::with(['routine.subject:id,name', 'routine.batch:id,name', 'routine.program:id,name', 'originalTeacher.user:id,name'])
            ->where('substitute_teacher_id', $teacher)->where('status', 'confirmed')->whereDate('occurrence_date', $date)->get()
            ->filter(fn ($s) => $s->routine !== null)->map(fn ($s) => $row($s->routine, (string) $s->originalTeacher?->user?->name));
        return $own->concat($covers)->sortBy('start_time')->values()->all();
    }

    public function roster(Routine $r, string $date): array
    {
        $enr = Enrollment::with('student.user:id,name')->where('status', 'active')->where('program_id', $r->program_id)
            ->when($r->batch_id, fn ($q) => $q->where('batch_id', $r->batch_id))->orderBy('roll_no')->orderBy('id')->get();
        $ids = $enr->pluck('student_id')->all();
        $saved = PeriodAttendance::where('routine_id', $r->id)->whereDate('date', $date)->pluck('status', 'student_id');
        $leave = StudentLeaveRequest::onLeave($ids, $date);
        return $enr->map(fn ($e) => ['student_id' => $e->student_id, 'name' => $e->student?->user?->name, 'roll_no' => $e->roll_no,
            'status' => $saved[$e->student_id] ?? (isset($leave[$e->student_id]) ? 'leave' : null), 'on_leave' => isset($leave[$e->student_id])])->values()->all();
    }

    /** the admin, the routine's own teacher, or (D200 SUBL.5) the teacher who holds the CONFIRMED cover of that period on that date - only then, only that date */
    public function canTake(User $u, Routine $r, ?string $date = null): bool
    {
        if ($u->role === 'admin') return true;
        if ($u->role !== 'teacher' || !($teacher = Teacher::where('user_id', $u->id)->value('id'))) return false;
        if ((int) $teacher === (int) $r->teacher_id) return true;
        return $date !== null && \App\Models\LeaveSubstitutionSlot::where('routine_id', $r->id)->where('substitute_teacher_id', $teacher)->where('status', 'confirmed')->whereDate('occurrence_date', $date)->exists();
    }

    /** $data = { routine_id, date, records: [{student_id, status, note?}] } */
    public function save(Routine $r, array $data, User $by): array
    {
        $date = $data['date'];
        if ((self::DAY[Carbon::parse($date)->dayOfWeek] ?? null) !== $r->day_of_week) throw new BusinessException('day', 'period_wrong_day', 422);
        $enrolled = collect($this->roster($r, $date))->pluck('student_id')->flip();
        $t = Tenancy::current()->id;
        $rows = [];
        foreach ($data['records'] as $x) {
            if (!$enrolled->has($x['student_id'])) throw new BusinessException('not enrolled', 'not_enrolled', 422, ['student' => $x['student_id'], 'batch' => term('batch')]);
            $rows[] = ['institution_id' => $t, 'student_id' => $x['student_id'], 'routine_id' => $r->id, 'date' => $date, 'status' => $x['status'], 'taken_by' => $by->id, 'note' => $x['note'] ?? null];
        }
        $derived = 0;
        app(\App\Services\Substitution\InstitutionLock::class)->run(function () use ($rows, $date, &$derived) {   // D200 SUBL.2: institution lock first
            TenantBulk::upsert(PeriodAttendance::class, $rows, ['student_id', 'routine_id', 'date'], ['status', 'taken_by', 'note']);
            if ($this->settings()['daily_from_periods']) $derived = $this->deriveDaily(array_column($rows, 'student_id'), $date);
        });
        return ['saved' => count($rows), 'derived' => $derived];
    }

    /** the daily attendance of these students on $date from all their periods that day; rows taken by hand are never touched */
    public function deriveDaily(array $studentIds, string $date): int
    {
        $rule = $this->settings()['daily_rule'];
        $periods = PeriodAttendance::query()->join('routines', 'routines.id', '=', 'period_attendances.routine_id')
            ->where('routines.institution_id', Tenancy::current()->id)
            ->whereIn('period_attendances.student_id', $studentIds)->whereDate('period_attendances.date', $date)
            ->orderBy('routines.start_time')->get(['period_attendances.student_id', 'period_attendances.status'])->groupBy('student_id');
        $enr = Enrollment::where('status', 'active')->whereIn('student_id', $studentIds)->get(['student_id', 'batch_id', 'program_id'])->keyBy('student_id');
        $manual = Attendance::whereIn('student_id', $studentIds)->whereDate('date', $date)
            ->where(fn ($q) => $q->whereNotNull('taken_by')->orWhere('note', '!=', 'derived')->orWhereNull('note'))->pluck('student_id')->flip();
        $t = Tenancy::current()->id;
        $rows = [];
        foreach ($periods as $sid => $list) {
            if ($manual->has($sid) || !($e = $enr->get($sid))) continue;
            $st = $list->pluck('status')->all();
            $here = count(array_filter($st, fn ($s) => in_array($s, ['present', 'late'], true)));
            $status = match (true) {
                count(array_filter($st, fn ($s) => $s === 'leave')) === count($st) => 'leave',
                $rule === 'first_period' => $st[0] === 'leave' ? ($here ? 'present' : 'absent') : $st[0],
                $rule === 'majority' => $here * 2 > count($st) ? 'present' : 'absent',
                default => $here > 0 ? 'present' : 'absent',
            };
            $rows[] = ['institution_id' => $t, 'student_id' => $sid, 'batch_id' => $e->batch_id, 'program_id' => $e->program_id, 'date' => $date,
                'status' => $status, 'taken_by' => null, 'note' => 'derived', 'created_at' => now()];
        }
        if ($rows) TenantBulk::upsert(Attendance::class, $rows, ['institution_id', 'student_id', 'batch_id', 'date'], ['program_id', 'status', 'taken_by', 'note']);
        return count($rows);
    }

    /** per student: periods of the subject (in the batch) in the month, present (present + late), percentage */
    public function report(int $batchId, int $subjectId, string $month): array
    {
        $from = Carbon::parse($month . '-01')->startOfMonth()->toDateString(); $to = Carbon::parse($from)->endOfMonth()->toDateString();
        $batch = \App\Models\Batch::findOrFail($batchId);
        $routineIds = Routine::where('subject_id', $subjectId)->where('program_id', $batch->program_id)
            ->where(fn ($q) => $q->where('batch_id', $batchId)->orWhereNull('batch_id'))->pluck('id');
        $counts = PeriodAttendance::whereIn('routine_id', $routineIds)->whereBetween('date', [$from, $to])->get(['student_id', 'status'])->groupBy('student_id');
        return Enrollment::with('student.user:id,name')->where('batch_id', $batchId)->where('status', 'active')->orderBy('roll_no')->get()->map(function ($e) use ($counts) {
            $c = $counts->get($e->student_id, collect());
            $total = $c->where('status', '!=', 'leave')->count();
            $here = $c->whereIn('status', ['present', 'late'])->count();
            return ['student_id' => $e->student_id, 'name' => $e->student?->user?->name, 'roll_no' => $e->roll_no, 'periods' => $c->count(), 'present' => $here,
                'absent' => $c->where('status', 'absent')->count(), 'leave' => $c->where('status', 'leave')->count(), 'percentage' => $total ? round($here * 100 / $total, 1) : null];
        })->values()->all();
    }
}
