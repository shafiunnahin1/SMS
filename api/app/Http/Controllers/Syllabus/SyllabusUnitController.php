<?php

namespace App\Http\Controllers\Syllabus;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, LessonPlan, Subject, SyllabusCoverage, SyllabusUnit};
use App\Services\Syllabus\SyllabusService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D224 SYL.1: the unit tree (chapter -> lesson) of a program's subject. The admin builds it; teachers read it. A unit with coverage,
// a lesson plan or child units cannot be removed; an edit changes only the title and the order (syllabus.md section 2 (7)).
class SyllabusUnitController extends Controller
{
    public function __construct(private SyllabusService $syllabus) {}

    /** GET /syllabus/units?program_id=&subject_id= */
    public function index(Request $request)
    {
        $f = $request->validate(['program_id' => 'required|integer', 'subject_id' => 'required|integer']);
        return response()->json(['success' => true, 'data' => $this->syllabus->units((int) $f['program_id'], (int) $f['subject_id'])
            ->map(fn ($u) => $u->only(['id', 'parent_id', 'title', 'term', 'planned_periods', 'sort_order']))->values()]);
    }

    /** POST /syllabus/units */
    public function store(Request $request)
    {
        $inst = \App\Support\Tenancy::current()->id;
        $f = $request->validate([
            'program_id' => ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $inst)],
            'subject_id' => ['required', 'integer', Rule::exists('subjects', 'id')->where('institution_id', $inst)->where('program_id', (int) $request->input('program_id'))],
            'parent_id' => 'nullable|integer', 'title' => 'required|string|max:200', 'term' => 'nullable|string|max:20',
            'planned_periods' => 'nullable|integer|min:0|max:1000', 'sort_order' => 'nullable|integer|min:0|max:100000']);
        if (!empty($f['parent_id'])) {
            $parent = SyllabusUnit::findOrFail($f['parent_id']);
            if ((int) $parent->program_id !== (int) $f['program_id'] || (int) $parent->subject_id !== (int) $f['subject_id']) {
                throw \Illuminate\Validation\ValidationException::withMessages(['parent_id' => __('syllabus.wrong_parent')]);
            }
        }
        $unit = SyllabusUnit::create($f + ['sort_order' => $f['sort_order'] ?? (int) SyllabusUnit::where('program_id', $f['program_id'])->where('subject_id', $f['subject_id'])
            ->where('parent_id', $f['parent_id'] ?? null)->max('sort_order') + 1]);
        AuditLog::record('syllabus.unit_created', $unit);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $unit->only(['id', 'parent_id', 'title', 'term', 'planned_periods', 'sort_order'])], 201);
    }

    /** PUT /syllabus/units/{id} {title?, sort_order?} */
    public function update(Request $request, int $id)
    {
        $f = $request->validate(['title' => 'sometimes|string|max:200', 'sort_order' => 'sometimes|integer|min:0|max:100000']);
        $unit = SyllabusUnit::findOrFail($id);
        $unit->update($f);
        AuditLog::record('syllabus.unit_updated', $unit);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $unit->only(['id', 'parent_id', 'title', 'term', 'planned_periods', 'sort_order'])]);
    }

    /** DELETE /syllabus/units/{id} */
    public function destroy(int $id)
    {
        $unit = SyllabusUnit::findOrFail($id);
        if (SyllabusUnit::where('parent_id', $unit->id)->exists() || SyllabusCoverage::where('unit_id', $unit->id)->exists() || LessonPlan::where('unit_id', $unit->id)->exists()) {
            throw new BusinessException(__('syllabus.unit_in_use'), 'unit_in_use', 409);
        }
        AuditLog::record('syllabus.unit_deleted', $unit);
        $unit->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }
}
