<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Services\StaffAttendanceGrantService;
use Illuminate\Http\Request;

// D169 (4) STW.5: the head / admin or a batch's teacher in charge lets a staff member take that batch's attendance, and revokes it;
// staff list their own granted batches for the attendance page (owner 2026-10-27: only granted batches)
class AttendanceGrantController extends Controller
{
    public function __construct(private StaffAttendanceGrantService $grants) {}

    /** GET /batches/{id}/attendance-grants */
    public function index(Request $request, int $id)
    {
        return response()->json(['success' => true, 'data' => $this->grants->forBatch($request->user(), $id)]);
    }

    /** POST /batches/{id}/attendance-grants { user_id } */
    public function store(Request $request, int $id)
    {
        \App\Models\Batch::findOrFail($id);   // another institution's batch is a 404 before any validation
        $userId = (int) $request->validate(['user_id' => 'required|integer'])['user_id'];
        $grant = $this->grants->grant($request->user(), $id, $userId);
        return response()->json(['success' => true, 'data' => ['id' => $grant->id, 'batch_id' => $grant->batch_id, 'user_id' => $grant->user_id],
            'message' => __('messages.saved')], $grant->wasRecentlyCreated ? 201 : 200);
    }

    /** DELETE /attendance-grants/{id} */
    public function destroy(Request $request, int $id)
    {
        $this->grants->revoke($request->user(), $id);
        return response()->json(['success' => true, 'message' => __('messages.saved')]);
    }

    /** GET /staff/attendance-batches: the staff member's own active grants */
    public function mine(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->grants->myBatches($request->user())]);
    }
}
