<?php

namespace App\Http\Controllers\Routines;

use App\Http\Controllers\Controller;
use App\Http\Requests\Routines\RoutineRequest;
use App\Models\{Batch, Enrollment, Program, Routine, Student, Teacher};
use App\Services\PdfService;
use App\Services\Routines\RoutineService;
use Illuminate\Http\Request;

// D193 RTN.1 (routine.md "API Endpoints"): the admin builds the weekly routine; a teacher reads it, their own and today's; a
// student reads their own class's (the server picks the class from the active enrollment, never from the request).
class RoutineController extends Controller
{
    public function __construct(private RoutineService $routines) {}

    /** GET /routines?program_id=&batch_id=&teacher_id= */
    public function index(Request $request)
    {
        $f = $request->validate(['program_id' => 'nullable|integer', 'batch_id' => 'nullable|integer', 'teacher_id' => 'nullable|integer']);
        $q = $this->query();
        if ($request->user()->role === 'student') {
            $student = Student::where('user_id', $request->user()->id)->first();
            $enr = $student ? Enrollment::where('student_id', $student->id)->where('status', 'active')->get(['program_id', 'batch_id']) : collect();
            if ($enr->isEmpty()) return response()->json(['success' => true, 'data' => []]);
            $q->where(function ($w) use ($enr) {
                foreach ($enr as $e) $w->orWhere(fn ($x) => $x->where('program_id', $e->program_id)->where(fn ($b) => $b->whereNull('batch_id')->when($e->batch_id, fn ($y) => $y->orWhere('batch_id', $e->batch_id))));
            });
        } else {
            $q->when($f['program_id'] ?? null, fn ($x, $v) => $x->where('program_id', $v))
              ->when($f['batch_id'] ?? null, fn ($x, $v) => $x->where(fn ($b) => $b->whereNull('batch_id')->orWhere('batch_id', $v)))
              ->when($f['teacher_id'] ?? null, fn ($x, $v) => $x->where('teacher_id', $v));
        }
        return response()->json(['success' => true, 'data' => $q->get()->map(fn ($r) => $this->row($r))->values()]);
    }

    public function store(RoutineRequest $request)
    {
        $r = $this->routines->save($request->validated());
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($r->load(['program:id,name', 'batch:id,name', 'subject:id,name', 'teacher.user:id,name']))], 201);
    }

    public function update(int $id)
    {
        $routine = Routine::findOrFail($id);                       // another tenant's id is a 404 before the input is checked
        $r = $this->routines->save(app(RoutineRequest::class)->validated(), $routine);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($r->load(['program:id,name', 'batch:id,name', 'subject:id,name', 'teacher.user:id,name']))]);
    }

    public function destroy(int $id)
    {
        $this->routines->delete(Routine::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /routines/teacher - the calling teacher's week */
    public function teacher(Request $request)
    {
        $teacher = Teacher::where('user_id', $request->user()->id)->first();
        $rows = $teacher ? $this->query()->where('teacher_id', $teacher->id)->get() : collect();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => $this->row($r))->values()]);
    }

    /** GET /routines/today - the calling teacher's classes today (Friday: none) */
    public function today(Request $request)
    {
        $day = strtolower(now()->format('D'));
        $teacher = Teacher::where('user_id', $request->user()->id)->first();
        $rows = $teacher && in_array($day, Routine::DAYS, true) ? $this->query()->where('teacher_id', $teacher->id)->where('day_of_week', $day)->get() : collect();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => $this->row($r))->values(), 'day' => $day]);
    }

    /** GET /routines/{programId}/print?batch_id= - A4 landscape, every day */
    public function print(Request $request, int $id)
    {
        $program = Program::findOrFail($id);
        $batchId = $request->validate(['batch_id' => 'nullable|integer'])['batch_id'] ?? null;
        $batch = $batchId ? Batch::where('program_id', $program->id)->findOrFail($batchId) : null;
        $rows = $this->query()->where('program_id', $program->id)->when($batch, fn ($q) => $q->where(fn ($b) => $b->whereNull('batch_id')->orWhere('batch_id', $batch->id)))->get();
        $times = $rows->map(fn ($r) => substr($r->start_time, 0, 5) . '–' . substr($r->end_time, 0, 5))->unique()->sort()->values()->all();
        $grid = [];
        foreach ($rows as $r) $grid[$r->day_of_week][substr($r->start_time, 0, 5) . '–' . substr($r->end_time, 0, 5)][] = $this->row($r);
        $pdf = app(PdfService::class)->render('pdf.routine', ['program' => $program->name, 'batch' => $batch?->name, 'days' => Routine::DAYS, 'times' => $times, 'grid' => $grid], 'a4', 'landscape');
        return response($pdf, 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="routine-' . $program->id . '.pdf"']);
    }

    private function query()
    {
        $order = "FIELD(day_of_week, '" . implode("','", Routine::DAYS) . "')";
        return Routine::with(['program:id,name', 'batch:id,name', 'subject:id,name', 'teacher.user:id,name'])->orderByRaw($order)->orderBy('start_time');
    }

    private function row(Routine $r): array
    {
        return ['id' => $r->id, 'program_id' => $r->program_id, 'program' => $r->program?->name, 'batch_id' => $r->batch_id, 'batch' => $r->batch?->name,
            'subject_id' => $r->subject_id, 'subject' => $r->subject?->name, 'teacher_id' => $r->teacher_id, 'teacher' => $r->teacher?->user?->name,
            'day_of_week' => $r->day_of_week, 'start_time' => substr($r->start_time, 0, 5), 'end_time' => substr($r->end_time, 0, 5), 'room_no' => $r->room_no];
    }
}
