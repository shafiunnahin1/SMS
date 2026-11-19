<?php

namespace App\Http\Controllers\Hostel;

use App\Http\Controllers\Controller;
use App\Models\{HostelAllocation, HostelRoom, Student};
use App\Services\Hostel\HostelService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D233 HST.1: put a student in a room (by id or ID card number; a room change ends the old allocation), check out, and the list
class HostelAllocationController extends Controller
{
    public function __construct(private HostelService $hostels) {}

    /** GET /hostel/allocations?hostel_id=&status=active|checked_out */
    public function index(Request $request)
    {
        $f = $request->validate(['hostel_id' => 'nullable|integer', 'status' => 'nullable|in:active,checked_out']);
        $rows = HostelAllocation::with(['student.user:id,name', 'room.hostel:id,name'])->where('status', $f['status'] ?? 'active')
            ->when($f['hostel_id'] ?? null, fn ($q, $h) => $q->whereIn('room_id', HostelRoom::where('hostel_id', $h)->select('id')))
            ->orderByDesc('check_in_date')->limit(1000)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($a) => self::row($a))->values()]);
    }

    /** POST /hostel/allocate {student_id | student_code, room_id, check_in_date?} */
    public function allocate(Request $request)
    {
        $f = $request->validate(['student_id' => 'required_without:student_code|integer', 'student_code' => 'required_without:student_id|string|max:50',
            'room_id' => 'required|integer', 'check_in_date' => 'nullable|date_format:Y-m-d']);
        $room = HostelRoom::findOrFail($f['room_id']);
        $student = isset($f['student_id']) ? Student::findOrFail($f['student_id']) : Student::where('student_id', trim($f['student_code']))->first();
        if (!$student) throw ValidationException::withMessages(['student_code' => __('hostel.no_student')]);
        $a = $this->hostels->allocate($student, $room, $f['check_in_date'] ?? null);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a->load(['student.user:id,name', 'room.hostel:id,name']))], 201);
    }

    /** PATCH /hostel/allocations/{id}/checkout {check_out_date?} */
    public function checkout(Request $request, int $id)
    {
        $a = HostelAllocation::findOrFail($id);
        $f = $request->validate(['check_out_date' => 'nullable|date_format:Y-m-d']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($this->hostels->checkout($a, $f['check_out_date'] ?? null)->load(['student.user:id,name', 'room.hostel:id,name']))]);
    }

    public static function row(HostelAllocation $a): array
    {
        return ['id' => $a->id, 'status' => $a->status, 'check_in_date' => $a->check_in_date->toDateString(), 'check_out_date' => $a->check_out_date?->toDateString(),
            'student' => ['id' => $a->student_id, 'name' => $a->student?->user?->name, 'student_id' => $a->student?->student_id, 'gender' => $a->student?->gender],
            'room' => ['id' => $a->room_id, 'room_number' => $a->room?->room_number, 'floor' => (int) ($a->room?->floor ?? 1)],
            'hostel' => ['id' => $a->room?->hostel_id, 'name' => $a->room?->hostel?->name]];
    }
}
