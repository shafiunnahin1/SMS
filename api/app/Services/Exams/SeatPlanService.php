<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Enrollment, Exam, ExamSeatPlan};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

// D213 CAL.3 (docs/modules/academic-calendar.md "Exam Seat Plan"): the exam's students (active enrollments of its program, or its
// batch) in batch then roll order fill the rooms in turn, seat 1..capacity, `columns` benches per row; generating again replaces the
// plan; one student moves to a free seat of a room of the plan.
class SeatPlanService
{
    public function students(Exam $exam): Collection
    {
        return Enrollment::with(['student.user:id,name', 'batch:id,name'])->where('program_id', $exam->program_id)->where('status', 'active')
            ->when($exam->batch_id, fn ($q) => $q->where('batch_id', $exam->batch_id))
            ->orderBy('batch_id')->orderBy('roll_no')->orderBy('student_id')->get()->unique('student_id')->values();
    }

    /** @param array<int, array{name: string, capacity: int, columns?: int}> $rooms */
    public function generate(Exam $exam, array $rooms): int
    {
        $enr = $this->students($exam);
        $capacity = array_sum(array_column($rooms, 'capacity'));
        if ($enr->isEmpty()) throw new BusinessException('no students', 'seat_no_students', 422);
        if ($capacity < $enr->count()) throw new BusinessException('not enough seats', 'seat_capacity_short', 422, ['students' => $enr->count(), 'seats' => $capacity]);
        DB::transaction(function () use ($exam, $rooms, $enr) {
            ExamSeatPlan::where('exam_id', $exam->id)->delete();
            $i = 0;
            foreach ($rooms as $room) {
                $cols = max(1, (int) ($room['columns'] ?? 5));
                for ($n = 1; $n <= $room['capacity'] && $i < $enr->count(); $n++, $i++) {
                    ExamSeatPlan::create(['exam_id' => $exam->id, 'student_id' => $enr[$i]->student_id, 'room_name' => $room['name'], 'seat_number' => (string) $n,
                        'seat_row' => intdiv($n - 1, $cols) + 1, 'column_number' => ($n - 1) % $cols + 1]);
                }
            }
            AuditLog::record('seat_plan.generated', $exam, ['rooms' => count($rooms), 'students' => $enr->count()]);
        });
        return $enr->count();
    }

    public function move(Exam $exam, int $studentId, string $room, string $seat): ExamSeatPlan
    {
        return DB::transaction(function () use ($exam, $studentId, $room, $seat) {
            $plan = ExamSeatPlan::where('exam_id', $exam->id)->lockForUpdate()->get();
            $row = $plan->firstWhere('student_id', $studentId) ?? abort(404);
            if (!$plan->contains('room_name', $room)) throw new BusinessException('no such room', 'seat_unknown_room', 422);
            if ($plan->first(fn ($p) => $p->room_name === $room && $p->seat_number === $seat && $p->id !== $row->id)) throw new BusinessException('seat taken', 'seat_taken', 422);
            $row->update(['room_name' => $room, 'seat_number' => $seat, 'seat_row' => null, 'column_number' => null]);
            AuditLog::record('seat_plan.moved', $exam, ['student_id' => $studentId]);
            return $row;
        });
    }
}
