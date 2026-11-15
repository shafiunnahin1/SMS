<?php

namespace App\Http\Controllers\Syllabus;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{Batch, BatchTeacher, LessonPlan, SyllabusUnit};
use App\Services\Syllabus\SyllabusService;
use Illuminate\Http\Request;

// D224 SYL.1: the simple way - tick a unit covered in a batch (or untick it, audited) - the coverage tree with its percent, and the
// behind list. A teacher works on the batches and subjects they teach; the admin on all.
class SyllabusCoverageController extends Controller
{
    public function __construct(private SyllabusService $syllabus) {}

    /** GET /syllabus/coverage?batch_id=&subject_id= */
    public function index(Request $request)
    {
        $f = $request->validate(['batch_id' => 'required|integer', 'subject_id' => 'required|integer']);
        $batch = Batch::findOrFail($f['batch_id']);
        abort_unless($this->syllabus->mayTeach($request->user(), $batch->id, (int) $f['subject_id']), 403);
        return response()->json(['success' => true, 'data' => $this->syllabus->coverage($batch, (int) $f['subject_id'])]);
    }

    /** POST /syllabus/coverage {batch_id, unit_id, note?} */
    public function store(Request $request)
    {
        [$batch, $unit] = $this->target($request);
        $f = $request->validate(['note' => 'nullable|string|max:255']);
        $row = $this->syllabus->cover($batch, $unit, $this->creditedTeacher($request, $batch, $unit), $f['note'] ?? null);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['unit_id' => $row->unit_id, 'covered_on' => $row->covered_on->format('Y-m-d')]], 201);
    }

    /** DELETE /syllabus/coverage {batch_id, unit_id} */
    public function destroy(Request $request)
    {
        [$batch, $unit] = $this->target($request);
        $this->syllabus->uncover($batch, $unit);
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /syllabus/behind?teacher_id= - a teacher sees their own */
    public function behind(Request $request)
    {
        $f = $request->validate(['teacher_id' => 'nullable|integer']);
        $teacherId = $request->user()->role === 'teacher' ? ($this->syllabus->teacherOf($request->user())?->id ?? 0) : ($f['teacher_id'] ?? null);
        $rows = $this->syllabus->behind($teacherId);
        $units = SyllabusUnit::whereIn('id', $rows->pluck('unit_id'))->get()->keyBy('id');
        $batches = Batch::whereIn('id', $rows->pluck('batch_id'))->get(['id', 'name'])->keyBy('id');
        return response()->json(['success' => true, 'data' => $rows->map(fn (LessonPlan $p) => ['lesson_plan_id' => $p->id, 'planned_date' => $p->planned_date->format('Y-m-d'),
            'teacher_id' => $p->teacher_id, 'batch' => ['id' => $p->batch_id, 'name' => $batches->get($p->batch_id)?->name],
            'unit' => ['id' => $p->unit_id, 'title' => $units->get($p->unit_id)?->title], 'subject_id' => $p->subject_id])->values()]);
    }

    private function target(Request $request): array
    {
        $f = $request->validate(['batch_id' => 'required|integer', 'unit_id' => 'required|integer']);
        $batch = Batch::findOrFail($f['batch_id']);
        $unit = SyllabusUnit::findOrFail($f['unit_id']);
        abort_unless($this->syllabus->mayTeach($request->user(), $batch->id, (int) $unit->subject_id), 403);
        if ((int) $unit->program_id !== (int) $batch->program_id) throw \Illuminate\Validation\ValidationException::withMessages(['unit_id' => __('syllabus.wrong_program')]);
        if (SyllabusUnit::where('parent_id', $unit->id)->exists()) throw \Illuminate\Validation\ValidationException::withMessages(['unit_id' => __('syllabus.not_leaf')]);
        return [$batch, $unit];
    }

    /** A teacher's tick is theirs; the admin's is credited to the batch's teacher of that subject (else the class teacher) */
    private function creditedTeacher(Request $request, Batch $batch, SyllabusUnit $unit): int
    {
        $own = $this->syllabus->teacherOf($request->user());
        if ($own) return $own->id;
        $id = BatchTeacher::where('batch_id', $batch->id)->whereIn('subject_id', [$unit->subject_id, 0])->orderByDesc('subject_id')->value('teacher_id') ?? $batch->teacher_id;
        if (!$id) throw new BusinessException(__('syllabus.no_teacher'), 'syllabus_no_teacher', 422);
        return (int) $id;
    }
}
