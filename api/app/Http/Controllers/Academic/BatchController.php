<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\BatchRequest;
use App\Http\Resources\BatchResource;
use App\Http\Resources\StaffBatchResource;
use App\Models\{Batch, Enrollment, Teacher};
use App\Services\AcademicStructureService;
use App\Services\{DepartmentAcademicReadService, DepartmentRequestContextService};
use Illuminate\Http\Request;

// Step 4.1 (docs/modules/academic-structure.md). index keeps the shape the admission form uses (Spike S4) and adds filters.
class BatchController extends Controller
{
    private const DETAIL = ['program:id,name', 'teacher.user:id,name', 'subjectTeachers.subject:id,name', 'subjectTeachers.teacher.user:id,name'];

    public function __construct(private AcademicStructureService $academic, private DepartmentRequestContextService $contexts, private DepartmentAcademicReadService $staffAcademic) {}

    public function index(Request $request)
    {
        $input = $request->validate(['program_id' => 'nullable|integer', 'status' => 'nullable|in:upcoming,running,completed,archived,all']);
        if ($request->user()->role === 'institution_staff') {
            return StaffBatchResource::collection($this->staffAcademic->listBatches($request->user(), $this->contexts->forRoute($request), $input))
                ->additional(['success' => true]);
        }
        $status = $request->input('status');
        $batches = Batch::with(['program:id,name', 'teacher.user:id,name'])->withCount('activeEnrollments')
            ->when($request->input('program_id'), fn ($q, $p) => $q->where('program_id', $p))
            ->when($status !== 'all', fn ($q) => $status ? $q->where('status', $status) : $q->whereIn('status', ['upcoming', 'running']))
            ->orderBy('program_id')->orderBy('name')->get()
            ->map(fn ($b) => ['id' => $b->id, 'name' => $b->name, 'program' => $b->program ? ['id' => $b->program->id, 'name' => $b->program->name] : null,
                'monthly_fee' => $b->monthly_fee, 'max_capacity' => $b->max_capacity, 'status' => $b->status, 'shift' => $b->shift,
                'teacher' => $b->teacher ? ['id' => $b->teacher->id, 'name' => $b->teacher->user?->name] : null,
                'students_count' => $b->active_enrollments_count]);

        return response()->json(['success' => true, 'data' => $batches]);
    }

    public function store(BatchRequest $request)
    {
        $batch = $this->academic->saveBatch($request->validated());
        return (new BatchResource($batch->load(self::DETAIL)->loadCount('activeEnrollments')))
            ->additional(['success' => true, 'message' => __('messages.saved')])->response()->setStatusCode(201);
    }

    public function show(int $id)
    {
        return (new BatchResource(Batch::with(self::DETAIL)->withCount('activeEnrollments')->findOrFail($id)))->additional(['success' => true]);
    }

    public function update(BatchRequest $request, int $id)
    {
        $batch = $this->academic->saveBatch($request->validated(), Batch::findOrFail($id));
        return (new BatchResource($batch->load(self::DETAIL)->loadCount('activeEnrollments')))->additional(['success' => true, 'message' => __('messages.saved')]);
    }

    public function destroy(int $id)
    {
        $this->academic->deleteBatch(Batch::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** The batch's members = its ACTIVE enrollments (rule 1), ordered by roll */
    public function students(int $id)
    {
        $batch = Batch::findOrFail($id);
        $rows = Enrollment::with('student.user:id,name')->where('batch_id', $batch->id)->where('status', 'active')
            ->orderByRaw('roll_no IS NULL')->orderBy('roll_no')->get()
            ->map(fn ($e) => ['enrollment_id' => $e->id, 'student_id' => $e->student_id, 'code' => $e->student?->student_id,
                'name' => $e->student?->user?->name, 'roll_no' => $e->roll_no, 'is_primary' => (bool) $e->is_primary,
                'guardian_phone' => $e->student?->guardian_phone, 'enrolled_at' => $e->enrolled_at?->toDateString()]);
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET /teacher/batches - the signed-in teacher's own batches (class teacher or subject teacher) */
    public function mine(Request $request)
    {
        $teacher = Teacher::where('user_id', $request->user()->id)->first();
        $batches = $request->user()->role === 'institution_staff'
            ? $this->staffAcademic->ownBatches($request->user(), $this->contexts->forRoute($request))
            : ($teacher ? $this->academic->batchesOf($teacher) : collect());
        return response()->json(['success' => true, 'data' => $batches->map(fn ($b) => ['id' => $b->id, 'name' => $b->name,
            'program' => $b->program ? ['id' => $b->program->id, 'name' => $b->program->name] : null,
            'is_class_teacher' => $teacher && (int) $b->teacher_id === $teacher->id])->values()]);
    }
}
