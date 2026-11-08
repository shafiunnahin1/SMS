<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Attendance, BatchTeacher, Enrollment, ExamSubject, Student, StudentLeaveRequest, Teacher, User};
use App\Notifications\GeneralNotification;
use App\Support\{StudentFiles, Tenancy};
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// D197 AAD.3 (academics-advanced.md section 5): requests, who decides (class / batch teacher up to max_days_auto, the admin always),
// the exam-date warning, the "correct these absences?" suggestion (never automatic) and the notifications.
class StudentLeaveService
{
    public function __construct(private NotificationService $notify, private InstitutionSettings $settings) {}

    public function create(Student $student, array $data, ?UploadedFile $file, User $by, string $method = 'portal'): StudentLeaveRequest
    {
        $from = Carbon::parse($data['from_date']); $to = Carbon::parse($data['to_date']);
        $overlap = StudentLeaveRequest::where('student_id', $student->id)->whereIn('status', ['pending', 'approved'])
            ->whereDate('from_date', '<=', $to->toDateString())->whereDate('to_date', '>=', $from->toDateString())->exists();
        if ($overlap) throw new BusinessException('overlap', 'leave_overlap', 422);
        $path = $file ? $file->storeAs(StudentFiles::dir($student) . '/leave', 'leave-' . Str::uuid() . '.' . $file->extension(), 'private') : null;
        $leave = StudentLeaveRequest::create(['student_id' => $student->id, 'from_date' => $from->toDateString(), 'to_date' => $to->toDateString(),
            'total_days' => $from->diffInDays($to) + 1, 'reason' => $data['reason'] ?? null, 'attachment' => $path, 'method' => $method,
            'status' => 'pending', 'requested_by' => $by->id]);
        $name = $student->user?->name ?? $student->student_id;
        foreach ($this->deciders($student) as $u) {
            $u->notify(new GeneralNotification(__('leave.requested_title'), __('leave.requested', ['name' => $name, 'days' => $leave->total_days]), 'student_leave', ['leave_id' => $leave->id]));
        }
        return $leave;
    }

    /** the exams of the student's program whose dates fall in the leave */
    public function examClash(StudentLeaveRequest $l): array
    {
        $program = Enrollment::where('student_id', $l->student_id)->where('status', 'active')->value('program_id');
        if (!$program) return [];
        return ExamSubject::with('exam:id,name', 'subject:id,name')->whereHas('exam', fn ($q) => $q->where('program_id', $program))
            ->whereBetween('exam_date', [$l->from_date->toDateString(), $l->to_date->toDateString()])->get()
            ->map(fn ($e) => ['exam' => $e->exam?->name, 'subject' => $e->subject?->name, 'date' => Carbon::parse($e->exam_date)->toDateString()])->values()->all();
    }

    /** may this staff user decide this request? */
    public function canDecide(User $u, StudentLeaveRequest $l): bool
    {
        if ($u->role === 'admin') return true;
        if ($u->role !== 'teacher' || $l->total_days > $this->settings->studentLeave(Tenancy::current())['max_days_auto']) return false;
        return in_array($l->student_id, $this->teacherStudentIds($u), true);
    }

    /** null for the admin (every student) */
    public function visibleStudentIds(User $u): ?array
    {
        return $u->role === 'admin' ? null : $this->teacherStudentIds($u);
    }

    public function decide(StudentLeaveRequest $l, string $status, ?string $note, User $by): array
    {
        if ($l->status !== 'pending' && !($l->status === 'approved' && $status === 'cancelled')) throw new BusinessException('decided', 'leave_decided', 422);
        $l->update(['status' => $status, 'decision_note' => $note, 'decided_by' => $by->id, 'decided_at' => now()]);
        $student = Student::with(['user:id,name', 'parents'])->find($l->student_id);
        $parent = $student->parents->firstWhere('pivot.is_primary', true) ?? $student->parents->first();
        if ($parent && in_array($status, ['approved', 'rejected'], true)) {
            $loc = app(SmsService::class)->localeFor($parent, Tenancy::current());
            $p = ['name' => $student->user?->name ?? $student->student_id, 'from' => $l->from_date->format('d/m/Y'), 'to' => $l->to_date->format('d/m/Y')];
            $this->notify->notify($parent, 'student_leave', __('leave.decided_title', [], $loc), __("leave.{$status}", $p, $loc), ['leave_id' => $l->id]);
        }
        // already-taken attendance marked absent on approved dates: offered for correction, never changed here
        $absent = $status === 'approved' ? Attendance::where('student_id', $l->student_id)->where('status', 'absent')
            ->whereBetween('date', [$l->from_date->toDateString(), $l->to_date->toDateString()])->get(['id', 'date'])
            ->map(fn ($a) => ['attendance_id' => $a->id, 'date' => Carbon::parse($a->date)->toDateString()])->values()->all() : [];
        return ['leave' => $l->fresh(), 'absent_to_correct' => $absent];
    }

    public function attachmentUrl(StudentLeaveRequest $l): ?string
    {
        return $l->attachment ? Storage::disk('private')->temporaryUrl($l->attachment, now()->addMinutes(10)) : null;
    }

    /** @return User[] the batch / class teachers of the student's batch (if they may decide) and the admins */
    private function deciders(Student $s): array
    {
        $batch = Enrollment::where('student_id', $s->id)->where('status', 'active')->with('batch:id,teacher_id')->first()?->batch;
        $teacherIds = $batch ? array_filter(array_merge([$batch->teacher_id], BatchTeacher::where('batch_id', $batch->id)->pluck('teacher_id')->all())) : [];
        $users = Teacher::whereIn('id', $teacherIds)->whereNotNull('user_id')->pluck('user_id')->all();
        return User::inTenant()->where('is_active', true)->where(fn ($q) => $q->where('role', 'admin')->orWhereIn('id', $users))->get()->all();
    }

    private function teacherStudentIds(User $u): array
    {
        $t = Teacher::where('user_id', $u->id)->value('id');
        if (!$t) return [];
        $batches = \App\Models\Batch::where('teacher_id', $t)->pluck('id')->merge(BatchTeacher::where('teacher_id', $t)->pluck('batch_id'))->unique();
        return Enrollment::whereIn('batch_id', $batches)->where('status', 'active')->pluck('student_id')->map(fn ($v) => (int) $v)->unique()->values()->all();
    }
}
