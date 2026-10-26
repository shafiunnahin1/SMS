<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\{EnrollmentActionRequest, StoreEnrollmentRequest};
use App\Models\{Batch, Enrollment, Student};
use App\Services\EnrollmentService;

// Step 4.2 (academic-structure.md "API Endpoints"): every membership change goes through EnrollmentService, the only writer of the
// students.program_id/batch_id/roll_no cache. Nothing is deleted: leaving a batch is a status (rule 5).
class EnrollmentController extends Controller
{
    public function __construct(private EnrollmentService $enrollments) {}

    public function store(StoreEnrollmentRequest $request)
    {
        $data = $request->validated();
        $e = $this->enrollments->enroll(Student::findOrFail($data['student_id']), Batch::findOrFail($data['batch_id']),
            array_filter(['roll_no' => $data['roll_no'] ?? null, 'fee_override' => $data['fee_override'] ?? null], fn ($v) => $v !== null));
        return response()->json(['success' => true, 'data' => $this->row($e->load(['batch:id,name', 'program:id,name']))], 201);
    }

    /** GET /students/{id}/enrollments - the full history, newest first */
    public function forStudent(\Illuminate\Http\Request $request, int $id)
    {
        $staff = $request->user()?->role === 'institution_staff';
        if ($staff) app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);   // D169 STW.2 (D91)
        $student = Student::findOrFail($id);
        $rows = Enrollment::with(['batch:id,name', 'program:id,name'])->where('student_id', $student->id)
            ->orderByRaw("status = 'active' desc")->orderByDesc('enrolled_at')->orderByDesc('id')->get();
        // D169 (3): staff never see a fee override
        return response()->json(['success' => true, 'data' => $rows->map(fn ($e) => $staff ? collect($this->row($e))->except('fee_override')->all() : $this->row($e))->values()]);
    }

    public function update(EnrollmentActionRequest $request, int $id)
    {
        $e = $this->enrollments->updateDetails(Enrollment::findOrFail($id), $request->validated());
        return response()->json(['success' => true, 'data' => $this->row($e->load(['batch:id,name', 'program:id,name'])), 'message' => __('messages.saved')]);
    }

    public function end(EnrollmentActionRequest $request, int $id)
    {
        $e = Enrollment::findOrFail($id);
        if ($e->status !== 'active') throw new \App\Exceptions\BusinessException('enrollment not active', 'enrollment_not_active', 422);
        $this->enrollments->end($e, $request->input('status'), $request->input('note'));
        return response()->json(['success' => true, 'data' => $this->row($e->fresh(['batch:id,name', 'program:id,name'])), 'message' => __('messages.saved')]);
    }

    public function transfer(EnrollmentActionRequest $request, int $id)
    {
        $e = Enrollment::findOrFail($id);
        if ($e->status !== 'active') throw new \App\Exceptions\BusinessException('enrollment not active', 'enrollment_not_active', 422);
        $new = $this->enrollments->transfer($e, Batch::findOrFail($request->input('batch_id')), array_filter(['roll_no' => $request->input('roll_no')], fn ($v) => $v !== null));
        return response()->json(['success' => true, 'data' => $this->row($new->load(['batch:id,name', 'program:id,name'])), 'message' => __('messages.saved')], 201);
    }

    private function row(Enrollment $e): array
    {
        return ['id' => $e->id, 'student_id' => $e->student_id, 'batch' => $e->batch ? ['id' => $e->batch->id, 'name' => $e->batch->name] : null,
            'program' => $e->program ? ['id' => $e->program->id, 'name' => $e->program->name] : null, 'roll_no' => $e->roll_no,
            'fee_override' => $e->fee_override, 'optional_subject_id' => $e->optional_subject_id, 'is_primary' => (bool) $e->is_primary,
            'status' => $e->status, 'enrolled_at' => $e->enrolled_at?->toDateString(), 'left_at' => $e->left_at?->toDateString(), 'note' => $e->note];
    }
}
