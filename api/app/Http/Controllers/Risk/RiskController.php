<?php

namespace App\Http\Controllers\Risk;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Batch, BatchTeacher, Enrollment, RiskFlag, Student, Teacher};
use App\Services\Risk\{RiskEvaluator, RiskNotifier, RiskRules};
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D216 RISK.2 (docs/modules/risk-alerts.md section 4): the current "needs support" flags with their why - the admin all, a teacher
// only the batches they teach; acknowledge (note) and resolve; the admin's thresholds and "evaluate now" for this institution only.
// Students, parents and accountants have no route here.
class RiskController extends Controller
{
    public function __construct(private RiskRules $rules) {}

    /** GET /risk/flags?batch_id=&level=&status= - one row per student: the combined flag and the reasons behind it */
    public function index(Request $request)
    {
        $f = $request->validate(['batch_id' => 'nullable|integer', 'level' => 'nullable|in:watch,high', 'status' => 'nullable|in:open,acknowledged,resolved', 'page' => 'nullable|integer|min:1']);
        $q = RiskFlag::with(['student.user:id,name', 'batch:id,name'])->where('kind', 'combined')
            ->when($f['status'] ?? null, fn ($w, $s) => $w->where('status', $s), fn ($w) => $w->where('status', '!=', 'resolved'))
            ->when($f['level'] ?? null, fn ($w, $l) => $w->where('level', $l))->when($f['batch_id'] ?? null, fn ($w, $b) => $w->where('batch_id', $b));
        $this->scope($request, $q);
        $page = $q->orderByRaw("FIELD(level, 'high', 'watch')")->orderByDesc('computed_on')->orderByDesc('id')->paginate(50);
        $reasons = $this->reasons(collect($page->items())->pluck('student_id')->all());
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($r) => $this->row($r) + ['reasons' => $reasons[$r->student_id] ?? []])->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    /** GET /risk/students/{id} - the student's flags, newest first (history included) */
    public function student(Request $request, int $id)
    {
        $s = Student::with('user:id,name')->findOrFail($id);
        $batches = $this->teacherBatches($request);
        if ($batches !== null && !Enrollment::where('student_id', $s->id)->where('status', 'active')->whereIn('batch_id', $batches ?: [0])->exists()) abort(404);
        $rows = RiskFlag::with('batch:id,name')->where('student_id', $s->id)->orderByDesc('computed_on')->orderByDesc('id')->limit(100)->get();
        return response()->json(['success' => true, 'data' => ['student' => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id],
            'flags' => $rows->map(fn ($r) => $this->row($r, false))->values()]]);
    }

    /** POST /risk/flags/{id}/acknowledge {note} */
    public function acknowledge(Request $request, int $id)
    {
        $d = $request->validate(['note' => 'nullable|string|max:255']);
        $flag = $this->find($request, $id);
        if ($flag->status === 'resolved') throw new BusinessException('already resolved', 'risk_already_resolved', 422);
        $flag->update(['status' => 'acknowledged', 'acknowledged_by' => $request->user()->id, 'note' => $d['note'] ?? $flag->note]);
        AuditLog::record('risk.acknowledged', $flag, ['student_id' => $flag->student_id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($flag->load(['student.user:id,name', 'batch:id,name']))]);
    }

    /** POST /risk/flags/{id}/resolve {note} - by hand; it stays closed until the level changes or the condition clears */
    public function resolve(Request $request, int $id)
    {
        $d = $request->validate(['note' => 'nullable|string|max:255']);
        $flag = $this->find($request, $id);
        if ($flag->status === 'resolved') throw new BusinessException('already resolved', 'risk_already_resolved', 422);
        // the reasons behind a combined flag close with it
        $rows = $flag->kind === 'combined' ? RiskFlag::where('student_id', $flag->student_id)->where('status', '!=', 'resolved')->get() : collect([$flag]);
        foreach ($rows as $r) {
            $r->update(['status' => 'resolved', 'acknowledged_by' => $request->user()->id, 'note' => $r->id === $flag->id ? ($d['note'] ?? $r->note) : $r->note,
                'details' => ($r->details ?? []) + ['resolved_by_hand' => true]]);
        }
        AuditLog::record('risk.resolved', $flag, ['student_id' => $flag->student_id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($flag->fresh(['student.user:id,name', 'batch:id,name']))]);
    }

    /** GET /risk/settings */
    public function settings()
    {
        return response()->json(['success' => true, 'data' => $this->rules->thresholds()]);
    }

    /** PUT /risk/settings - the thresholds and notify_parents */
    public function updateSettings(Request $request)
    {
        $d = $request->validate([
            'window_days' => 'required|integer|between:7,90', 'attendance_watch' => 'required|numeric|between:1,100', 'attendance_high' => 'required|numeric|between:0,99|lt:attendance_watch',
            'consecutive_absent_high' => 'required|integer|between:2,30', 'marks_drop_watch' => 'required|numeric|between:1,99', 'marks_drop_high' => 'required|numeric|between:2,100|gt:marks_drop_watch',
            'dues_watch' => 'required|integer|between:1,11', 'dues_high' => 'required|integer|between:2,12|gt:dues_watch', 'notify_parents' => 'required|boolean',
        ]);
        $i = Tenancy::current();
        $settings = $i->settings ?? [];
        $settings['risk'] = ['notify_parents' => (bool) $d['notify_parents']] + array_map(fn ($v) => $v + 0, array_diff_key($d, ['notify_parents' => 1]));
        $i->forceFill(['settings' => $settings])->save();
        AuditLog::record('risk.settings', $i);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->rules->thresholds($i->refresh())]);
    }

    /** POST /risk/evaluate - now, this institution only */
    public function evaluate(RiskEvaluator $risk, RiskNotifier $notifier)
    {
        $written = $risk->run();
        $notifier->announce($written);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['written' => count($written)]]);
    }

    /** null = the admin (every batch); else the batch ids a teacher teaches (class teacher or a batch-teacher row) */
    private function teacherBatches(Request $request): ?array
    {
        if ($request->user()->role !== 'teacher') return null;
        $t = Teacher::where('user_id', $request->user()->id)->firstOrFail();
        return Batch::where('teacher_id', $t->id)->pluck('id')->merge(BatchTeacher::where('teacher_id', $t->id)->pluck('batch_id'))->unique()->map(fn ($x) => (int) $x)->values()->all();
    }

    private function scope(Request $request, $q): void
    {
        $batches = $this->teacherBatches($request);
        if ($batches !== null) $q->whereIn('batch_id', $batches ?: [0]);
    }

    private function find(Request $request, int $id): RiskFlag
    {
        $q = RiskFlag::whereKey($id);
        $this->scope($request, $q);
        return $q->firstOrFail();
    }

    /** student id => the live attendance / marks_drop / dues flags (the "why") */
    private function reasons(array $studentIds): array
    {
        $out = [];
        foreach (RiskFlag::whereIn('student_id', $studentIds ?: [0])->where('kind', '!=', 'combined')->where('status', '!=', 'resolved')->orderBy('id')->get() as $r) {
            $out[$r->student_id][] = ['kind' => $r->kind, 'level' => $r->level, 'details' => $r->details];
        }
        return $out;
    }

    private function row(RiskFlag $r, bool $withStudent = true): array
    {
        return ['id' => $r->id, 'kind' => $r->kind, 'level' => $r->level, 'status' => $r->status, 'score' => $r->score, 'details' => $r->details, 'computed_on' => $r->computed_on->toDateString(),
            'note' => $r->note, 'batch' => $r->batch ? ['id' => $r->batch->id, 'name' => $r->batch->name] : null]
            + ($withStudent ? ['student' => ['id' => $r->student_id, 'name' => $r->student?->user?->name, 'student_id' => $r->student?->student_id]] : []);
    }
}
