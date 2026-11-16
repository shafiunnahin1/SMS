<?php

namespace App\Http\Controllers\Syllabus;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{Batch, LessonPlan, SyllabusUnit, Teacher};
use App\Services\Syllabus\SyllabusService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D224 SYL.1: the full way - a lesson plan per batch, subject and date; "taught" covers its unit once, "skipped" does not. A teacher
// plans their own batches and subjects; the admin may plan for a teacher who teaches that batch's subject.
class LessonPlanController extends Controller
{
    public function __construct(private SyllabusService $syllabus) {}

    /** GET /lesson-plans?batch_id=&subject_id=&from=&to= */
    public function index(Request $request)
    {
        $f = $request->validate(['batch_id' => 'nullable|integer', 'subject_id' => 'nullable|integer', 'from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d']);
        $own = $this->syllabus->teacherOf($request->user());
        if ($request->user()->role === 'teacher' && !$own) return response()->json(['success' => true, 'data' => []]);
        $rows = LessonPlan::query()->when($own, fn ($q) => $q->where('teacher_id', $own->id))
            ->when($f['batch_id'] ?? null, fn ($q, $v) => $q->where('batch_id', $v))->when($f['subject_id'] ?? null, fn ($q, $v) => $q->where('subject_id', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->where('planned_date', '>=', $v))->when($f['to'] ?? null, fn ($q, $v) => $q->where('planned_date', '<=', $v))
            ->orderBy('planned_date')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($p) => self::row($p))->values()]);
    }

    /** GET /lesson-plans/assignments - D224 SYL.3: who teaches which subject in which batch (the screens' pickers). A teacher: their
     *  own rows; the admin and department staff: every row. Subject 0 (every subject) is spread over the batch's program subjects. */
    public function assignments(Request $request)
    {
        $own = $this->syllabus->teacherOf($request->user());
        if ($request->user()->role === 'teacher' && !$own) return response()->json(['success' => true, 'data' => []]);
        $rows = \App\Models\BatchTeacher::with(['batch:id,name,program_id', 'teacher:id,user_id,employee_id', 'teacher.user:id,name'])
            ->when($own, fn ($q) => $q->where('teacher_id', $own->id))->get();
        $subjects = \App\Models\Subject::whereIn('program_id', $rows->pluck('batch.program_id')->filter()->unique())->orderBy('id')->get(['id', 'program_id', 'name'])->groupBy('program_id');
        $out = [];
        foreach ($rows as $r) {
            if (!$r->batch) continue;
            $list = (int) $r->subject_id === 0 ? ($subjects->get($r->batch->program_id) ?? collect()) : ($subjects->get($r->batch->program_id) ?? collect())->where('id', (int) $r->subject_id);
            foreach ($list as $s) $out[$r->batch_id . ':' . $s->id . ':' . $r->teacher_id] = ['batch_id' => $r->batch_id, 'batch' => $r->batch->name, 'program_id' => $r->batch->program_id,
                'subject_id' => $s->id, 'subject' => $s->name, 'teacher_id' => $r->teacher_id, 'teacher' => $r->teacher?->user?->name ?? $r->teacher?->employee_id];
        }
        return response()->json(['success' => true, 'data' => array_values($out)]);
    }

    /** POST /lesson-plans */
    public function store(Request $request)
    {
        $f = $this->validated($request, true);
        $teacherId = $this->teacherFor($request, $f);
        $plan = LessonPlan::create($f + ['teacher_id' => $teacherId, 'status' => 'planned']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($plan)], 201);
    }

    /** PUT /lesson-plans/{id} - a planned one only */
    public function update(Request $request, int $id)
    {
        $plan = $this->mine($request, $id);
        if ($plan->status !== 'planned') throw new BusinessException(__('syllabus.plan_done'), 'plan_not_planned', 409);
        $f = $this->validated($request, false, $plan);
        $plan->update(array_diff_key($f, ['teacher_id' => 1]));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($plan->fresh())]);
    }

    /** DELETE /lesson-plans/{id} - a planned one only */
    public function destroy(Request $request, int $id)
    {
        $plan = $this->mine($request, $id);
        if ($plan->status !== 'planned') throw new BusinessException(__('syllabus.plan_done'), 'plan_not_planned', 409);
        $plan->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** POST /lesson-plans/{id}/taught */
    public function taught(Request $request, int $id) { return $this->mark($request, $id, 'taught'); }

    /** POST /lesson-plans/{id}/skipped */
    public function skipped(Request $request, int $id) { return $this->mark($request, $id, 'skipped'); }

    private function mark(Request $request, int $id, string $status)
    {
        $plan = $this->mine($request, $id);
        if ($plan->status !== 'planned') throw new BusinessException(__('syllabus.plan_done'), 'plan_not_planned', 409);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($this->syllabus->mark($plan, $status))]);
    }

    private function mine(Request $request, int $id): LessonPlan
    {
        $plan = LessonPlan::findOrFail($id);
        $own = $this->syllabus->teacherOf($request->user());
        if (!in_array($request->user()->role, ['admin', 'institution_staff'], true) && (!$own || (int) $plan->teacher_id !== (int) $own->id)) abort(404);
        return $plan;
    }

    private function validated(Request $request, bool $create, ?LessonPlan $plan = null): array
    {
        $inst = \App\Support\Tenancy::current()->id;
        $r = $create ? 'required' : 'sometimes';
        $f = $request->validate([
            'batch_id' => [$r, 'integer', Rule::exists('batches', 'id')->where('institution_id', $inst)],
            'subject_id' => [$r, 'integer', Rule::exists('subjects', 'id')->where('institution_id', $inst)],
            'unit_id' => ['nullable', 'integer'], 'planned_date' => [$r, 'date_format:Y-m-d'],
            'objective' => 'nullable|string|max:5000', 'activities' => 'nullable|string|max:5000', 'resources' => 'nullable|string|max:5000',
            'teacher_id' => 'nullable|integer', 'status' => 'prohibited']);
        $batch = Batch::findOrFail($f['batch_id'] ?? $plan->batch_id);
        $subject = (int) ($f['subject_id'] ?? $plan->subject_id);
        if (!empty($f['unit_id'])) {
            $unit = SyllabusUnit::findOrFail($f['unit_id']);
            if ((int) $unit->program_id !== (int) $batch->program_id || (int) $unit->subject_id !== $subject) {
                throw \Illuminate\Validation\ValidationException::withMessages(['unit_id' => __('syllabus.wrong_program')]);
            }
        }
        abort_unless($this->syllabus->mayTeach($request->user(), $batch->id, $subject), 403);
        return $f;
    }

    /** the teacher themself; the admin names a teacher who teaches that batch's subject */
    private function teacherFor(Request $request, array $f): int
    {
        $own = $this->syllabus->teacherOf($request->user());
        if ($own) return $own->id;
        $t = Teacher::find($f['teacher_id'] ?? 0);
        if (!$t || !\App\Models\BatchTeacher::where('batch_id', $f['batch_id'])->where('teacher_id', $t->id)->whereIn('subject_id', [0, $f['subject_id']])->exists()) {
            throw \Illuminate\Validation\ValidationException::withMessages(['teacher_id' => __('syllabus.no_teacher')]);
        }
        return $t->id;
    }

    public static function row(LessonPlan $p): array
    {
        return $p->only(['id', 'batch_id', 'subject_id', 'teacher_id', 'unit_id', 'objective', 'activities', 'resources', 'status']) + ['planned_date' => $p->planned_date->format('Y-m-d')];
    }
}
