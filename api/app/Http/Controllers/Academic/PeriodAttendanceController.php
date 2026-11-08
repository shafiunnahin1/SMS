<?php

namespace App\Http\Controllers\Academic;

use App\Http\Controllers\Controller;
use App\Models\{Batch, BatchTeacher, Routine, Teacher};
use App\Services\PeriodAttendanceService;
use Illuminate\Http\Request;

// D197 AAD.4 (academics-advanced.md section 3): the teacher's periods today, saving a period's attendance, the subject report
class PeriodAttendanceController extends Controller
{
    public function __construct(private PeriodAttendanceService $periods) {}

    /** GET /teacher/periods/today?date= (default today; not in the future) */
    public function today(Request $request)
    {
        $date = $request->validate(['date' => 'nullable|date_format:Y-m-d|before_or_equal:today'])['date'] ?? now()->toDateString();
        return response()->json(['success' => true, 'data' => ['date' => $date, 'periods' => $this->periods->today($request->user(), $date)] + $this->periods->settings()]);
    }

    /** POST /period-attendance { routine_id, date, records[] } */
    public function store(Request $request)
    {
        $r = Routine::findOrFail((int) $request->input('routine_id'));
        abort_unless($this->periods->canTake($request->user(), $r), 403);
        $data = $request->validate([
            'routine_id' => 'required|integer', 'date' => 'required|date_format:Y-m-d|before_or_equal:today',
            'records' => 'required|array|min:1|max:300', 'records.*.student_id' => 'required|integer|distinct',
            'records.*.status' => 'required|in:present,absent,late,leave', 'records.*.note' => 'nullable|string|max:255',
        ]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->periods->save($r, $data, $request->user())], 201);
    }

    /** GET /period-attendance/report?batch_id=&subject_id=&month=YYYY-MM - admin; a teacher for a batch they lead or teach */
    public function report(Request $request)
    {
        $d = $request->validate(['batch_id' => 'required|integer', 'subject_id' => 'required|integer', 'month' => 'required|date_format:Y-m']);
        $batch = Batch::findOrFail($d['batch_id']);
        if ($request->user()->role === 'teacher') {
            $t = Teacher::where('user_id', $request->user()->id)->value('id');
            abort_unless($t && ((int) $batch->teacher_id === (int) $t || BatchTeacher::where('batch_id', $batch->id)->where('teacher_id', $t)->exists()
                || Routine::where('teacher_id', $t)->where('subject_id', $d['subject_id'])->where('program_id', $batch->program_id)->exists()), 403);
        }
        return response()->json(['success' => true, 'data' => $this->periods->report($batch->id, (int) $d['subject_id'], $d['month'])]);
    }
}
