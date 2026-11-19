<?php

namespace App\Http\Controllers\Hostel;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Hostel, HostelVisitor, Student};
use App\Services\Hostel\HostelService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

// D233 HST.4: the visitor log - only a resident can be visited; entries are corrected (old values in the audit log), never deleted.
// The parent sees their own child's visitors.
class HostelVisitorController extends Controller
{
    public function __construct(private HostelService $hostels) {}

    /** GET /hostel/{id}/visitors?date= */
    public function index(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $day = Carbon::createFromFormat('Y-m-d', $f['date'] ?? now()->toDateString());
        $rows = HostelVisitor::with('student.user:id,name')->where('hostel_id', $h->id)->whereBetween('in_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()])->orderBy('in_at')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($v) => self::row($v))->values()]);
    }

    /** POST /hostel/{id}/visitors {student_id | student_code, visitor_name, relation?, phone?, purpose?, in_at?} */
    public function store(Request $request, int $id)
    {
        $h = Hostel::findOrFail($id);
        $f = $request->validate(['student_id' => 'required_without:student_code|integer', 'student_code' => 'required_without:student_id|string|max:50'] + $this->fields(true));
        $student = isset($f['student_id']) ? Student::findOrFail($f['student_id']) : Student::where('student_id', trim($f['student_code']))->first();
        if (!$student) throw ValidationException::withMessages(['student_code' => __('hostel.no_student')]);
        $in = isset($f['in_at']) ? Carbon::createFromFormat('Y-m-d H:i', $f['in_at']) : now();
        if (!$this->hostels->residents($h, $in->toDateString())->contains('student_id', $student->id)) throw ValidationException::withMessages(['student_code' => __('hostel.not_resident')]);
        $v = HostelVisitor::create(['hostel_id' => $h->id, 'student_id' => $student->id, 'visitor_name' => $f['visitor_name'], 'relation' => $f['relation'] ?? null, 'phone' => $f['phone'] ?? null,
            'purpose' => $f['purpose'] ?? null, 'in_at' => $in, 'recorded_by' => $request->user()->id]);
        AuditLog::record('hostel.visitor_in', $v);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($v->load('student.user:id,name'))], 201);
    }

    /** PUT /hostel/visitors/{id} {out_at?, visitor_name?, relation?, phone?, purpose?, in_at?} - the out time or a correction */
    public function update(Request $request, int $id)
    {
        $v = HostelVisitor::findOrFail($id);
        $f = $request->validate($this->fields(false) + ['out_at' => 'nullable|date_format:Y-m-d H:i']);
        if (isset($f['in_at'])) $f['in_at'] = Carbon::createFromFormat('Y-m-d H:i', $f['in_at']);
        if (array_key_exists('out_at', $f)) $f['out_at'] = $f['out_at'] ? Carbon::createFromFormat('Y-m-d H:i', $f['out_at']) : now();
        if (isset($f['out_at']) && $f['out_at']->lt($f['in_at'] ?? $v->in_at)) throw ValidationException::withMessages(['out_at' => __('hostel.out_before_in')]);
        $was = $v->only(array_keys($f));
        $v->update($f);
        AuditLog::record('hostel.visitor_updated', $v, ['was' => array_map(fn ($x) => $x instanceof \DateTimeInterface ? $x->format('Y-m-d H:i') : $x, $was)]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($v->fresh()->load('student.user:id,name'))]);
    }

    /** GET /parent/children/{id}/hostel/visitors - the last 100 */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        $rows = HostelVisitor::with('hostel:id,name')->where('student_id', $s->id)->orderByDesc('in_at')->limit(100)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($v) => self::row($v) + ['hostel' => $v->hostel?->name])->values()]);
    }

    private function fields(bool $create): array
    {
        return ['visitor_name' => [$create ? 'required' : 'sometimes', 'string', 'max:100'], 'relation' => 'nullable|string|max:50', 'phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9 -]{6,20}$/'],
            'purpose' => 'nullable|string|max:255', 'in_at' => 'nullable|date_format:Y-m-d H:i'];
    }

    public static function row(HostelVisitor $v): array
    {
        return ['id' => $v->id, 'visitor_name' => $v->visitor_name, 'relation' => $v->relation, 'phone' => $v->phone, 'purpose' => $v->purpose,
            'in_at' => $v->in_at->format('Y-m-d H:i'), 'out_at' => $v->out_at?->format('Y-m-d H:i'),
            'student' => ['id' => $v->student_id, 'name' => $v->relationLoaded('student') ? $v->student?->user?->name : null, 'student_id' => $v->relationLoaded('student') ? $v->student?->student_id : null]];
    }
}
