<?php

namespace App\Services\Syllabus;

use App\Models\{AuditLog, Batch, BatchTeacher, LessonPlan, SyllabusCoverage, SyllabusUnit, Teacher, User};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

// D224 SYL.1 (docs/modules/syllabus.md): coverage counts LEAF units only (a parent is covered when all its children are - derived,
// never stored); 0 units = 0.00 percent. A unit is covered once per batch (taught lesson plans and ticks both land there). A teacher
// works on the batches and subjects they teach (batch_teachers: subject 0 = every subject); the admin on all. A help, never a penalty.
class SyllabusService
{
    public function teacherOf(User $u): ?Teacher
    {
        return $u->role === 'teacher' ? Teacher::where('user_id', $u->id)->first() : null;
    }

    /** May this user work on this batch's subject? Admin: always; teacher: through batch_teachers. */
    public function mayTeach(User $u, int $batchId, int $subjectId): bool
    {
        if ($u->role === 'admin') return true;
        $t = $this->teacherOf($u);
        return $t !== null && BatchTeacher::where('batch_id', $batchId)->where('teacher_id', $t->id)->whereIn('subject_id', [0, $subjectId])->exists();
    }

    public function units(int $programId, int $subjectId): Collection
    {
        return SyllabusUnit::where('program_id', $programId)->where('subject_id', $subjectId)->orderBy('sort_order')->orderBy('id')->get();
    }

    /** {percent, covered, leaves, tree} for a batch's subject; each node: id, title, term, leaf, covered (leaves: stored; parents: derived) */
    public function coverage(Batch $batch, int $subjectId): array
    {
        $units = $this->units($batch->program_id, $subjectId);
        $done = SyllabusCoverage::where('batch_id', $batch->id)->whereIn('unit_id', $units->pluck('id'))->get()->keyBy('unit_id');
        $kids = $units->groupBy(fn ($u) => (int) $u->parent_id);
        $leaves = $units->filter(fn ($u) => !$kids->has($u->id));
        $covered = $leaves->filter(fn ($u) => $done->has($u->id))->count();
        $node = function (SyllabusUnit $u) use (&$node, $kids, $done) {
            $children = ($kids->get($u->id) ?? collect())->map($node)->values()->all();
            $isLeaf = $children === [];
            return ['id' => $u->id, 'title' => $u->title, 'term' => $u->term, 'planned_periods' => $u->planned_periods, 'leaf' => $isLeaf,
                'covered' => $isLeaf ? $done->has($u->id) : collect($children)->every(fn ($c) => $c['covered']),
                'covered_on' => $isLeaf ? $done->get($u->id)?->covered_on?->format('Y-m-d') : null, 'children' => $children];
        };
        return ['percent' => self::percent($covered, $leaves->count()), 'covered' => $covered, 'leaves' => $leaves->count(),
            'tree' => ($kids->get(0) ?? collect())->map($node)->values()->all()];
    }

    /** "60.00" for 12 of 20; "0.00" when there are no units (never a division by zero) */
    public static function percent(int $covered, int $leaves): string
    {
        if ($leaves === 0) return '0.00';
        $hundredths = intdiv($covered * 10000 * 2 + $leaves, $leaves * 2);   // percent x 100, rounded half up, whole numbers only
        return sprintf('%d.%02d', intdiv($hundredths, 100), $hundredths % 100);
    }

    /** Tick a unit covered in a batch (idempotent); returns the row */
    public function cover(Batch $batch, SyllabusUnit $unit, int $teacherId, ?string $note, ?string $on = null): SyllabusCoverage
    {
        abort_unless((int) $unit->program_id === (int) $batch->program_id, 422, __('syllabus.wrong_program'));
        return DB::transaction(function () use ($batch, $unit, $teacherId, $note, $on) {
            $row = SyllabusCoverage::where('batch_id', $batch->id)->where('unit_id', $unit->id)->lockForUpdate()->first();
            if ($row) return $row;
            $row = SyllabusCoverage::create(['batch_id' => $batch->id, 'unit_id' => $unit->id, 'teacher_id' => $teacherId, 'covered_on' => $on ?? now()->toDateString(), 'note' => $note]);
            AuditLog::record('syllabus.covered', $row);
            return $row;
        });
    }

    public function uncover(Batch $batch, SyllabusUnit $unit): void
    {
        $row = SyllabusCoverage::where('batch_id', $batch->id)->where('unit_id', $unit->id)->first();
        if (!$row) return;
        AuditLog::record('syllabus.uncovered', $row, ['unit_id' => $unit->id, 'batch_id' => $batch->id]);
        $row->delete();
    }

    /** planned -> taught (covers its unit in its batch once) | skipped */
    public function mark(LessonPlan $plan, string $status): LessonPlan
    {
        return DB::transaction(function () use ($plan, $status) {
            $plan = LessonPlan::lockForUpdate()->findOrFail($plan->id);
            $plan->update(['status' => $status]);
            if ($status === 'taught' && $plan->unit_id && $plan->batch_id) {
                $this->cover(Batch::findOrFail($plan->batch_id), SyllabusUnit::findOrFail($plan->unit_id), $plan->teacher_id, null, now()->toDateString());
            }
            AuditLog::record('lesson_plan.' . $status, $plan);
            return $plan->fresh();
        });
    }

    /** Units planned before today and not covered in that batch (one row per batch and unit), optionally one teacher's */
    public function behind(?int $teacherId): Collection
    {
        return LessonPlan::query()->whereNotNull('unit_id')->whereNotNull('batch_id')->where('planned_date', '<', now()->toDateString())
            ->when($teacherId, fn ($q) => $q->where('teacher_id', $teacherId))
            ->whereNotExists(fn ($q) => $q->from('syllabus_coverage')->whereColumn('syllabus_coverage.batch_id', 'lesson_plans.batch_id')
                ->whereColumn('syllabus_coverage.unit_id', 'lesson_plans.unit_id')->whereColumn('syllabus_coverage.institution_id', 'lesson_plans.institution_id'))
            ->orderBy('planned_date')->get()->unique(fn ($p) => $p->batch_id . ':' . $p->unit_id)->values();
    }
}
