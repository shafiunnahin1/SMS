<?php

namespace App\Http\Controllers\Meeting;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, BatchTeacher, ParentMeeting, Student, Teacher, User};
use App\Notifications\GeneralNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

// D235 MTG.1 (extended-features.md section 14): meetings between a teacher and a student's parents. The school side (admin, a teacher
// for their own meetings and students, staff with staff.meeting.read / manage) requests, re-times, cancels and completes; the parent
// requests one with a teacher of their child, confirms, asks for another time with a note, or cancels. In-app notices only (no SMS).
class ParentMeetingController extends Controller
{
    // ---- the school side ----

    /** GET /meetings?when=upcoming|past */
    public function index(Request $request)
    {
        $f = $request->validate(['when' => 'nullable|in:upcoming,past']);
        $teacher = $this->teacherOf($request->user());
        $q = ParentMeeting::with(['student.user:id,name', 'teacher.user:id,name'])->when($teacher, fn ($q) => $q->where('teacher_id', $teacher->id));
        $q = ($f['when'] ?? 'upcoming') === 'past'
            ? $q->where(fn ($w) => $w->whereIn('status', ['completed', 'cancelled'])->orWhere('proposed_date', '<', now()->toDateString()))->orderByDesc('proposed_date')
            : $q->whereIn('status', ['pending', 'confirmed'])->where('proposed_date', '>=', now()->toDateString())->orderBy('proposed_date')->orderBy('proposed_time');
        return response()->json(['success' => true, 'data' => $q->limit(300)->get()->map(fn ($m) => self::row($m))->values()]);
    }

    /** POST /meetings {student_id | student_code, teacher_id (admin / staff), subject, proposed_date, proposed_time, location?, notes?} */
    public function store(Request $request)
    {
        $f = $request->validate(['student_id' => 'required_without:student_code|integer', 'student_code' => 'required_without:student_id|string|max:50', 'teacher_id' => 'nullable|integer'] + $this->fields(true));
        $student = isset($f['student_id']) ? Student::findOrFail($f['student_id']) : Student::where('student_id', trim($f['student_code']))->first();
        if (!$student) throw ValidationException::withMessages(['student_code' => __('meeting.no_student')]);
        $teacher = $this->teacherOf($request->user());
        if ($teacher) {
            if (!$this->teaches($teacher, $student)) throw ValidationException::withMessages(['student_code' => __('meeting.not_your_student')]);
        } else {
            if (empty($f['teacher_id'])) throw ValidationException::withMessages(['teacher_id' => __('validation.required', ['attribute' => 'teacher'])]);
            $teacher = Teacher::findOrFail($f['teacher_id']);
        }
        $m = ParentMeeting::create(['student_id' => $student->id, 'teacher_id' => $teacher->id, 'requested_by' => $request->user()->role === 'teacher' ? 'teacher' : 'admin',
            'subject' => $f['subject'], 'proposed_date' => $f['proposed_date'], 'proposed_time' => $f['proposed_time'], 'location' => $f['location'] ?? 'School Office', 'status' => 'pending', 'notes' => $f['notes'] ?? null]);
        AuditLog::record('meeting.requested', $m);
        $this->tellParents($m, 'meeting_requested', __('meeting.requested_title'), __('meeting.requested_body', $this->words($m)));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->load(['student.user:id,name', 'teacher.user:id,name']))], 201);
    }

    /** PUT /meetings/{id} - a new time (back to pending, the parents are told) or a changed subject / place */
    public function update(Request $request, int $id)
    {
        $m = $this->mine($request, $id);
        $this->open($m);
        $f = $request->validate($this->fields(false));
        $retimed = (isset($f['proposed_date']) && $f['proposed_date'] !== $m->proposed_date->toDateString()) || (isset($f['proposed_time']) && substr($f['proposed_time'], 0, 5) !== substr($m->proposed_time, 0, 5));
        $m->update($f + ($retimed ? ['status' => 'pending'] : []));
        AuditLog::record('meeting.updated', $m);
        if ($retimed) $this->tellParents($m, 'meeting_retimed', __('meeting.retimed_title'), __('meeting.retimed_body', $this->words($m)));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->fresh(['student.user:id,name', 'teacher.user:id,name']))]);
    }

    /** PATCH /meetings/{id}/cancel {reason?} */
    public function cancel(Request $request, int $id)
    {
        $m = $this->mine($request, $id);
        $this->open($m);
        $f = $request->validate(['reason' => 'nullable|string|max:500']);
        $m->update(['status' => 'cancelled', 'notes' => $this->note($m, __('meeting.note_cancelled', ['who' => $request->user()->name]) . (!empty($f['reason']) ? ': ' . $f['reason'] : ''))]);
        AuditLog::record('meeting.cancelled', $m);
        $this->tellParents($m, 'meeting_cancelled', __('meeting.cancelled_title'), __('meeting.cancelled_body', $this->words($m)));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->load(['student.user:id,name', 'teacher.user:id,name']))]);
    }

    /** PATCH /meetings/{id}/complete {notes} */
    public function complete(Request $request, int $id)
    {
        $m = $this->mine($request, $id);
        $this->open($m);
        $f = $request->validate(['notes' => 'required|string|max:2000']);
        if ($m->proposed_date->isFuture()) throw new BusinessException(__('meeting.not_yet'), 'meeting_not_yet', 422);
        $m->update(['status' => 'completed', 'notes' => $this->note($m, __('meeting.note_outcome') . ': ' . $f['notes'])]);
        AuditLog::record('meeting.completed', $m);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->load(['student.user:id,name', 'teacher.user:id,name']))]);
    }

    // ---- the parent side ----

    /** GET /parent/meetings */
    public function parentIndex(Request $request)
    {
        $ids = Student::whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->pluck('id');
        $rows = ParentMeeting::with(['student.user:id,name', 'teacher.user:id,name'])->whereIn('student_id', $ids)->where('proposed_date', '>=', now()->subDays(90)->toDateString())
            ->orderByDesc('proposed_date')->limit(200)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($m) => self::row($m))->values()]);
    }

    /** GET /parent/children/{id}/teachers - whom the parent may ask for a meeting */
    public function childTeachers(Request $request, int $id)
    {
        $s = $this->child($request, $id);
        return response()->json(['success' => true, 'data' => $this->teachersOf($s)->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name])->values()]);
    }

    /** POST /parent/meetings {student_id, teacher_id, subject, proposed_date, proposed_time, notes?} */
    public function parentStore(Request $request)
    {
        $f = $request->validate(['student_id' => 'required|integer', 'teacher_id' => 'required|integer'] + $this->fields(true));
        $s = $this->child($request, (int) $f['student_id']);
        $t = $this->teachersOf($s)->firstWhere('id', (int) $f['teacher_id']);
        if (!$t) throw ValidationException::withMessages(['teacher_id' => __('meeting.not_childs_teacher')]);
        $m = ParentMeeting::create(['student_id' => $s->id, 'teacher_id' => $t->id, 'requested_by' => 'parent', 'subject' => $f['subject'], 'proposed_date' => $f['proposed_date'],
            'proposed_time' => $f['proposed_time'], 'location' => $f['location'] ?? 'School Office', 'status' => 'pending', 'notes' => $f['notes'] ?? null, 'parent_response_at' => now()]);
        AuditLog::record('meeting.parent_requested', $m);
        $this->tellTeacher($m, 'meeting_parent_requested', __('meeting.parent_requested_title'), __('meeting.parent_requested_body', $this->words($m)));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->load(['student.user:id,name', 'teacher.user:id,name']))], 201);
    }

    /** PATCH /parent/meetings/{id}/confirm */
    public function confirm(Request $request, int $id)
    {
        $m = $this->parentsMeeting($request, $id);
        if ($m->status !== 'pending') throw new BusinessException(__('meeting.not_pending'), 'meeting_not_pending', 409);
        $m->update(['status' => 'confirmed', 'parent_response_at' => now()]);
        AuditLog::record('meeting.confirmed', $m);
        $this->tellTeacher($m, 'meeting_confirmed', __('meeting.confirmed_title'), __('meeting.confirmed_body', $this->words($m)));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->load(['student.user:id,name', 'teacher.user:id,name']))]);
    }

    /** PATCH /parent/meetings/{id}/reschedule {note} - asks for another time; stays pending */
    public function reschedule(Request $request, int $id)
    {
        $m = $this->parentsMeeting($request, $id);
        $this->open($m);
        $f = $request->validate(['note' => 'required|string|max:500']);
        $m->update(['status' => 'pending', 'parent_response_at' => now(), 'notes' => $this->note($m, __('meeting.note_parent_asks') . ': ' . $f['note'])]);
        AuditLog::record('meeting.parent_asked_retime', $m);
        $this->tellTeacher($m, 'meeting_parent_retime', __('meeting.parent_retime_title'), __('meeting.parent_retime_body', $this->words($m) + ['note' => $f['note']]));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->load(['student.user:id,name', 'teacher.user:id,name']))]);
    }

    /** PATCH /parent/meetings/{id}/cancel */
    public function parentCancel(Request $request, int $id)
    {
        $m = $this->parentsMeeting($request, $id);
        $this->open($m);
        $m->update(['status' => 'cancelled', 'parent_response_at' => now(), 'notes' => $this->note($m, __('meeting.note_cancelled', ['who' => $request->user()->name]))]);
        AuditLog::record('meeting.parent_cancelled', $m);
        $this->tellTeacher($m, 'meeting_cancelled', __('meeting.cancelled_title'), __('meeting.cancelled_body', $this->words($m)));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($m->load(['student.user:id,name', 'teacher.user:id,name']))]);
    }

    // ---- helpers ----

    private function fields(bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return ['subject' => [$r, 'string', 'max:150'], 'proposed_date' => [$r, 'date_format:Y-m-d', 'after_or_equal:today'], 'proposed_time' => [$r, 'date_format:H:i'],
            'location' => 'nullable|string|max:100', 'notes' => 'nullable|string|max:2000'];
    }

    private function teacherOf(User $u): ?Teacher
    {
        return $u->role === 'teacher' ? Teacher::where('user_id', $u->id)->first() : null;
    }

    private function teaches(Teacher $t, Student $s): bool
    {
        return BatchTeacher::where('teacher_id', $t->id)->whereIn('batch_id', $s->activeEnrollments()->pluck('batch_id'))->exists();
    }

    private function teachersOf(Student $s): Collection
    {
        $ids = BatchTeacher::whereIn('batch_id', $s->activeEnrollments()->pluck('batch_id'))->pluck('teacher_id')->unique();
        return Teacher::with('user:id,name')->whereIn('id', $ids)->where('status', 'active')->get()->sortBy(fn ($t) => $t->user?->name)->values();
    }

    /** the meeting; another institution's is 404, another teacher's 403 */
    private function mine(Request $request, int $id): ParentMeeting
    {
        $m = ParentMeeting::findOrFail($id);
        $t = $this->teacherOf($request->user());
        abort_if($t && (int) $m->teacher_id !== (int) $t->id, 403);
        return $m;
    }

    private function child(Request $request, int $id): Student
    {
        return Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
    }

    private function parentsMeeting(Request $request, int $id): ParentMeeting
    {
        $m = ParentMeeting::findOrFail($id);
        $this->child($request, (int) $m->student_id);
        return $m;
    }

    private function open(ParentMeeting $m): void
    {
        if (in_array($m->status, ['cancelled', 'completed'], true)) throw new BusinessException(__('meeting.closed'), 'meeting_closed', 409);
    }

    private function note(ParentMeeting $m, string $line): string
    {
        return trim(($m->notes ? $m->notes . "\n" : '') . '[' . now()->format('Y-m-d H:i') . '] ' . $line);
    }

    private function words(ParentMeeting $m): array
    {
        $m->loadMissing(['student.user:id,name', 'teacher.user:id,name']);
        return ['subject' => $m->subject, 'student' => $m->student?->user?->name ?? '', 'teacher' => $m->teacher?->user?->name ?? '', 'date' => $m->proposed_date->toDateString(), 'time' => substr($m->proposed_time, 0, 5)];
    }

    private function tellParents(ParentMeeting $m, string $type, string $title, string $body): void
    {
        $m->loadMissing('student.parents');
        $m->student?->parents->each(fn ($p) => $p->notify(new GeneralNotification($title, $body, $type, ['meeting_id' => $m->id])));
    }

    private function tellTeacher(ParentMeeting $m, string $type, string $title, string $body): void
    {
        $m->loadMissing('teacher.user');
        $m->teacher?->user?->notify(new GeneralNotification($title, $body, $type, ['meeting_id' => $m->id]));
    }

    public static function row(ParentMeeting $m): array
    {
        return ['id' => $m->id, 'subject' => $m->subject, 'status' => $m->status, 'requested_by' => $m->requested_by, 'date' => $m->proposed_date->toDateString(), 'time' => substr($m->proposed_time, 0, 5),
            'location' => $m->location, 'notes' => $m->notes, 'student' => ['id' => $m->student_id, 'name' => $m->student?->user?->name, 'student_id' => $m->student?->student_id],
            'teacher' => ['id' => $m->teacher_id, 'name' => $m->teacher?->user?->name]];
    }
}
