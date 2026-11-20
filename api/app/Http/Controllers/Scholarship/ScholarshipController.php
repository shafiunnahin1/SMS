<?php

namespace App\Http\Controllers\Scholarship;

use App\Http\Controllers\Controller;
use App\Models\{AcademicYear, AuditLog, Scholarship, Student};
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D236 SCH.1 (advanced-features.md section 8): the admin and staff with staff.scholarship.manage keep scholarships (read with
// staff.scholarship.read). Exactly one benefit: a fixed amount (a grant) or a percentage of the monthly tuition. Never deleted -
// closed instead. Parents and students see the open ones.
class ScholarshipController extends Controller
{
    /** GET /scholarships?status= */
    public function index(Request $request)
    {
        $f = $request->validate(['status' => 'nullable|in:open,closed,awarded']);
        $rows = Scholarship::with('academicYear:id,name')->withCount(['applications', 'applications as pending_count' => fn ($q) => $q->where('status', 'pending')])
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))->orderByDesc('id')->limit(200)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($s) => self::row($s))->values()]);
    }

    /** POST /scholarships */
    public function store(Request $request)
    {
        $f = $request->validate($this->fields(true));
        $this->oneBenefit($f);
        $f['academic_year_id'] = $this->year($f['academic_year_id'] ?? null);
        $s = Scholarship::create($f + ['available_slots' => $f['total_slots'] ?? null, 'status' => 'open']);
        AuditLog::record('scholarship.created', $s);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($s->fresh('academicYear:id,name'))], 201);
    }

    /** PUT /scholarships/{id} - text, deadline and slots; the benefit is fixed once anyone applied */
    public function update(Request $request, int $id)
    {
        $s = Scholarship::findOrFail($id);
        $f = $request->validate($this->fields(false));
        $applied = $s->applications()->exists();
        if ($applied && (array_key_exists('amount', $f) || array_key_exists('percentage', $f) || array_key_exists('academic_year_id', $f))) {
            throw ValidationException::withMessages(['amount' => __('scholarship.benefit_fixed')]);
        }
        if (array_key_exists('amount', $f) || array_key_exists('percentage', $f)) $this->oneBenefit(array_merge($s->only('amount', 'percentage'), $f));
        if (array_key_exists('academic_year_id', $f)) $f['academic_year_id'] = $this->year($f['academic_year_id']);
        if (array_key_exists('total_slots', $f)) {
            $taken = $s->applications()->where('status', 'approved')->count();
            if ($f['total_slots'] !== null && $f['total_slots'] < $taken) throw ValidationException::withMessages(['total_slots' => __('scholarship.slots_below_awarded')]);
            $f['available_slots'] = $f['total_slots'] === null ? null : $f['total_slots'] - $taken;
            if ($s->status !== 'closed') $f['status'] = $f['available_slots'] === 0 ? 'awarded' : 'open';
        }
        $was = $s->only(array_keys($f));
        $s->update($f);
        AuditLog::record('scholarship.updated', $s, ['was' => array_map(fn ($v) => $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : $v, $was)]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($s->fresh('academicYear:id,name'))]);
    }

    /** PATCH /scholarships/{id}/close - no more applications; decided awards stay */
    public function close(Request $request, int $id)
    {
        $s = Scholarship::findOrFail($id);
        if ($s->status !== 'closed') {
            $s->update(['status' => 'closed']);
            AuditLog::record('scholarship.closed', $s);
        }
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($s->fresh('academicYear:id,name'))]);
    }

    // ---- helpers ----

    private function fields(bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return ['name' => [$r, 'string', 'max:150'], 'description' => 'nullable|string|max:5000', 'criteria' => 'nullable|string|max:5000', 'funded_by' => 'nullable|string|max:150',
            'amount' => 'nullable|decimal:0,2|min:0.01|max:99999999.99', 'percentage' => 'nullable|decimal:0,2|min:0.01|max:100',
            'academic_year_id' => 'nullable|integer', 'total_slots' => 'nullable|integer|min:1|max:100000', 'application_deadline' => 'nullable|date_format:Y-m-d'];
    }

    private function oneBenefit(array $f): void
    {
        if (empty($f['amount']) === empty($f['percentage'])) throw ValidationException::withMessages(['amount' => __('scholarship.one_benefit')]);
    }

    private function year($id): ?int
    {
        if ($id === null) return null;
        if (!AcademicYear::whereKey($id)->exists()) throw ValidationException::withMessages(['academic_year_id' => __('validation.exists', ['attribute' => 'academic_year_id'])]);
        return (int) $id;
    }

    public static function row(Scholarship $s, bool $school = true): array
    {
        $r = ['id' => $s->id, 'name' => $s->name, 'description' => $s->description, 'criteria' => $s->criteria, 'funded_by' => $s->funded_by,
            'amount' => $s->amount, 'percentage' => $s->percentage, 'benefit' => $s->percentage !== null ? 'percentage' : 'amount',
            'academic_year' => $s->academicYear ? ['id' => $s->academicYear->id, 'name' => $s->academicYear->name] : null,
            'total_slots' => $s->total_slots, 'available_slots' => $s->available_slots,
            'application_deadline' => $s->application_deadline?->toDateString(), 'status' => $s->status, 'accepts_applications' => $s->acceptsApplications()];
        if ($school) $r += ['applications_count' => (int) ($s->applications_count ?? 0), 'pending_count' => (int) ($s->pending_count ?? 0)];
        return $r;
    }
}
