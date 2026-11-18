<?php

namespace App\Http\Controllers\Transport;

use App\Http\Controllers\Controller;
use App\Models\{RouteStop, Student, TransportRoute};
use App\Services\Transport\TransportService;
use Illuminate\Http\Request;

// D229 TRN.1: put a student on a route (or move them) and take them off (staff.transport.manage); the student's and the parent's
// own read-only view (never another student list)
class TransportAssignmentController extends Controller
{
    public function __construct(private TransportService $transport) {}

    /** POST /transport/assign {student_id | student_code, route_id, stop_id?, direction?, started_on?} */
    public function assign(Request $request)
    {
        $f = $request->validate(['student_id' => 'required_without:student_code|integer', 'student_code' => 'required_without:student_id|string|max:50', 'route_id' => 'required|integer',
            'stop_id' => 'nullable|integer', 'direction' => 'nullable|in:both,pickup_only,drop_only', 'started_on' => 'nullable|date_format:Y-m-d']);
        $route = TransportRoute::findOrFail($f['route_id']);
        $student = isset($f['student_id']) ? Student::findOrFail($f['student_id']) : Student::where('student_id', trim($f['student_code']))->first();
        if (!$student) throw \Illuminate\Validation\ValidationException::withMessages(['student_code' => __('transport.no_student')]);
        $stop = !empty($f['stop_id']) ? RouteStop::findOrFail($f['stop_id']) : null;
        $row = $this->transport->assign($student, $route, $stop, $f['direction'] ?? 'both', $f['started_on'] ?? null);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $row->id, 'student_id' => $student->id, 'route_id' => $row->route_id,
            'stop_id' => $row->stop_id, 'direction' => $row->direction, 'started_on' => $row->started_on->toDateString()]], 201);
    }

    /** POST /transport/students/{id}/unassign {ended_on?} */
    public function unassign(Request $request, int $id)
    {
        $student = Student::findOrFail($id);
        $f = $request->validate(['ended_on' => 'nullable|date_format:Y-m-d']);
        $row = $this->transport->unassign($student, $f['ended_on'] ?? null);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $row->id, 'ended_on' => $row->ended_on->toDateString()]]);
    }

    /** GET /student/transport */
    public function mine(Request $request)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        return response()->json(['success' => true, 'data' => $this->transport->forStudent($s)]);
    }

    /** GET /parent/children/{id}/transport */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        return response()->json(['success' => true, 'data' => $this->transport->forStudent($s)]);
    }
}
