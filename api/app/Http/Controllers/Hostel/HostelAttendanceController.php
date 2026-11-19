<?php

namespace App\Http\Controllers\Hostel;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Hostel, HostelAttendance, Student};
use App\Notifications\GeneralNotification;
use App\Services\Hostel\HostelService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// D233 HST.4: the night roll call - the hostel's residents on one sheet, present by default; submitting a night again updates it;
// a resident newly marked absent sends an in-app notice to the parents (no SMS). The student and the parent see their own nights.
class HostelAttendanceController extends Controller
{
    public function __construct(private HostelService $hostels) {}

    /** GET /hostel/{id}/attendance?date= */
    public function index(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['date' => 'nullable|date_format:Y-m-d|before_or_equal:today']);
        $date = $f['date'] ?? now()->toDateString();
        $marked = HostelAttendance::where('hostel_id', $h->id)->where('date', $date)->get()->keyBy('student_id');
        return response()->json(['success' => true, 'data' => ['date' => $date, 'taken' => $marked->isNotEmpty(), 'rows' => $this->hostels->residents($h, $date)->map(fn ($a) => [
            'student' => ['id' => $a->student_id, 'name' => $a->student?->user?->name, 'student_id' => $a->student?->student_id], 'room_number' => $a->room?->room_number,
            'status' => $marked[$a->student_id]->status ?? 'present'])->values()]]);
    }

    /** PUT /hostel/{id}/attendance {date, marks: [{student_id, status}]} - everyone not listed is present */
    public function store(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['date' => 'required|date_format:Y-m-d|before_or_equal:today', 'marks' => 'present|array|max:1000', 'marks.*.student_id' => 'required|integer', 'marks.*.status' => 'required|in:present,absent,leave']);
        $residents = $this->hostels->residents($h, $f['date'])->pluck('student_id')->all();
        $given = collect($f['marks'])->keyBy('student_id');
        if ($given->keys()->diff($residents)->isNotEmpty()) throw ValidationException::withMessages(['marks' => __('hostel.not_resident')]);
        $newlyAbsent = [];
        DB::transaction(function () use ($h, $f, $residents, $given, $request, &$newlyAbsent) {
            $before = HostelAttendance::where('hostel_id', $h->id)->where('date', $f['date'])->lockForUpdate()->get()->keyBy('student_id');
            foreach ($residents as $sid) {
                $status = $given[$sid]['status'] ?? 'present';
                $row = $before[$sid] ?? null;
                if ($row && $row->status === $status) continue;
                if ($row) $row->update(['status' => $status, 'marked_by' => $request->user()->id]);
                else HostelAttendance::create(['hostel_id' => $h->id, 'student_id' => $sid, 'date' => $f['date'], 'status' => $status, 'marked_by' => $request->user()->id]);
                if ($status === 'absent') $newlyAbsent[] = $sid;
            }
        });
        AuditLog::record('hostel.attendance', $h, ['date' => $f['date'], 'residents' => count($residents), 'absent' => $given->where('status', 'absent')->count()]);
        foreach (Student::with('parents')->whereIn('id', $newlyAbsent ?: [0])->get() as $s) {
            $s->parents->each(fn ($p) => $p->notify(new GeneralNotification(__('hostel.absent_title'), __('hostel.absent_body', ['hostel' => $h->name, 'date' => $f['date']]), 'hostel_absent', ['student_id' => $s->id, 'date' => $f['date']])));
        }
        return $this->index(new Request(['date' => $f['date']]), $h->id);
    }

    /** GET /student/hostel/attendance?month= */
    public function mine(Request $request)
    {
        return $this->history(Student::where('user_id', $request->user()->id)->firstOrFail(), $request);
    }

    /** GET /parent/children/{id}/hostel/attendance?month= */
    public function child(Request $request, int $id)
    {
        return $this->history(Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail(), $request);
    }

    private function history(Student $s, Request $request)
    {
        $f = $request->validate(['month' => 'nullable|date_format:Y-m']);
        $month = $f['month'] ?? now()->format('Y-m');
        $rows = HostelAttendance::where('student_id', $s->id)->where('date', 'like', $month . '-%')->orderBy('date')->get();
        return response()->json(['success' => true, 'data' => ['month' => $month, 'counts' => ['present' => $rows->where('status', 'present')->count(), 'absent' => $rows->where('status', 'absent')->count(), 'leave' => $rows->where('status', 'leave')->count()],
            'nights' => $rows->map(fn ($r) => ['date' => $r->date->toDateString(), 'status' => $r->status])->values()]]);
    }
}
