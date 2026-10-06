<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\StoreStudentRequest;
use App\Http\Resources\StudentResource;
use App\Models\{Batch, Student};
use App\Services\StudentService;
use Illuminate\Http\Request;

// Step 4.2 routes; the walking-skeleton slice (Spike S4) builds index / store / show. update / destroy / import follow in 4.2.
class StudentController extends Controller
{
    public function __construct(private StudentService $students) {}

    public function index(Request $request)
    {
        $request->validate(['q' => 'nullable|string|max:50', 'batch_id' => 'nullable|integer', 'per_page' => 'nullable|integer|min:1|max:100']);
        $page = Student::with(['user:id,name', 'program:id,name', 'batch:id,name'])
            ->when($request->input('batch_id'), fn ($q, $b) => $q->inBatch((int) $b))
            ->when($request->input('q'), fn ($q, $s) => $q->where(fn ($w) => $w->where('student_id', 'like', "{$s}%")
                ->orWhere('guardian_phone', 'like', "%{$s}%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$s}%"))))
            ->orderByDesc('id')->paginate((int) $request->input('per_page', 20));

        return StudentResource::collection($page)->additional(['success' => true]);
    }

    public function store(StoreStudentRequest $request)
    {
        $data = $request->validated();
        $batch = isset($data['batch_id']) ? Batch::findOrFail($data['batch_id']) : null;
        $enrollment = array_filter(['roll_no' => $data['roll_no'] ?? null, 'fee_override' => $data['fee_override'] ?? null], fn ($v) => $v !== null);
        $student = $this->students->create(collect($data)->except(['batch_id', 'roll_no', 'fee_override'])->all(), $batch, $enrollment);

        return (new StudentResource($student->load(['user:id,name', 'program:id,name', 'batch:id,name', 'activeEnrollments.batch', 'activeEnrollments.program'])))
            ->additional(['success' => true, 'message' => 'ভর্তি সম্পন্ন'])->response()->setStatusCode(201);
    }

    public function show(int $id)
    {
        $student = Student::with(['user:id,name', 'program:id,name', 'batch:id,name', 'activeEnrollments.batch', 'activeEnrollments.program'])->findOrFail($id);
        return (new StudentResource($student))->additional(['success' => true]);
    }
}
