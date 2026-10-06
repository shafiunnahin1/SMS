<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\StoreAttendanceRequest;
use App\Models\{Attendance, Batch, Enrollment, Holiday};
use App\Services\AttendanceService;
use Illuminate\Http\Request;

// Step 4.3 routes (laravel-core-files.md "Admin + Teacher"); Spike S5b builds index + store for the attendance.take page slot.
// Restricting a teacher to the batches assigned to them belongs to Step 4.3 (batch_teachers) - not in the spike.
class AttendanceController extends Controller
{
    public function __construct(private AttendanceService $attendance) {}

    /** GET /attendance?batch_id=&date= - the sheet: every active student of the batch with the status saved for that date (or null) */
    public function index(Request $request)
    {
        $data = $request->validate(['batch_id' => 'required|integer', 'date' => 'required|date_format:Y-m-d']);
        $batch = Batch::with('program:id,name')->findOrFail($data['batch_id']);
        $saved = Attendance::where('batch_id', $batch->id)->whereDate('date', $data['date'])->pluck('status', 'student_id');
        $rows = Enrollment::where('batch_id', $batch->id)->where('status', 'active')->with('student.user:id,name')->orderBy('roll_no')->orderBy('id')->get()
            ->map(fn ($e) => ['student_id' => $e->student_id, 'name' => $e->student?->user?->name, 'code' => $e->student?->student_id,
                'roll_no' => $e->roll_no, 'status' => $saved[$e->student_id] ?? null]);

        return response()->json(['success' => true, 'data' => [
            'batch' => ['id' => $batch->id, 'name' => $batch->name, 'program' => $batch->program?->name],
            'date' => $data['date'], 'holiday' => Holiday::whereDate('date', $data['date'])->value('title'), 'rows' => $rows,
        ]]);
    }

    public function store(StoreAttendanceRequest $request)
    {
        return response()->json(['success' => true, 'data' => $this->attendance->saveBulk($request->validated())], 201);
    }
}
