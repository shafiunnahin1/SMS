<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\ProgramRequest;
use App\Http\Resources\ProgramResource;
use App\Models\Program;
use App\Services\AcademicStructureService;
use App\Services\{DepartmentAcademicReadService, DepartmentRequestContextService};
use App\Http\Resources\StaffProgramResource;
use Illuminate\Http\Request;

// Step 4.1 (docs/modules/academic-structure.md "API Endpoints")
class ProgramController extends Controller
{
    public function __construct(private AcademicStructureService $academic, private DepartmentRequestContextService $contexts, private DepartmentAcademicReadService $staffAcademic) {}

    public function index(Request $request)
    {
        if ($request->user()->role === 'institution_staff') {
            return StaffProgramResource::collection($this->staffAcademic->ownPrograms($request->user(), $this->contexts->forRoute($request)))
                ->additional(['success' => true]);
        }
        $programs = Program::withCount('batches')->orderBy('sort_order')->orderBy('numeric_name')->orderBy('name')->get();
        return ProgramResource::collection($programs)->additional(['success' => true]);
    }

    public function store(ProgramRequest $request)
    {
        $program = Program::create($request->validated());
        return (new ProgramResource($program->loadCount('batches')))->additional(['success' => true, 'message' => __('messages.saved')])->response()->setStatusCode(201);
    }

    public function show(int $id)
    {
        return (new ProgramResource(Program::withCount('batches')->findOrFail($id)))->additional(['success' => true]);
    }

    public function update(ProgramRequest $request, int $id)
    {
        $program = Program::findOrFail($id);
        $program->update($request->validated());
        return (new ProgramResource($program->loadCount('batches')))->additional(['success' => true, 'message' => __('messages.saved')]);
    }

    public function destroy(int $id)
    {
        $this->academic->deleteProgram(Program::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }
}
