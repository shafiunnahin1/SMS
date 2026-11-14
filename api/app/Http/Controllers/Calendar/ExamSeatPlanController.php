<?php

namespace App\Http\Controllers\Calendar;

use App\Http\Controllers\Controller;
use App\Models\{Exam, ExamSeatPlan};
use App\Services\Exams\SeatPlanService;
use App\Services\PdfService;
use Illuminate\Http\Request;

// D213 CAL.3: the admin generates an exam's seat plan from rooms and seats per room, sees it room by room, moves one student
// to a free seat, and prints a room-wise PDF (docs/API.md "seat-plan").
class ExamSeatPlanController extends Controller
{
    public function __construct(private SeatPlanService $seats) {}

    /** POST /exams/{id}/seat-plan/generate {rooms: [{name, capacity, columns?}]} */
    public function generate(Request $request, int $id)
    {
        $exam = Exam::findOrFail($id);
        $d = $request->validate(['rooms' => 'required|array|min:1|max:50', 'rooms.*.name' => 'required|string|max:50|distinct',
            'rooms.*.capacity' => 'required|integer|min:1|max:500', 'rooms.*.columns' => 'nullable|integer|min:1|max:20']);
        $n = $this->seats->generate($exam, $d['rooms']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->plan($exam) + ['placed' => $n]], 201);
    }

    /** GET /exams/{id}/seat-plan */
    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->plan(Exam::findOrFail($id))]);
    }

    /** PUT /exams/{id}/seat-plan/{studentId} {room_name, seat_number} */
    public function adjust(Request $request, int $id, int $studentId)
    {
        $exam = Exam::findOrFail($id);
        $d = $request->validate(['room_name' => 'required|string|max:50', 'seat_number' => 'required|string|max:20']);
        $this->seats->move($exam, $studentId, $d['room_name'], $d['seat_number']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->plan($exam)]);
    }

    /** GET /exams/{id}/seat-plan/print */
    public function print(int $id)
    {
        $exam = Exam::with('program:id,name')->findOrFail($id);
        $plan = $this->plan($exam);
        abort_if($plan['rooms'] === [], 404);
        $pdf = app(PdfService::class)->render('pdf.seat-plan', ['exam' => $exam, 'rooms' => $plan['rooms']], 'a4');
        return response($pdf, 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="seat-plan-' . $exam->id . '.pdf"', 'Cache-Control' => 'no-store']);
    }

    private function plan(Exam $exam): array
    {
        $rows = ExamSeatPlan::with(['student.user:id,name'])->where('exam_id', $exam->id)->get();
        $rolls = \App\Models\Enrollment::with('batch:id,name')->where('program_id', $exam->program_id)->where('status', 'active')->whereIn('student_id', $rows->pluck('student_id'))
            ->get()->keyBy('student_id');
        $rooms = [];
        foreach ($rows as $r) {
            $e = $rolls[$r->student_id] ?? null;
            $rooms['r' . $r->room_name][] = ['student_id' => $r->student_id, 'code' => $r->student?->student_id, 'name' => $r->student?->user?->name, 'roll' => $e?->roll_no,
                'batch' => $e?->batch?->name, 'seat_number' => $r->seat_number, 'row' => $r->seat_row, 'column' => $r->column_number];
        }
        $out = [];
        foreach ($rooms as $name => $seats) {   // keys carry a prefix so a room named '101' stays a string
            usort($seats, fn ($a, $b) => strnatcmp($a['seat_number'], $b['seat_number']));
            $out[] = ['name' => substr($name, 1), 'seats' => $seats];
        }
        usort($out, fn ($a, $b) => strnatcmp($a['name'], $b['name']));
        return ['exam' => ['id' => $exam->id, 'name' => $exam->name], 'rooms' => $out, 'students' => $this->seats->students($exam)->count()];
    }
}
