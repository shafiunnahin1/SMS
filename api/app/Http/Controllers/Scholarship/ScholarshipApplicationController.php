<?php

namespace App\Http\Controllers\Scholarship;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Scholarship, ScholarshipApplication, Student};
use App\Services\Scholarship\ScholarshipService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D236 SCH.1: a parent applies for their child, a student for themself, the office for any student; one application per student per
// scholarship; the admin / staff with staff.scholarship.manage decide once (an approval can be revoked); in-app notices, no SMS.
class ScholarshipApplicationController extends Controller
{
    public function __construct(private ScholarshipService $service) {}

    /** POST /scholarships/{id}/apply */
    public function apply(Request $request, int $id)
    {
        $s = Scholarship::findOrFail($id);
        $u = $request->user();
        $f = $request->validate(['student_id' => $u->role === 'student' ? 'prohibited' : 'required|integer',
            'reason' => 'required|string|max:2000', 'gpa' => 'nullable|decimal:0,2|min:0|max:5', 'household_income' => 'nullable|string|max:100']);
        $student = match ($u->role) {
            'student' => Student::where('user_id', $u->id)->firstOrFail(),
            'parent'  => Student::whereKey($f['student_id'])->whereHas('parents', fn ($q) => $q->whereKey($u->id))->firstOrFail(),
            default   => Student::findOrFail($f['student_id']),
        };
        if (!$s->acceptsApplications()) throw ValidationException::withMessages(['scholarship' => __('scholarship.not_accepting')]);
        if (ScholarshipApplication::where('scholarship_id', $s->id)->where('student_id', $student->id)->exists()) throw ValidationException::withMessages(['student_id' => __('scholarship.already_applied')]);
        try {
            $a = ScholarshipApplication::create(['scholarship_id' => $s->id, 'student_id' => $student->id, 'reason' => $f['reason'], 'gpa' => $f['gpa'] ?? null,
                'household_income' => $f['household_income'] ?? null, 'status' => 'pending']);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['student_id' => __('scholarship.already_applied')]);
        }
        AuditLog::record('scholarship.applied', $a);
        return response()->json(['success' => true, 'message' => __('scholarship.applied'), 'data' => self::row($a->load(['scholarship', 'student.user:id,name']), $u->role === 'admin' || $u->role === 'institution_staff')], 201);
    }

    /** GET /scholarships/{id}/applications?status= */
    public function index(Request $request, int $id)
    {
        $s = Scholarship::findOrFail($id);
        $f = $request->validate(['status' => 'nullable|in:pending,approved,rejected']);
        $rows = ScholarshipApplication::with(['student.user:id,name', 'approver:id,name'])->where('scholarship_id', $s->id)
            ->when($f['status'] ?? null, fn ($q, $st) => $q->where('status', $st))->orderBy('id')->get();
        return response()->json(['success' => true, 'data' => ['scholarship' => ScholarshipController::row($s->loadCount('applications')), 'applications' => $rows->map(fn ($a) => self::row($a))->values()]]);
    }

    /** PATCH /scholarships/applications/{id}/award  {decision: approved|rejected} */
    public function award(Request $request, int $id)
    {
        $a = ScholarshipApplication::findOrFail($id);
        $f = $request->validate(['decision' => 'required|in:approved,rejected']);
        $a = $this->service->decide($request->user(), $a, $f['decision']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a->fresh(['scholarship', 'student.user:id,name', 'approver:id,name']))]);
    }

    /** PATCH /scholarships/applications/{id}/revoke  {reason} */
    public function revoke(Request $request, int $id)
    {
        $a = ScholarshipApplication::findOrFail($id);
        $f = $request->validate(['reason' => 'required|string|max:500']);
        $a = $this->service->revoke($request->user(), $a, $f['reason']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a->fresh(['scholarship', 'student.user:id,name', 'approver:id,name']))]);
    }

    /** GET /student/scholarships - the open scholarships and the student's own applications */
    public function mine(Request $request)
    {
        return $this->family(Student::where('user_id', $request->user()->id)->firstOrFail());
    }

    /** GET /parent/children/{id}/scholarships */
    public function child(Request $request, int $id)
    {
        return $this->family(Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail());
    }

    private function family(Student $student)
    {
        $apps = ScholarshipApplication::with('scholarship')->where('student_id', $student->id)->orderByDesc('id')->get();
        $open = Scholarship::where('status', 'open')->orderBy('application_deadline')->orderBy('id')->get()->filter(fn ($s) => $s->acceptsApplications());
        return response()->json(['success' => true, 'data' => [
            'open' => $open->map(fn ($s) => ScholarshipController::row($s, false) + ['applied' => $apps->contains('scholarship_id', $s->id)])->values(),
            'applications' => $apps->map(fn ($a) => self::row($a, false))->values(),
        ]]);
    }

    public static function row(ScholarshipApplication $a, bool $school = true): array
    {
        $r = ['id' => $a->id, 'scholarship' => ['id' => $a->scholarship_id, 'name' => $a->scholarship?->name, 'benefit' => $a->scholarship?->percentage !== null ? 'percentage' : 'amount',
                'amount' => $a->scholarship?->amount, 'percentage' => $a->scholarship?->percentage],
            'status' => $a->status, 'awarded_amount' => $a->awarded_amount, 'reason' => $a->reason, 'gpa' => $a->gpa, 'household_income' => $a->household_income,
            'applied_at' => $a->created_at?->toIso8601String()];
        if ($school) $r += ['student' => ['id' => $a->student_id, 'name' => $a->student?->user?->name, 'student_id' => $a->student?->student_id],
            'decided_by' => $a->approved_by ? ['id' => $a->approved_by, 'name' => $a->approver?->name] : null];
        return $r;
    }
}
