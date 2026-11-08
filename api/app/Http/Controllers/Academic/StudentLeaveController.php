<?php

namespace App\Http\Controllers\Academic;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Student, StudentLeaveRequest};
use App\Services\StudentLeaveService;
use Illuminate\Http\Request;

// D197 AAD.3 (academics-advanced.md section 5): the parent asks for their own child; the class / batch teacher (up to
// settings.student_leave.max_days_auto days) or the admin decides. The doctor's note is a short-lived signed link only.
class StudentLeaveController extends Controller
{
    public function __construct(private StudentLeaveService $leave) {}

    /** POST /parent/children/{id}/leave-requests (multipart: from_date, to_date, reason?, attachment?) */
    public function store(Request $request, int $id)
    {
        $student = Student::with('user:id,name')->whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        $data = $request->validate([
            'from_date' => 'required|date_format:Y-m-d|after_or_equal:' . now()->subDays(7)->toDateString(),
            'to_date' => 'required|date_format:Y-m-d|after_or_equal:from_date|before_or_equal:' . now()->addDays(90)->toDateString(),
            'reason' => 'required|string|max:500',
            'attachment' => 'nullable|file|max:2048|mimes:pdf,jpg,jpeg,png',
        ]);
        if (\Carbon\Carbon::parse($data['from_date'])->diffInDays(\Carbon\Carbon::parse($data['to_date'])) >= 60) {
            throw new BusinessException('too long', 'leave_too_long', 422);
        }
        $l = $this->leave->create($student, $data, $request->file('attachment'), $request->user());
        return response()->json(['success' => true, 'message' => __('leave.sent'), 'data' => $this->row($l) + ['exam_clash' => $this->leave->examClash($l)]], 201);
    }

    /** GET /parent/leave-requests - every request for the parent's children */
    public function forParent(Request $request)
    {
        $ids = Student::whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->pluck('id');
        $rows = StudentLeaveRequest::with('student.user:id,name')->whereIn('student_id', $ids)->orderByDesc('id')->limit(200)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($l) => $this->row($l))->values()]);
    }

    /** GET /leave-requests/students?status= - admin: all; teacher: the students of their batches */
    public function index(Request $request)
    {
        $status = $request->validate(['status' => 'nullable|in:pending,approved,rejected,cancelled'])['status'] ?? null;
        $ids = $this->leave->visibleStudentIds($request->user());
        $rows = StudentLeaveRequest::with('student.user:id,name')->when($status, fn ($q) => $q->where('status', $status))
            ->when($ids !== null, fn ($q) => $q->whereIn('student_id', $ids))->orderByDesc('id')->limit(300)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($l) => $this->row($l, true) + ['can_decide' => $this->leave->canDecide($request->user(), $l)])->values()]);
    }

    /** PATCH /leave-requests/students/{id} { status: approved|rejected|cancelled, note? } */
    public function decide(Request $request, int $id)
    {
        $ids = $this->leave->visibleStudentIds($request->user());
        $l = StudentLeaveRequest::when($ids !== null, fn ($q) => $q->whereIn('student_id', $ids))->findOrFail($id);
        $data = $request->validate(['status' => 'required|in:approved,rejected,cancelled', 'note' => 'nullable|string|max:255']);
        if (!$this->leave->canDecide($request->user(), $l)) throw new BusinessException('admin decides', 'leave_needs_admin', 403);
        $out = $this->leave->decide($l, $data['status'], $data['note'] ?? null, $request->user());
        AuditLog::record("student_leave.{$data['status']}", $l, ['days' => $l->total_days]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($out['leave']->load('student.user:id,name'), true)
            + ['absent_to_correct' => $out['absent_to_correct'], 'exam_clash' => $this->leave->examClash($l)]]);
    }

    private function row(StudentLeaveRequest $l, bool $staff = false): array
    {
        return ['id' => $l->id, 'student_id' => $l->student_id, 'student' => $l->student?->user?->name, 'from_date' => $l->from_date->toDateString(),
            'to_date' => $l->to_date->toDateString(), 'total_days' => $l->total_days, 'reason' => $l->reason, 'method' => $l->method, 'status' => $l->status,
            'decision_note' => $l->decision_note, 'decided_at' => $l->decided_at?->toIso8601String(), 'created_at' => $l->created_at?->toIso8601String(),
            'attachment_url' => $this->leave->attachmentUrl($l)];
    }
}
