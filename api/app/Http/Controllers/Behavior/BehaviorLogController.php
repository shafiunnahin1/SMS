<?php

namespace App\Http\Controllers\Behavior;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, BatchTeacher, BehaviorLog, Student, Teacher, User};
use App\Notifications\GeneralNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

// D235 BHV.1 (extended-features.md section 5): behaviour entries. A teacher logs and reads for the students of their own batches; the
// admin and staff with staff.behavior.manage for anyone (staff.behavior.read to read). The parent sees positive entries at once and
// the others only after "tell the parent", which also sends an in-app notice (no SMS). Corrected by the author or the admin with the
// old text in the audit log; never deleted.
class BehaviorLogController extends Controller
{
    /** GET /behavior?type=&batch_id= - recent entries (a teacher: their batches) */
    public function index(Request $request)
    {
        $f = $request->validate(['type' => 'nullable|in:positive,negative,neutral', 'batch_id' => 'nullable|integer']);
        $batches = $this->teacherBatches($request->user());
        if ($batches !== null && !empty($f['batch_id']) && !$batches->contains((int) $f['batch_id'])) abort(403);
        $scope = $batches !== null ? (!empty($f['batch_id']) ? collect([(int) $f['batch_id']]) : $batches) : (!empty($f['batch_id']) ? collect([(int) $f['batch_id']]) : null);
        $rows = BehaviorLog::with(['student.user:id,name', 'reporter:id,name'])
            ->when($scope !== null, fn ($q) => $q->whereIn('student_id', Student::whereHas('activeEnrollments', fn ($e) => $e->whereIn('batch_id', $scope))->select('id')))
            ->when($f['type'] ?? null, fn ($q, $t) => $q->where('type', $t))->orderByDesc('date')->orderByDesc('id')->limit(200)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($b) => self::row($b))->values()]);
    }

    /** GET /behavior/find?student_code= - BHV.2: the student behind an ID card number (a teacher: only their own batches) */
    public function find(Request $request)
    {
        $f = $request->validate(['student_code' => 'required|string|max:50']);
        $s = Student::with('user:id,name')->where('student_id', trim($f['student_code']))->first();
        if (!$s) throw \Illuminate\Validation\ValidationException::withMessages(['student_code' => __('meeting.no_student')]);
        $this->student($request, $s->id);
        return response()->json(['success' => true, 'data' => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id]]);
    }

    /** GET /students/{id}/behavior */
    public function forStudent(Request $request, int $id)
    {
        $s = $this->student($request, $id);
        $rows = BehaviorLog::with('reporter:id,name')->where('student_id', $s->id)->orderByDesc('date')->orderByDesc('id')->get();
        return response()->json(['success' => true, 'data' => ['student' => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id], 'summary' => self::summary($rows),
            'entries' => $rows->map(fn ($b) => self::row($b))->values()]]);
    }

    /** POST /students/{id}/behavior */
    public function store(Request $request, int $id)
    {
        $s = $this->student($request, $id);
        $f = $request->validate($this->fields(true));
        $b = BehaviorLog::create($f + ['student_id' => $s->id, 'reported_by' => $request->user()->id, 'parent_notified' => false]);
        AuditLog::record('behavior.logged', $b);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($b->load(['student.user:id,name', 'reporter:id,name']))], 201);
    }

    /** PUT /behavior/{id} - a correction by the author or the admin (staff with the manage key) */
    public function update(Request $request, int $id)
    {
        $b = BehaviorLog::findOrFail($id);
        $this->mayCorrect($request->user(), $b);
        $f = $request->validate($this->fields(false));
        $was = $b->only(array_keys($f));
        $b->update($f);
        AuditLog::record('behavior.corrected', $b, ['was' => array_map(fn ($v) => $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : $v, $was)]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($b->fresh(['student.user:id,name', 'reporter:id,name']))]);
    }

    /** POST /behavior/{id}/notify-parent - makes the entry visible to the parents and sends an in-app notice */
    public function notify(Request $request, int $id)
    {
        $b = BehaviorLog::with('student.parents')->findOrFail($id);
        $this->student($request, (int) $b->student_id);
        $first = !$b->parent_notified;
        $b->update(['parent_notified' => true]);
        if ($first) {
            $b->student?->parents->each(fn ($p) => $p->notify(new GeneralNotification(__('behavior.notice_title'), __('behavior.notice_body', ['title' => $b->title, 'date' => $b->date->toDateString()]), 'behavior_note', ['behavior_id' => $b->id])));
            AuditLog::record('behavior.parent_told', $b);
        }
        return response()->json(['success' => true, 'message' => __('behavior.told'), 'data' => self::row($b->fresh(['student.user:id,name', 'reporter:id,name']))]);
    }

    /** GET /behavior/summary/{studentId} */
    public function summaryOf(Request $request, string $studentId)
    {
        abort_unless(ctype_digit($studentId), 404);
        $s = $this->student($request, (int) $studentId);
        return response()->json(['success' => true, 'data' => self::summary(BehaviorLog::where('student_id', $s->id)->get())]);
    }

    /** GET /parent/children/{id}/behavior */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        $rows = BehaviorLog::where('student_id', $s->id)->visibleToParents()->orderByDesc('date')->orderByDesc('id')->limit(200)->get();
        return response()->json(['success' => true, 'data' => ['summary' => self::summary($rows), 'entries' => $rows->map(fn ($b) => self::row($b, false))->values()]]);
    }

    // ---- helpers ----

    /** a teacher's batch ids, or null for the admin and staff (every batch) */
    private function teacherBatches(User $u): ?Collection
    {
        if ($u->role !== 'teacher') return null;
        $t = Teacher::where('user_id', $u->id)->first();
        return $t ? BatchTeacher::where('teacher_id', $t->id)->pluck('batch_id')->unique()->values() : collect();
    }

    /** the student; another institution's is 404, a student outside a teacher's batches 403 */
    private function student(Request $request, int $id): Student
    {
        $s = Student::with('user:id,name')->findOrFail($id);
        $batches = $this->teacherBatches($request->user());
        abort_if($batches !== null && !$s->activeEnrollments()->whereIn('batch_id', $batches)->exists(), 403);
        return $s;
    }

    private function mayCorrect(User $u, BehaviorLog $b): void
    {
        if ($u->role === 'teacher') abort_unless((int) $b->reported_by === (int) $u->id, 403);
    }

    private function fields(bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return ['type' => [$r, 'in:positive,negative,neutral'], 'category' => 'nullable|in:discipline,academic,social,achievement,other', 'title' => [$r, 'string', 'max:150'],
            'description' => 'nullable|string|max:2000', 'action_taken' => 'nullable|string|max:2000', 'date' => [$r, 'date_format:Y-m-d', 'before_or_equal:today']];
    }

    public static function summary($rows): array
    {
        return ['positive' => $rows->where('type', 'positive')->count(), 'negative' => $rows->where('type', 'negative')->count(), 'neutral' => $rows->where('type', 'neutral')->count()];
    }

    public static function row(BehaviorLog $b, bool $school = true): array
    {
        $r = ['id' => $b->id, 'type' => $b->type, 'category' => $b->category, 'title' => $b->title, 'description' => $b->description, 'action_taken' => $b->action_taken, 'date' => $b->date->toDateString()];
        if ($school) $r += ['parent_notified' => (bool) $b->parent_notified, 'reported_by' => ['id' => $b->reported_by, 'name' => $b->reporter?->name],
            'student' => ['id' => $b->student_id, 'name' => $b->student?->user?->name, 'student_id' => $b->student?->student_id]];
        return $r;
    }
}
