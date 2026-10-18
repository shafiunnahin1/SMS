<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\StoreAttendanceRequest;
use App\Exceptions\BusinessException;
use App\Models\{Attendance, Batch, Enrollment, Holiday, Student, User};
use App\Services\AttendanceService;
use Illuminate\Http\Request;

// Step 4.3 (laravel-core-files.md "Admin + Teacher"): the sheet, saving, one-record correction, the monthly report, a student's
// summary and the parent's view. A teacher works only on the batches they are in charge of or teach in (AttendanceService::canTake).
class AttendanceController extends Controller
{
    public function __construct(private AttendanceService $attendance) {}

    /** GET /attendance?batch_id=&date= - the sheet: every active student of the batch with the status saved for that date (or null) */
    public function index(Request $request)
    {
        $data = $request->validate(['batch_id' => 'required|integer', 'date' => 'required|date_format:Y-m-d']);
        $batch = Batch::with('program:id,name')->findOrFail($data['batch_id']);
        $this->authorizeBatch($request, $batch);
        $records = Attendance::where('batch_id', $batch->id)->whereDate('date', $data['date'])->get(['student_id', 'status', 'taken_by', 'created_at']);
        $saved = $records->pluck('status', 'student_id');
        $last = $records->sortByDesc('created_at')->first();
        $rows = Enrollment::where('batch_id', $batch->id)->where('status', 'active')->with('student.user:id,name')->orderBy('roll_no')->orderBy('id')->get()
            ->map(fn ($e) => ['student_id' => $e->student_id, 'name' => $e->student?->user?->name, 'code' => $e->student?->student_id,
                'roll_no' => $e->roll_no, 'status' => $saved[$e->student_id] ?? null]);

        return response()->json(['success' => true, 'data' => [
            'batch' => ['id' => $batch->id, 'name' => $batch->name, 'program' => $batch->program?->name],
            'date' => $data['date'], 'holiday' => Holiday::whereDate('date', $data['date'])->value('title'), 'rows' => $rows,
            // was this sheet saved before? (the table keeps the first save time only - it has no updated_at)
            'saved' => ['count' => $records->count(), 'first_saved_at' => $last?->created_at?->toIso8601String(),
                'taken_by' => $last?->taken_by ? User::inTenant()->whereKey($last->taken_by)->value('name') : null],
        ]]);
    }

    public function store(StoreAttendanceRequest $request)
    {
        $this->authorizeBatch($request, Batch::findOrFail($request->input('batch_id')));
        return response()->json(['success' => true, 'data' => $this->attendance->saveBulk($request->validated())], 201);
    }

    /** PUT /attendance/{id} { status, note? } - correct one record (no new SMS for a correction) */
    public function update(Request $request, int $id)
    {
        $record = Attendance::findOrFail($id);
        $this->authorizeBatch($request, Batch::findOrFail($record->batch_id));
        $data = $request->validate(['status' => 'required|in:present,absent,late,leave', 'note' => 'nullable|string|max:255']);
        $record->update($data + ['taken_by' => $request->user()->id]);
        return response()->json(['success' => true, 'data' => $record->only(['id', 'student_id', 'batch_id', 'status', 'note']) + ['date' => $record->date->toDateString()],
            'message' => __('messages.saved')]);
    }

    /** GET /attendance/report?batch_id=&month=YYYY-MM - every active student's month in one grouped query */
    public function report(Request $request)
    {
        $data = $request->validate(['batch_id' => 'required|integer', 'month' => 'required|date_format:Y-m']);
        $batch = Batch::findOrFail($data['batch_id']);
        $this->authorizeBatch($request, $batch);
        $rows = $this->attendance->getBatchReport($batch->id, $data['month'])->map(fn ($r) => ['student_id' => $r['student']->id,
            'code' => $r['student']->student_id, 'name' => $r['student']->user?->name] + $r['summary'])->sortBy('name')->values();
        return response()->json(['success' => true, 'data' => ['batch' => ['id' => $batch->id, 'name' => $batch->name], 'month' => $data['month'], 'rows' => $rows]]);
    }

    /** GET /attendance/summary/{studentId}?month=&batch_id= (admin, teacher) */
    public function summary(Request $request, int $id)
    {
        $student = Student::findOrFail($id);
        $data = $request->validate(['month' => 'required|date_format:Y-m', 'batch_id' => 'nullable|integer']);
        if ($request->user()?->role === 'institution_staff') {
            // D101: only a student actively enrolled in one of the staff member's own batches, and only that batch's records
            $own = $this->staffBatches($request)->pluck('id');
            $batchIds = Enrollment::where('student_id', $student->id)->where('status', 'active')->whereIn('batch_id', $own)->pluck('batch_id');
            if ($batchIds->isEmpty() || (isset($data['batch_id']) && !$batchIds->contains((int) $data['batch_id']))) throw new BusinessException('not your student', 'forbidden', 403);
            $data['batch_id'] = $data['batch_id'] ?? (int) $batchIds->first();
        }
        return response()->json(['success' => true, 'data' => $this->summaryData($student, $data['month'], $data['batch_id'] ?? null)]);
    }

    /** GET /parent/children/{id}/attendance?month= - only the parent's own child; any other id is a 404 (TESTING.md
     *  ParentAttendanceAccessTest: not 403, so a parent cannot even learn that the id exists) */
    public function forParent(Request $request, int $id)
    {
        $student = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        $month = $request->validate(['month' => 'nullable|date_format:Y-m'])['month'] ?? now()->format('Y-m');
        return response()->json(['success' => true, 'data' => $this->summaryData($student, $month, null)]);
    }

    private function summaryData(Student $student, string $month, ?int $batchId): array
    {
        $sum = $this->attendance->getStudentSummary($student->id, $month, $batchId);
        $sum['daily_records'] = $sum['daily_records']->map(fn ($r) => ['date' => $r->date->toDateString(), 'status' => $r->status, 'batch_id' => $r->batch_id])->values();
        return ['student' => ['id' => $student->id, 'name' => $student->user?->name, 'code' => $student->student_id]] + $sum;
    }

    private function authorizeBatch(Request $request, Batch $batch): void
    {
        if ($request->user()?->role === 'institution_staff') {
            if (!$this->staffBatches($request)->whereKey($batch->id)->exists()) throw new BusinessException('not your batch', 'forbidden', 403);
            return;
        }
        if (!$this->attendance->canTake($request->user(), $batch)) throw new BusinessException('not your batch', 'forbidden', 403);
    }

    /** D101: department staff reach only their own (class or subject teacher) upcoming/running batches, via D91 context + the route's exact key */
    private function staffBatches(Request $request): \Illuminate\Database\Eloquent\Builder
    {
        $department = app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
        $permission = app(\App\Services\DepartmentRoutePermissionResolver::class)->resolve($request)['permission'];
        return app(\App\Services\DepartmentAcademicReadService::class)->ownBatchQuery($request->user(), $department, $permission);
    }
}
