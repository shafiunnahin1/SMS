<?php

namespace App\Http\Controllers\Alumni;

use App\Http\Controllers\Controller;
use App\Models\{Alumnus, AuditLog, Enrollment, Student};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D243 ALM.1 (extended-features.md section 16): the admin and staff with staff.alumni.manage keep alumni (staff.alumni.read to see) -
// added from students whose enrollment ended (completed / dropped / transferred) or by hand; verified by the admin; deleted on request
// (audited without contact data). The public directory is off until the institution switches it on, lists only verified entries and
// only name, year, profession and current institution. No alumni login, no photo upload in this step.
class AlumniController extends Controller
{
    private const ENDED = ['completed', 'dropped', 'transferred'];

    /** GET /alumni?q=&year=&verified= */
    public function index(Request $request)
    {
        $f = $request->validate(['q' => 'nullable|string|max:100', 'year' => 'nullable|integer|min:1900|max:2100', 'verified' => 'nullable|boolean']);
        $rows = Alumnus::query()
            ->when(trim($f['q'] ?? '') !== '', fn ($q) => $q->where('name', 'like', '%' . trim($f['q']) . '%'))
            ->when($f['year'] ?? null, fn ($q, $y) => $q->where('graduation_year', $y))
            ->when(array_key_exists('verified', $f) && $f['verified'] !== null, fn ($q) => $q->where('is_verified', (bool) $f['verified']))
            ->orderByDesc('graduation_year')->orderBy('name')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($a) => self::row($a))->values()]);
    }

    /** GET /alumni/candidates - students with no active enrollment whose last enrollment ended, not yet alumni */
    public function candidates()
    {
        $taken = Alumnus::whereNotNull('student_id')->pluck('student_id');
        $students = Student::with('user:id,name')->whereNotIn('id', $taken)->whereDoesntHave('activeEnrollments')
            ->whereHas('enrollments', fn ($q) => $q->whereIn('status', self::ENDED))->orderBy('id')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $students->map(function ($s) {
            $e = $this->lastEnded($s);
            return ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id, 'last_class' => $e?->program?->name, 'status' => $e?->status, 'graduation_year' => $this->yearOf($e)];
        })->values()]);
    }

    /** POST /alumni/from-students {student_ids[], graduation_year?} */
    public function fromStudents(Request $request)
    {
        $f = $request->validate(['student_ids' => 'required|array|min:1|max:500', 'student_ids.*' => 'integer', 'graduation_year' => 'nullable|integer|min:1900|max:2100']);
        $made = [];
        foreach (Student::with('user:id,name')->whereIn('id', $f['student_ids'])->get() as $s) {
            if (Alumnus::where('student_id', $s->id)->exists()) continue;
            $e = $this->lastEnded($s);
            if (!$e || $s->activeEnrollments()->exists()) throw ValidationException::withMessages(['student_ids' => __('alumni.still_studying', ['name' => $s->user?->name ?? $s->student_id])]);
            $a = Alumnus::create(['student_id' => $s->id, 'name' => $s->user?->name ?? (string) $s->student_id, 'graduation_year' => $f['graduation_year'] ?? $this->yearOf($e),
                'last_class' => mb_substr((string) $e->program?->name, 0, 50) ?: null, 'is_verified' => false]);
            AuditLog::record('alumni.added', $a);
            $made[] = self::row($a);
        }
        return response()->json(['success' => true, 'message' => __('alumni.added', ['n' => count($made)]), 'data' => $made], 201);
    }

    /** POST /alumni - by hand */
    public function store(Request $request)
    {
        $a = Alumnus::create($request->validate($this->fields(true)) + ['is_verified' => false]);
        AuditLog::record('alumni.added', $a);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a)], 201);
    }

    /** GET /alumni/{id} */
    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => self::row(Alumnus::findOrFail($id))]);
    }

    /** PUT /alumni/{id} */
    public function update(Request $request, int $id)
    {
        $a = Alumnus::findOrFail($id);
        $f = $request->validate($this->fields(false));
        $a->update($f);
        AuditLog::record('alumni.updated', $a, ['fields' => array_keys($f)]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a->fresh())]);
    }

    /** PATCH /alumni/{id}/verify {verified} */
    public function verify(Request $request, int $id)
    {
        $a = Alumnus::findOrFail($id);
        $f = $request->validate(['verified' => 'required|boolean']);
        $a->update(['is_verified' => (bool) $f['verified']]);
        AuditLog::record($f['verified'] ? 'alumni.verified' : 'alumni.unverified', $a);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($a->fresh())]);
    }

    /** DELETE /alumni/{id} - on request; the audit keeps the name and year, never the contact data */
    public function destroy(int $id)
    {
        $a = Alumnus::findOrFail($id);
        AuditLog::record('alumni.deleted', $a, ['name' => $a->name, 'graduation_year' => $a->graduation_year]);
        $a->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /alumni/stats - counts per graduation year */
    public function stats()
    {
        $rows = Alumnus::selectRaw('graduation_year, count(*) as total, sum(case when is_verified = 1 then 1 else 0 end) as verified')->groupBy('graduation_year')->orderByDesc('graduation_year')->get();
        return response()->json(['success' => true, 'data' => ['total' => (int) $rows->sum('total'),
            'years' => $rows->map(fn ($r) => ['year' => (int) $r->graduation_year, 'total' => (int) $r->total, 'verified' => (int) $r->verified])->values()]]);
    }

    /** GET /alumni/settings and PUT /alumni/settings {directory} - the public directory switch (off by default) */
    public function settings(Request $request)
    {
        $i = Tenancy::current();
        if ($request->isMethod('put')) {
            $f = $request->validate(['directory' => 'required|boolean']);
            $settings = $i->settings ?? [];
            $settings['alumni'] = array_replace($settings['alumni'] ?? [], ['directory' => (bool) $f['directory']]);
            $i->forceFill(['settings' => $settings])->save();
            AuditLog::record('alumni.directory', $i, ['directory' => (bool) $f['directory']]);
        }
        return response()->json(['success' => true, 'data' => ['directory' => (bool) (($i->fresh()->settings ?? [])['alumni']['directory'] ?? false)]]);
    }

    /** GET /public/alumni?year= - no login; 404 while switched off; verified only; no contact data */
    public function directory(Request $request)
    {
        abort_unless((bool) ((Tenancy::current()->settings ?? [])['alumni']['directory'] ?? false), 404);
        $f = $request->validate(['year' => 'nullable|integer|min:1900|max:2100']);
        $rows = Alumnus::where('is_verified', true)->when($f['year'] ?? null, fn ($q, $y) => $q->where('graduation_year', $y))
            ->orderByDesc('graduation_year')->orderBy('name')->limit(1000)->get(['name', 'graduation_year', 'current_profession', 'current_institution']);
        return response()->json(['success' => true, 'data' => $rows->map(fn ($a) => ['name' => $a->name, 'graduation_year' => $a->graduation_year,
            'current_profession' => $a->current_profession, 'current_institution' => $a->current_institution])->values()]);
    }

    // ---- helpers ----

    private function lastEnded(Student $s): ?Enrollment
    {
        return Enrollment::with('program:id,name')->where('student_id', $s->id)->whereIn('status', self::ENDED)->orderByDesc('left_at')->orderByDesc('id')->first();
    }

    private function yearOf(?Enrollment $e): int
    {
        return (int) ($e?->left_at?->format('Y') ?? $e?->updated_at?->format('Y') ?? now()->format('Y'));
    }

    private function fields(bool $create): array
    {
        $r = $create ? 'required' : 'sometimes';
        return ['name' => [$r, 'string', 'max:100'], 'graduation_year' => [$r, 'integer', 'min:1900', 'max:2100'], 'last_class' => 'nullable|string|max:50',
            'current_institution' => 'nullable|string|max:150', 'current_profession' => 'nullable|string|max:150', 'email' => 'nullable|email|max:100',
            'phone' => 'nullable|string|max:20', 'address' => 'nullable|string|max:1000', 'achievements' => 'nullable|string|max:5000'];
    }

    public static function row(Alumnus $a): array
    {
        return ['id' => $a->id, 'student_id' => $a->student_id, 'name' => $a->name, 'graduation_year' => $a->graduation_year, 'last_class' => $a->last_class,
            'current_institution' => $a->current_institution, 'current_profession' => $a->current_profession, 'email' => $a->email, 'phone' => $a->phone,
            'address' => $a->address, 'achievements' => $a->achievements, 'is_verified' => (bool) $a->is_verified];
    }
}
