<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\SubjectRequest;
use App\Http\Resources\SubjectResource;
use App\Models\Subject;
use App\Services\AcademicStructureService;
use App\Services\{DepartmentAcademicReadService, DepartmentRequestContextService};
use App\Http\Resources\StaffSubjectResource;
use Illuminate\Http\Request;

// Step 4.1: subjects belong to a program (schema.sql `subjects`)
class SubjectController extends Controller
{
    public function __construct(private AcademicStructureService $academic, private DepartmentRequestContextService $contexts, private DepartmentAcademicReadService $staffAcademic) {}

    public function index(Request $request)
    {
        if ($request->user()->role === 'institution_staff') {
            $departmentId = $this->contexts->forRoute($request);
            $filters = $request->validate(['program_id' => 'nullable|integer']);
            return StaffSubjectResource::collection($this->staffAcademic->listSubjects($request->user(), $departmentId, $filters))
                ->additional(['success' => true]);
        }
        $request->validate(['program_id' => 'nullable|integer']);
        $subjects = Subject::with(['program:id,name', 'teacher.user:id,name'])
            ->when($request->input('program_id'), fn ($q, $p) => $q->where('program_id', $p))
            ->orderBy('program_id')->orderBy('name')->get();
        return SubjectResource::collection($subjects)->additional(['success' => true]);
    }

    public function store(SubjectRequest $request)
    {
        $subject = Subject::create($request->validated());
        return (new SubjectResource($subject->load(['program:id,name', 'teacher.user:id,name'])))
            ->additional(['success' => true, 'message' => __('messages.saved')])->response()->setStatusCode(201);
    }

    public function show(Request $request, int $id)
    {
        if ($request->user()->role === 'institution_staff') {
            return (new StaffSubjectResource($this->staffAcademic->showSubject($request->user(), $this->contexts->forRoute($request), $id)))
                ->additional(['success' => true]);
        }
        return (new SubjectResource(Subject::with(['program:id,name', 'teacher.user:id,name'])->findOrFail($id)))->additional(['success' => true]);
    }

    public function update(SubjectRequest $request, int $id)
    {
        $subject = Subject::findOrFail($id);
        $subject->update($request->validated());
        return (new SubjectResource($subject->load(['program:id,name', 'teacher.user:id,name'])))->additional(['success' => true, 'message' => __('messages.saved')]);
    }

    public function destroy(int $id)
    {
        $this->academic->deleteSubject(Subject::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }
}
