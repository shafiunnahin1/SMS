<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\{StoreStudentRequest, UpdateStudentRequest};
use App\Http\Resources\StudentResource;
use App\Models\{Batch, Student};
use App\Services\{ConsentService, StudentService};
use App\Support\StudentFiles;
use Illuminate\Http\Request;

// Step 4.2: student CRUD. Admission = student + login + parent link + first enrollment (+ photo, + the guardian's paper consent).
class StudentController extends Controller
{
    private const DETAIL = ['user:id,name', 'program:id,name', 'batch:id,name', 'activeEnrollments.batch', 'activeEnrollments.program'];

    public function __construct(private StudentService $students, private ConsentService $consents) {}

    public function index(Request $request)
    {
        $this->staffContext($request);   // D169 STW.2: staff only with the key in the selected department (D91)
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
        $profile = collect($data)->except(['batch_id', 'roll_no', 'fee_override', 'photo', 'consent_data', 'consent_sms', 'consent_guardian_name'])->all();
        $student = \Illuminate\Support\Facades\DB::transaction(function () use ($profile, $batch, $enrollment, $data, $request) {
            $student = $this->students->create($profile, $batch, $enrollment);
            if ($request->hasFile('photo')) $student->forceFill(['photo' => StudentFiles::storePhoto($student, $request->file('photo'))])->save();
            $guardian = ['name' => $data['consent_guardian_name'] ?? $data['father_name'] ?? $data['mother_name'] ?? null];
            foreach (['consent_data' => 'data_processing', 'consent_sms' => 'sms'] as $field => $type) {
                if (!empty($data[$field])) $this->consents->record($student, $type, 'paper', $guardian, $request->user()->id);
            }
            return $student;
        });

        return (new StudentResource($student->load(self::DETAIL)))->additional(['success' => true, 'message' => __('messages.admitted')])->response()->setStatusCode(201);
    }

    public function show(Request $request, int $id)
    {
        $this->staffContext($request);
        return (new StudentResource(Student::with(self::DETAIL)->findOrFail($id)))->additional(['success' => true]);
    }

    /** D169 STW.2 (D91): a staff request must name a selected department holding this route's exact key; the head is unaffected */
    private function staffContext(Request $request): void
    {
        if ($request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
    }

    public function update(UpdateStudentRequest $request, int $id)
    {
        $student = $this->students->update(Student::findOrFail($id), collect($request->validated())->except('photo')->all(), $request->file('photo'));
        return (new StudentResource($student->load(self::DETAIL)))->additional(['success' => true, 'message' => __('messages.saved')]);
    }

    public function destroy(int $id)
    {
        $this->students->delete(Student::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }
}
