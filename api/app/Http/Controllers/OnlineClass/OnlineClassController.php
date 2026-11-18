<?php

namespace App\Http\Controllers\OnlineClass;

use App\Http\Controllers\Controller;
use App\Models\{Batch, OnlineClass, Program, Student, Subject, Teacher};
use App\Services\OnlineClass\OnlineClassService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D231 OCL.1: online classes. The admin, every teacher and staff with staff.online_class.read see the list (a teacher: the classes
// they teach); every admin and teacher (staff: staff.online_class.manage) schedules; a teacher changes only their own. The student
// and the parent see the classes of the student's batches and programs, with the link and passcode unless cancelled.
class OnlineClassController extends Controller
{
    public function __construct(private OnlineClassService $classes) {}

    /** GET /online-classes?when=upcoming|past&batch_id= */
    public function index(Request $request)
    {
        $f = $request->validate(['when' => 'nullable|in:upcoming,past', 'batch_id' => 'nullable|integer']);
        $teacher = $this->classes->teacherOf($request->user());
        $q = OnlineClass::with(['teacher.user:id,name', 'program:id,name', 'batch:id,name', 'subject:id,name'])
            ->when($teacher, fn ($q) => $q->where('teacher_id', $teacher->id))
            ->when($f['batch_id'] ?? null, fn ($q, $b) => $q->where('batch_id', $b));
        $q = ($f['when'] ?? 'upcoming') === 'past'
            ? $q->where('scheduled_at', '<', now()->subHours(6))->orderByDesc('scheduled_at')
            : $q->where('scheduled_at', '>=', now()->subHours(6))->orderBy('scheduled_at');
        return response()->json(['success' => true, 'data' => $q->limit(200)->get()->map(fn ($c) => self::row($c, true))->values()]);
    }

    /** POST /online-classes */
    public function store(Request $request)
    {
        $f = $this->validated($request, null);
        $teacher = $this->classes->teacherOf($request->user());
        if ($teacher) $f['teacher_id'] = $teacher->id;                                  // a teacher schedules their own class
        elseif (empty($f['teacher_id'])) throw ValidationException::withMessages(['teacher_id' => __('validation.required', ['attribute' => 'teacher'])]);
        $c = $this->classes->create($f, $request->user());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($c->load(['teacher.user:id,name', 'program:id,name', 'batch:id,name', 'subject:id,name']), true)], 201);
    }

    /** PUT /online-classes/{id} */
    public function update(Request $request, int $id)
    {
        $c = $this->mine($request, $id);
        $f = $this->validated($request, $c);
        if ($this->classes->teacherOf($request->user())) unset($f['teacher_id']);
        $c = $this->classes->update($c, $f);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($c->load(['teacher.user:id,name', 'program:id,name', 'batch:id,name', 'subject:id,name']), true)]);
    }

    /** DELETE /online-classes/{id} - cancels; the row stays */
    public function destroy(Request $request, int $id)
    {
        $c = $this->classes->cancel($this->mine($request, $id));
        return response()->json(['success' => true, 'message' => __('online_class.cancelled'), 'data' => self::row($c, true)]);
    }

    /** PATCH /online-classes/{id}/complete {recording_url?} */
    public function complete(Request $request, int $id)
    {
        $c = $this->mine($request, $id);
        $f = $request->validate(['recording_url' => ['nullable', 'string', 'max:500', 'url', 'starts_with:https://']]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($this->classes->complete($c, $f['recording_url'] ?? null), true)]);
    }

    /** GET /student/online-classes */
    public function mineStudent(Request $request)
    {
        return $this->family(Student::where('user_id', $request->user()->id)->firstOrFail());
    }

    /** GET /parent/children/{id}/online-classes */
    public function child(Request $request, int $id)
    {
        return $this->family(Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail());
    }

    private function family(Student $s)
    {
        $rows = $this->classes->forStudent($s)->with(['teacher.user:id,name', 'subject:id,name'])->where('scheduled_at', '>=', now()->subDays(60))->orderBy('scheduled_at')->limit(200)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($c) => self::row($c, $c->status !== 'cancelled'))->values()]);
    }

    /** the class, 404 for another institution's, 403 for a teacher who does not teach it */
    private function mine(Request $request, int $id): OnlineClass
    {
        $c = OnlineClass::findOrFail($id);
        abort_unless($this->classes->mayChange($request->user(), $c), 403);
        return $c;
    }

    private function validated(Request $request, ?OnlineClass $c): array
    {
        $r = $c ? 'sometimes' : 'required';
        $f = $request->validate(['title' => [$r, 'string', 'max:150'], 'description' => 'nullable|string|max:2000', 'program_id' => [$r, 'integer'], 'batch_id' => 'nullable|integer',
            'subject_id' => 'nullable|integer', 'teacher_id' => 'nullable|integer', 'platform' => 'nullable|in:zoom,google_meet,jitsi,custom',
            'meeting_link' => [$r, 'string', 'max:500', 'url', 'starts_with:https://'], 'meeting_id' => 'nullable|string|max:100', 'passcode' => 'nullable|string|max:50',
            'scheduled_at' => [$r, 'date_format:Y-m-d H:i'], 'duration_minutes' => 'nullable|integer|min:10|max:480']);
        $program = $f['program_id'] ?? $c?->program_id;
        if (isset($f['program_id'])) Program::findOrFail($f['program_id']);
        if (!empty($f['batch_id']) && (int) Batch::findOrFail($f['batch_id'])->program_id !== (int) $program) throw ValidationException::withMessages(['batch_id' => __('online_class.batch_not_in_program')]);
        if (!empty($f['subject_id'])) Subject::findOrFail($f['subject_id']);
        if (!empty($f['teacher_id'])) Teacher::findOrFail($f['teacher_id']);
        if (!$c && isset($f['scheduled_at']) && \Illuminate\Support\Carbon::createFromFormat('Y-m-d H:i', $f['scheduled_at'])->lt(now()->subMinutes(5))) throw ValidationException::withMessages(['scheduled_at' => __('online_class.in_past')]);
        $f['platform'] ??= $c?->platform ?? 'google_meet';
        if (array_key_exists('duration_minutes', $f) && $f['duration_minutes'] === null) $f['duration_minutes'] = 60;
        return $f;
    }

    public static function row(OnlineClass $c, bool $withLink): array
    {
        return ['id' => $c->id, 'title' => $c->title, 'description' => $c->description, 'platform' => $c->platform,
            'teacher' => ['id' => $c->teacher_id, 'name' => $c->teacher?->user?->name], 'program' => ['id' => $c->program_id, 'name' => $c->relationLoaded('program') ? $c->program?->name : null],
            'batch' => $c->batch_id ? ['id' => $c->batch_id, 'name' => $c->relationLoaded('batch') ? $c->batch?->name : null] : null,
            'subject' => $c->subject_id ? ['id' => $c->subject_id, 'name' => $c->subject?->name] : null,
            'scheduled_at' => $c->scheduled_at->format('Y-m-d H:i'), 'ends_at' => $c->endsAt()->format('Y-m-d H:i'), 'duration_minutes' => (int) ($c->duration_minutes ?? 60),
            'status' => $c->displayStatus(), 'recording_url' => $c->recording_url,
            'meeting_link' => $withLink ? $c->meeting_link : null, 'meeting_id' => $withLink ? $c->meeting_id : null, 'passcode' => $withLink ? $c->passcode : null];
    }
}
