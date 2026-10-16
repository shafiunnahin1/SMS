<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Batch, Program, Teacher, User};
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/** D90 own academic resource predicate. HTTP context binding and module/feature gates remain caller obligations.
 * This does not open a route, select a department, map an old role or grant another academic action.
 */
class DepartmentAcademicReadService
{
    public function __construct(private DepartmentDutyPermissionService $permissions) {}

    public function ownBatches(User $actor, int $departmentId): Collection
    {
        return $this->batches($actor, $departmentId, 'staff.batch.mine')->with('program:id,name')
            ->orderBy('program_id')->orderBy('name')->get();
    }

    public function ownPrograms(User $actor, int $departmentId): Collection
    {
        return Program::whereIn('id', $this->batches($actor, $departmentId, 'staff.program.index')->select('program_id'))
            ->orderBy('sort_order')->orderBy('numeric_name')->orderBy('name')->get(['id', 'name']);
    }

    private function batches(User $actor, int $departmentId, string $permission): Builder
    {
        if (!$this->permissions->has($actor, $departmentId, $permission)) $this->forbidden();
        $teacher = Teacher::where('user_id', $actor->id)->where('status', 'active')->first();
        if (!$teacher) $this->forbidden();

        // The class-teacher OR subject-teacher predicate stays inside the same tenant and active batch set.
        // A legal same-tenant assignment FK alone does not prove its subject belongs to this batch's program.
        return Batch::whereIn('status', ['upcoming', 'running'])
            ->where(fn ($q) => $q->where('teacher_id', $teacher->id)
                ->orWhereHas('subjectTeachers', fn ($assignment) => $assignment->where('teacher_id', $teacher->id)
                    ->whereHas('subject', fn ($subject) => $subject->whereColumn('subjects.program_id', 'batches.program_id'))));
    }

    private function forbidden(): never
    {
        throw new BusinessException('Forbidden', 'forbidden', 403);
    }
}
