<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Academic\StoreEnrollmentRequest;
use App\Models\{Batch, Student};
use App\Services\EnrollmentService;

// Step 4.2 routes; Spike S4 builds store (a coaching student joins a second batch). update / end / transfer follow in 4.2.
class EnrollmentController extends Controller
{
    public function __construct(private EnrollmentService $enrollments) {}

    public function store(StoreEnrollmentRequest $request)
    {
        $data = $request->validated();
        $e = $this->enrollments->enroll(Student::findOrFail($data['student_id']), Batch::findOrFail($data['batch_id']),
            array_filter(['roll_no' => $data['roll_no'] ?? null, 'fee_override' => $data['fee_override'] ?? null], fn ($v) => $v !== null));

        return response()->json(['success' => true, 'data' => $e->only(['id', 'student_id', 'batch_id', 'program_id', 'roll_no', 'is_primary', 'status', 'fee_override'])], 201);
    }
}
