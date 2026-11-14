<?php

namespace App\Http\Controllers\Hifz;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Batch, HifzRecord, Student, Teacher};
use App\Services\Hifz\HifzService;
use App\Services\PdfService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D214 MAD.1 (docs/modules/madrasa.md section 1): hifz records - a teacher for the students of their batches, edits / deletes their
// own within 24 hours; the admin any time (audited); progress, the batch overview with the stale list, the timeline, the monthly PDF;
// a parent sees their child's progress only when settings.hifz.show_parents is on; the admin switches the module and its settings.
class HifzController extends Controller
{
    public function __construct(private HifzService $hifz) {}

    /** GET /hifz/records?student_id=&batch_id=&from=&to= */
    public function index(Request $request)
    {
        $f = $request->validate(['student_id' => 'nullable|integer', 'batch_id' => 'nullable|integer', 'from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d', 'page' => 'nullable|integer|min:1']);
        $teacher = $this->teacher($request);
        $q = HifzRecord::with('student.user:id,name')->orderByDesc('record_date')->orderByDesc('id')
            ->when($f['student_id'] ?? null, fn ($w, $s) => $w->where('student_id', $s))
            ->when($f['batch_id'] ?? null, fn ($w, $b) => $w->whereIn('student_id', \App\Models\Enrollment::where('batch_id', $b)->where('status', 'active')->pluck('student_id')))
            ->when($f['from'] ?? null, fn ($w, $d) => $w->where('record_date', '>=', $d))->when($f['to'] ?? null, fn ($w, $d) => $w->where('record_date', '<=', $d))
            ->when($teacher, fn ($w) => $w->whereIn('student_id', \App\Models\Enrollment::whereIn('batch_id', $this->hifz->teacherBatchIds($teacher) ?: [0])->where('status', 'active')->pluck('student_id')));
        $page = $q->paginate(50);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($r) => $this->row($r))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    public function store(Request $request)
    {
        $d = $this->validated($request);
        $teacher = $this->teacher($request);
        if ($teacher && !$this->hifz->teacherHas($teacher, $d['student_id'])) abort(404);
        $r = HifzRecord::create($d + ['teacher_id' => $teacher?->id]);
        AuditLog::record('hifz.created', $r, ['student_id' => $r->student_id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($r->load('student.user:id,name'))], 201);
    }

    public function update(Request $request, int $id)
    {
        $r = $this->editable($request, $id);
        $d = $this->validated($request, $r->student_id);
        $r->update($d);
        AuditLog::record('hifz.updated', $r, ['student_id' => $r->student_id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($r->load('student.user:id,name'))]);
    }

    public function destroy(Request $request, int $id)
    {
        $r = $this->editable($request, $id);
        $r->delete();
        AuditLog::record('hifz.deleted', $r, ['student_id' => $r->student_id]);
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /hifz/students/{id}/progress - progress and the timeline (newest 100) */
    public function progress(Request $request, int $id)
    {
        $s = $this->student($request, $id);
        return response()->json(['success' => true, 'data' => $this->summary($s)]);
    }

    /** GET /hifz/batches/{id}/overview?stale_days= */
    public function overview(Request $request, int $id)
    {
        $f = $request->validate(['stale_days' => 'nullable|integer|min:1|max:365']);
        $b = Batch::findOrFail($id);
        $teacher = $this->teacher($request);
        if ($teacher && !in_array($b->id, $this->hifz->teacherBatchIds($teacher), true)) abort(404);
        $days = $f['stale_days'] ?? $this->hifz->settings()['stale_days'];
        return response()->json(['success' => true, 'data' => ['batch' => ['id' => $b->id, 'name' => $b->name], 'stale_days' => $days, 'students' => $this->hifz->overview($b, $days)]]);
    }

    /** GET /hifz/reports/monthly.pdf?student_id=&month= */
    public function monthly(Request $request)
    {
        $f = $request->validate(['student_id' => 'required|integer', 'month' => 'required|date_format:Y-m']);
        $s = $this->student($request, $f['student_id']);
        $rows = HifzRecord::where('student_id', $s->id)->where('record_date', 'like', $f['month'] . '-%')->orderBy('record_date')->orderBy('id')->get();
        $pdf = app(PdfService::class)->render('pdf.hifz-monthly', ['student' => $s->load('user:id,name'), 'month' => $f['month'], 'rows' => $rows, 'progress' => $this->hifz->progress($s)], 'a4');
        return response($pdf, 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="hifz-' . $s->student_id . '-' . $f['month'] . '.pdf"', 'Cache-Control' => 'no-store']);
    }

    /** GET /parent/children/{id}/hifz - only when the institution shows it to parents */
    public function child(Request $request, int $id)
    {
        $s = Student::whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        if (!$this->hifz->settings()['show_parents']) throw new BusinessException('hidden from parents', 'hifz_hidden_from_parents', 403);
        return response()->json(['success' => true, 'data' => $this->summary($s)]);
    }

    /** GET /admin/settings/hifz */
    public function settings()
    {
        return response()->json(['success' => true, 'data' => $this->settingsRow()]);
    }

    /** PUT /admin/settings/hifz {enabled, pages_per_para, stale_days, show_parents} */
    public function updateSettings(Request $request)
    {
        $d = $request->validate(['enabled' => 'required|boolean', 'pages_per_para' => 'required|numeric|min:1|max:100', 'stale_days' => 'required|integer|min:1|max:365', 'show_parents' => 'required|boolean']);
        $i = Tenancy::current();
        if (!in_array('hifz', config('institution_types.' . $i->institution_type . '.modules', []), true)) throw new BusinessException('not for this type', 'module_not_available', 422);
        $settings = $i->settings ?? [];
        $opt = array_values(array_diff($settings['opt_in_modules'] ?? [], ['hifz']));
        if ($d['enabled']) $opt[] = 'hifz';
        $settings['opt_in_modules'] = $opt;
        $settings['hifz'] = ['pages_per_para' => round((float) $d['pages_per_para'], 1), 'stale_days' => (int) $d['stale_days'], 'show_parents' => (bool) $d['show_parents']];
        $i->forceFill(['settings' => $settings])->save();
        AuditLog::record('hifz.settings', $i, ['enabled' => (bool) $d['enabled']]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->settingsRow()]);
    }

    private function settingsRow(): array
    {
        $i = Tenancy::current()->refresh();
        return ['enabled' => in_array('hifz', $i->settings['opt_in_modules'] ?? [], true)] + $this->hifz->settings($i);
    }

    private function summary(Student $s): array
    {
        $s->loadMissing('user:id,name');
        $timeline = HifzRecord::where('student_id', $s->id)->orderByDesc('record_date')->orderByDesc('id')->limit(100)->get()->map(fn ($r) => $this->row($r, false))->values();
        return ['student' => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id], 'progress' => $this->hifz->progress($s), 'timeline' => $timeline];
    }

    private function validated(Request $request, ?int $studentId = null): array
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'student_id' => [$studentId ? 'prohibited' : 'required', 'integer', Rule::exists('students', 'id')->where('institution_id', $t)],
            'record_date' => 'required|date_format:Y-m-d|before_or_equal:today', 'kind' => ['required', Rule::in(HifzRecord::KINDS)],
            'from_surah' => 'required|integer|between:1,114', 'from_ayah' => 'required|integer|min:1|max:999',
            'to_surah' => 'required|integer|between:1,114', 'to_ayah' => 'required|integer|min:1|max:999',
            'para_no' => 'nullable|integer|between:1,30', 'pages' => 'nullable|numeric|min:0|max:999.9', 'quality' => 'nullable|integer|between:1,5',
            'mistakes' => 'nullable|integer|min:0|max:9999', 'remarks' => 'nullable|string|max:255',
        ]);
        if ([$d['from_surah'], $d['from_ayah']] > [$d['to_surah'], $d['to_ayah']]) throw new BusinessException('from after to', 'hifz_range_order', 422);
        if (isset($d['pages'])) $d['pages'] = number_format(round((float) $d['pages'], 1), 1, '.', '');
        return $d;
    }

    /** a teacher's own record within 24 hours; the admin's any time */
    private function editable(Request $request, int $id): HifzRecord
    {
        $r = HifzRecord::findOrFail($id);
        $teacher = $this->teacher($request);
        if ($teacher) {
            if ($r->teacher_id !== $teacher->id) abort(404);
            if ($r->created_at && $r->created_at->lt(now()->subDay())) throw new BusinessException('older than 24 hours', 'hifz_edit_window', 422);
        }
        return $r;
    }

    private function student(Request $request, int $id): Student
    {
        $s = Student::findOrFail($id);
        $teacher = $this->teacher($request);
        if ($teacher && !$this->hifz->teacherHas($teacher, $s->id)) abort(404);
        return $s;
    }

    private function teacher(Request $request): ?Teacher
    {
        return $request->user()->role === 'teacher' ? Teacher::where('user_id', $request->user()->id)->firstOrFail() : null;
    }

    private function row(HifzRecord $r, bool $withStudent = true): array
    {
        return ['id' => $r->id, 'record_date' => $r->record_date->toDateString(), 'kind' => $r->kind, 'from' => [$r->from_surah, $r->from_ayah], 'to' => [$r->to_surah, $r->to_ayah],
            'para_no' => $r->para_no, 'pages' => $r->pages, 'quality' => $r->quality, 'mistakes' => $r->mistakes, 'remarks' => $r->remarks, 'teacher_id' => $r->teacher_id,
            'created_at' => $r->created_at?->toIso8601String()]
            + ($withStudent ? ['student' => ['id' => $r->student_id, 'name' => $r->student?->user?->name, 'student_id' => $r->student?->student_id]] : []);
    }
}
