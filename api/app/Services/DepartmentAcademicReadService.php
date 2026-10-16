<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Batch, Teacher, User};
use Illuminate\Support\Collection;

/** D90 own academic resource predicate. HTTP context binding and module/feature gates remain caller obligations.
 * This does not open a route, select a department, map an old role or grant another academic action.
 */
class DepartmentAcademicReadService
{
    public function __construct(private DepartmentDutyPermissionService $permissions) {}

    public function ownBatches(User $actor, int $departmentId): Collection
    {
        if (!$this->permissions->has($actor, $departmentId, 'staff.batch.mine')) $this->forbidden();
        $teacher = Teacher::where('user_id', $actor->id)->where('status', 'active')->first();
        if (!$teacher) $this->forbidden();

        // The class-teacher OR subject-teacher predicate stays inside the same tenant and active batch set.
        // A legal same-tenant assignment FK alone does not prove its subject belongs to this batch's program.
        return Batch::with('program:id,name')->whereIn('status', ['upcoming', 'running'])
            ->where(fn ($q) => $q->where('teacher_id', $teacher->id)
                ->orWhereHas('subjectTeachers', fn ($assignment) => $assignment->where('teacher_id', $teacher->id)
                    ->whereHas('subject', fn ($subject) => $subject->whereColumn('subjects.program_id', 'batches.program_id'))))
            ->orderBy('program_id')->orderBy('name')->get();
    }

    private function forbidden(): never
    {
        throw new BusinessException('Forbidden', 'forbidden', 403);
    }
}
