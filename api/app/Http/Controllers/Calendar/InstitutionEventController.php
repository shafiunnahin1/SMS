<?php

namespace App\Http\Controllers\Calendar;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, EventRegistration, InstitutionEvent, Student};
use App\Services\Calendar\CalendarService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// D213 CAL.2: the admin manages events (audience, programs, optional registration with deadline and limit) and sees who
// registered; every module role reads the month calendar and the upcoming events meant for them; a student registers or cancels.
class InstitutionEventController extends Controller
{
    public function __construct(private CalendarService $calendar) {}

    /** GET /events?month=YYYY-MM (admin) */
    public function index(Request $request)
    {
        $f = $request->validate(['month' => 'nullable|date_format:Y-m']);
        $q = InstitutionEvent::withCount('registrations')->orderBy('event_date')->orderBy('start_time');
        if (!empty($f['month'])) $q->where('event_date', 'like', $f['month'] . '-%');
        else $q->where('event_date', '>=', now()->toDateString());
        return response()->json(['success' => true, 'data' => $q->limit(200)->get()->map(fn ($e) => $this->row($e))->values()]);
    }

    public function store(Request $request)
    {
        $d = $this->validated($request);
        $e = InstitutionEvent::create($d + ['created_by' => $request->user()->id]);
        AuditLog::record('event.created', $e);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($e->refresh()->loadCount('registrations'))], 201);
    }

    public function update(Request $request, int $id)
    {
        $e = InstitutionEvent::findOrFail($id);
        $d = $this->validated($request);
        $count = $e->registrations()->count();
        if ($count && !$d['registration_required']) throw new BusinessException('students have registered', 'event_has_registrations', 422);
        if (!empty($d['max_participants']) && $d['max_participants'] < $count) throw new BusinessException('below the registered count', 'event_limit_below_registered', 422, ['count' => $count]);
        $e->update($d);
        AuditLog::record('event.updated', $e);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($e->loadCount('registrations'))]);
    }

    public function destroy(int $id)
    {
        $e = InstitutionEvent::findOrFail($id);
        DB::transaction(function () use ($e) {
            $e->registrations()->delete();
            $e->delete();
        });
        AuditLog::record('event.deleted', $e);
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /events/{id}/registrations (admin) */
    public function registrations(int $id)
    {
        $e = InstitutionEvent::findOrFail($id);
        $rows = $e->registrations()->with('student.user:id,name')->orderBy('registered_at')->get()
            ->map(fn ($r) => ['id' => $r->id, 'student' => ['id' => $r->student_id, 'name' => $r->student?->user?->name, 'student_id' => $r->student?->student_id], 'registered_at' => $r->registered_at?->toIso8601String(), 'status' => $r->status]);
        return response()->json(['success' => true, 'data' => $rows->values()]);
    }

    /** GET /calendar?month=YYYY-MM (every module role) */
    public function calendar(Request $request)
    {
        $f = $request->validate(['month' => 'nullable|date_format:Y-m']);
        return response()->json(['success' => true, 'data' => $this->calendar->month($f['month'] ?? now()->format('Y-m'), $request->user())]);
    }

    /** GET /events/upcoming (every module role): the next 20 events meant for the caller; a student also sees whether they registered */
    public function upcoming(Request $request)
    {
        $u = $request->user();
        $events = InstitutionEvent::for($u->role, $this->calendar->programsOf($u))->where('event_date', '>=', now()->toDateString())->withCount('registrations')
            ->orderBy('event_date')->orderBy('start_time')->limit(20)->get();
        $mine = [];
        if ($u->role === 'student' && ($s = Student::where('user_id', $u->id)->first())) {
            $mine = EventRegistration::where('student_id', $s->id)->whereIn('event_id', $events->pluck('id'))->pluck('event_id')->flip()->all();
        }
        return response()->json(['success' => true, 'data' => $events->map(fn ($e) => $this->row($e) + ['registered' => isset($mine[$e->id])])->values()]);
    }

    /** POST /events/{id}/register (student) */
    public function register(Request $request, int $id)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        return DB::transaction(function () use ($s, $id, $request) {
            $e = InstitutionEvent::for('student', $this->calendar->programsOf($request->user()))->whereKey($id)->lockForUpdate()->firstOrFail();
            if (!$e->registration_required) throw new BusinessException('no registration', 'event_no_registration', 422);
            $last = $e->registration_deadline ?? $e->event_date;
            if (now()->toDateString() > $last->toDateString()) throw new BusinessException('registration closed', 'event_registration_closed', 422);
            if (EventRegistration::where('event_id', $e->id)->where('student_id', $s->id)->exists()) throw new BusinessException('already registered', 'event_already_registered', 422);
            if ($e->max_participants && $e->registrations()->count() >= $e->max_participants) throw new BusinessException('full', 'event_full', 422);
            EventRegistration::create(['event_id' => $e->id, 'student_id' => $s->id]);
            return response()->json(['success' => true, 'message' => __('messages.saved')], 201);
        });
    }

    /** DELETE /events/{id}/register (student) - until the registration closes */
    public function unregister(Request $request, int $id)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        $r = EventRegistration::where('event_id', $id)->where('student_id', $s->id)->firstOrFail();
        $e = $r->event;
        if (now()->toDateString() > ($e->registration_deadline ?? $e->event_date)->toDateString()) throw new BusinessException('registration closed', 'event_registration_closed', 422);
        $r->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /student/events - the student's registrations */
    public function mine(Request $request)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        $rows = EventRegistration::with('event')->where('student_id', $s->id)->orderByDesc('registered_at')->get()
            ->filter(fn ($r) => $r->event)->map(fn ($r) => $this->row($r->event) + ['registered' => true, 'status' => $r->status]);
        return response()->json(['success' => true, 'data' => $rows->values()]);
    }

    private function validated(Request $request): array
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'title' => 'required|string|max:150', 'description' => 'nullable|string|max:5000',
            'type' => 'required|in:academic,sports,cultural,religious,other', 'event_date' => 'required|date_format:Y-m-d',
            'start_time' => 'nullable|date_format:H:i', 'end_time' => 'nullable|date_format:H:i|after:start_time', 'venue' => 'nullable|string|max:150',
            'target_audience' => 'required|in:all,students,teachers,parents',
            'program_ids' => 'nullable|array|max:50', 'program_ids.*' => ['integer', 'distinct', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'registration_required' => 'boolean', 'registration_deadline' => 'nullable|date_format:Y-m-d|before_or_equal:event_date',
            'max_participants' => 'nullable|integer|min:1|max:100000', 'is_public' => 'boolean',
        ]);
        $d['registration_required'] = (bool) ($d['registration_required'] ?? false);
        if ($d['registration_required'] && $d['target_audience'] !== 'all' && $d['target_audience'] !== 'students') {
            throw new BusinessException('only students register', 'event_registration_students', 422);
        }
        if (!$d['registration_required']) $d['registration_deadline'] = $d['max_participants'] = null;
        $d['program_ids'] = !empty($d['program_ids']) ? array_values(array_map('intval', $d['program_ids'])) : null;
        $d['is_public'] = (bool) ($d['is_public'] ?? false);
        return $d;
    }

    private function row(InstitutionEvent $e): array
    {
        return ['id' => $e->id, 'title' => $e->title, 'description' => $e->description, 'type' => $e->type, 'event_date' => $e->event_date->toDateString(),
            'start_time' => $e->start_time ? substr($e->start_time, 0, 5) : null, 'end_time' => $e->end_time ? substr($e->end_time, 0, 5) : null, 'venue' => $e->venue,
            'target_audience' => $e->target_audience, 'program_ids' => $e->program_ids ?? [], 'registration_required' => (bool) $e->registration_required,
            'registration_deadline' => $e->registration_deadline?->toDateString(), 'max_participants' => $e->max_participants, 'is_public' => (bool) $e->is_public,
            'registrations_count' => $e->registrations_count ?? null];
    }
}
