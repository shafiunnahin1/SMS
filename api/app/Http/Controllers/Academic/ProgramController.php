<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\ProgramRequest;
use App\Http\Resources\ProgramResource;
use App\Models\Program;
use App\Services\AcademicStructureService;

// Step 4.1 (docs/modules/academic-structure.md "API Endpoints")
class ProgramController extends Controller
{
    public function __construct(private AcademicStructureService $academic) {}

    public function index()
    {
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
