<?php

namespace App\Http\Controllers\Calendar;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, EventRegistration, EventResult, InstitutionEvent, Program, Student};
use App\Notifications\GeneralNotification;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D242 EVT.1 (advanced-features.md section 9, on top of the D213 events): attendance of registered students and competition results,
// on or after the event date, by the admin and staff with staff.event.manage (staff.event.read to see). With registration only
// attended students can win; one result per student per event; corrections and removals audited; one in-app notice to the winner's
// parents per result; the student and the parent see the awards; nothing goes to the public site. Points per class for a date range.
class EventResultController extends Controller
{
    /** GET /events/{id}/competition - registrations with their status, and the results */
    public function show(int $id)
    {
        $e = InstitutionEvent::findOrFail($id);
        $regs = EventRegistration::with('student.user:id,name')->where('event_id', $e->id)->orderBy('registered_at')->get();
        $results = EventResult::with('student.user:id,name')->where('event_id', $e->id)->orderByRaw('position IS NULL')->orderBy('position')->orderByDesc('points')->get();
        return response()->json(['success' => true, 'data' => ['event' => ['id' => $e->id, 'title' => $e->title, 'type' => $e->type, 'event_date' => $e->event_date->toDateString(),
                'registration_required' => (bool) $e->registration_required, 'started' => !$e->event_date->isFuture()],
            'registrations' => $regs->map(fn ($r) => ['student' => self::student($r->student), 'status' => $r->status])->values(),
            'results' => $results->map(fn ($r) => self::row($r))->values()]]);
    }

    /** PATCH /events/{id}/attendance {status, student_ids?} - every registered student when no ids */
    public function attendanceAll(Request $request, int $id)
    {
        $e = $this->started($id);
        $f = $request->validate(['status' => 'required|in:registered,attended,absent', 'student_ids' => 'nullable|array|max:2000', 'student_ids.*' => 'integer']);
        $q = EventRegistration::where('event_id', $e->id)->when($f['student_ids'] ?? null, fn ($q, $ids) => $q->whereIn('student_id', $ids));
        $n = $q->update(['status' => $f['status']]);
        AuditLog::record('event.attendance', $e, ['status' => $f['status'], 'count' => $n]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['updated' => $n]]);
    }

    /** PATCH /events/{id}/attendance/{studentId} {status} */
    public function attendance(Request $request, int $id, string $studentId)
    {
        abort_unless(ctype_digit($studentId), 404);
        $e = $this->started($id);
        $f = $request->validate(['status' => 'required|in:registered,attended,absent']);
        $r = EventRegistration::where('event_id', $e->id)->where('student_id', (int) $studentId)->firstOrFail();
        $r->update(['status' => $f['status']]);
        AuditLog::record('event.attendance', $e, ['status' => $f['status'], 'count' => 1]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['student_id' => (int) $studentId, 'status' => $r->status]]);
    }

    /** POST /events/{id}/results {student_id, position?, award?, points?, certificate_issued?} */
    public function store(Request $request, int $id)
    {
        $e = $this->started($id);
        $f = $request->validate(['student_id' => 'required|integer'] + $this->fields());
        $s = Student::findOrFail($f['student_id']);
        if ($e->registration_required && !EventRegistration::where('event_id', $e->id)->where('student_id', $s->id)->where('status', 'attended')->exists()) {
            throw ValidationException::withMessages(['student_id' => __('event.not_attended')]);
        }
        if (EventResult::where('event_id', $e->id)->where('student_id', $s->id)->exists()) throw ValidationException::withMessages(['student_id' => __('event.already_result')]);
        $r = EventResult::create(['event_id' => $e->id, 'student_id' => $s->id, 'points' => $f['points'] ?? 0] + array_intersect_key($f, array_flip(['position', 'award', 'certificate_issued', 'remarks'])));
        AuditLog::record('event.result_added', $r);
        $s->load('parents')->parents->each(fn ($p) => $p->notify(new GeneralNotification(__('event.notice_title'), __('event.notice_body', ['event' => $e->title, 'award' => self::label($r)]), 'event_result', ['event_id' => $e->id])));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($r->load('student.user:id,name'))], 201);
    }

    /** PUT /event-results/{id} */
    public function update(Request $request, int $id)
    {
        $r = EventResult::findOrFail($id);
        $f = $request->validate($this->fields());
        $was = $r->only(array_keys($f));
        $r->update($f);
        AuditLog::record('event.result_corrected', $r, ['was' => $was]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($r->fresh('student.user:id,name'))]);
    }

    /** DELETE /event-results/{id} - audited with what it was */
    public function destroy(int $id)
    {
        $r = EventResult::findOrFail($id);
        AuditLog::record('event.result_removed', $r, ['was' => $r->only(['event_id', 'student_id', 'position', 'award', 'points', 'certificate_issued', 'remarks'])]);
        $r->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /events/points?from=&to= - points per class (the student's current program) for events in the range */
    public function points(Request $request)
    {
        $f = $request->validate(['from' => 'required|date_format:Y-m-d', 'to' => 'required|date_format:Y-m-d|after_or_equal:from']);
        $results = EventResult::with(['student.activeEnrollments:id,student_id,program_id'])
            ->whereIn('event_id', InstitutionEvent::whereBetween('event_date', [$f['from'], $f['to']])->select('id'))->get();
        $by = $results->groupBy(fn ($r) => (int) ($r->student?->activeEnrollments->first()?->program_id ?? 0));
        $names = Program::whereIn('id', $by->keys()->filter())->pluck('name', 'id');
        $rows = $by->map(fn ($g, $pid) => ['program' => $pid ? ['id' => $pid, 'name' => $names[$pid] ?? null] : null, 'points' => (int) $g->sum('points'),
            'firsts' => $g->where('position', 1)->count(), 'results' => $g->count()])->sortByDesc('points')->values();
        return response()->json(['success' => true, 'data' => ['from' => $f['from'], 'to' => $f['to'], 'classes' => $rows]]);
    }

    /** GET /student/awards */
    public function mine(Request $request)
    {
        return $this->awards(Student::where('user_id', $request->user()->id)->firstOrFail());
    }

    /** GET /parent/children/{id}/awards */
    public function child(Request $request, int $id)
    {
        return $this->awards(Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail());
    }

    // ---- helpers ----

    private function awards(Student $s)
    {
        $rows = EventResult::with('event:id,title,type,event_date')->where('student_id', $s->id)->get()->sortByDesc(fn ($r) => $r->event?->event_date)->values();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => ['id' => $r->id, 'event' => ['id' => $r->event_id, 'title' => $r->event?->title, 'type' => $r->event?->type,
            'event_date' => $r->event?->event_date?->toDateString()], 'position' => $r->position, 'award' => $r->award, 'points' => $r->points, 'certificate_issued' => (bool) $r->certificate_issued])]);
    }

    private function started(int $id): InstitutionEvent
    {
        $e = InstitutionEvent::findOrFail($id);
        if ($e->event_date->isFuture()) throw ValidationException::withMessages(['event' => __('event.not_started')]);
        return $e;
    }

    private function fields(): array
    {
        return ['position' => 'nullable|integer|min:1|max:1000', 'award' => 'nullable|string|max:100', 'points' => 'nullable|integer|min:0|max:100000', 'certificate_issued' => 'nullable|boolean', 'remarks' => 'nullable|string|max:1000'];
    }

    private static function student(?Student $s): array
    {
        return ['id' => $s?->id, 'name' => $s?->user?->name, 'student_id' => $s?->student_id];
    }

    private static function label(EventResult $r): string
    {
        return trim(($r->position ? __('event.position', ['n' => $r->position]) : '') . ($r->award ? ' ' . $r->award : '')) ?: __('event.result');
    }

    public static function row(EventResult $r): array
    {
        return ['id' => $r->id, 'student' => self::student($r->student), 'position' => $r->position, 'award' => $r->award, 'points' => $r->points, 'certificate_issued' => (bool) $r->certificate_issued, 'remarks' => $r->remarks];
    }
}
