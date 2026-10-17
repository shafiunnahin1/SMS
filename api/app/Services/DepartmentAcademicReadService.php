<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Batch, BatchTeacher, Program, Subject, Teacher, User};
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/** D90 own academic resource predicate. HTTP context binding and module/feature gates remain caller obligations.
 * This does not open a route, select a department, map an old role or grant another academic action.
 */
class DepartmentAcademicReadService
{
    public function __construct(private DepartmentDutyPermissionService $permissions) {}

    public function ownTeachers(User $actor, int $departmentId, array $filters): Collection
    {
        if (!$this->permissions->has($actor, $departmentId, 'staff.teacher.index')) $this->forbidden();

        $profiles = Teacher::where('user_id', $actor->id)->limit(2)->get(['id', 'user_id', 'status']);
        if ($profiles->count() !== 1 || $profiles->first()->status !== 'active') $this->forbidden();

        return Teacher::whereKey($profiles->first()->id)->with('user:id,name')
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when(isset($filters['q']) && $filters['q'] !== '', fn ($q) => $q->whereHas('user',
                fn ($user) => $user->where('name', 'like', '%'.$filters['q'].'%')))
            ->get(['id', 'user_id']);
    }

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

    public function listBatches(User $actor, int $departmentId, array $filters): Collection
    {
        return $this->batches($actor, $departmentId, 'staff.batch.index')->with('program:id,name')
            ->when($filters['program_id'] ?? null, fn ($q, $id) => $q->where('program_id', $id))
            ->when(isset($filters['status']) && $filters['status'] !== 'all', fn ($q) => $q->where('status', $filters['status']))
            ->orderBy('program_id')->orderBy('name')->get();
    }

    public function showBatch(User $actor, int $departmentId, int $id): Batch
    {
        return $this->batches($actor, $departmentId, 'staff.batch.show')->with('program:id,name')->findOrFail($id);
    }

    public function showProgram(User $actor, int $departmentId, int $id): Program
    {
        return Program::whereIn('id', $this->batches($actor, $departmentId, 'staff.program.show')->select('program_id'))->findOrFail($id, ['id', 'name']);
    }

    public function listSubjects(User $actor, int $departmentId, array $filters): Collection
    {
        return $this->subjects($actor, $departmentId, 'staff.subject.index')
            ->when($filters['program_id'] ?? null, fn ($q, $id) => $q->where('program_id', $id))
            ->with('program:id,name')->orderBy('program_id')->orderBy('name')->get(['id', 'name', 'program_id']);
    }

    public function showSubject(User $actor, int $departmentId, int $id): Subject
    {
        return $this->subjects($actor, $departmentId, 'staff.subject.show')->with('program:id,name')
            ->findOrFail($id, ['id', 'name', 'program_id']);
    }

    private function subjects(User $actor, int $departmentId, string $permission): Builder
    {
        if (!$this->permissions->has($actor, $departmentId, $permission)) $this->forbidden();
        $teacher = Teacher::where('user_id', $actor->id)->where('status', 'active')->first();
        if (!$teacher) $this->forbidden();

        // D92: explicit subject assignments only; batch/class ownership and zero never expand this set.
        return Subject::whereIn('id', BatchTeacher::where('teacher_id', $teacher->id)->where('subject_id', '>', 0)
            ->whereHas('batch', fn ($batch) => $batch->whereIn('status', ['upcoming', 'running'])
                ->whereColumn('batches.program_id', 'subjects.program_id'))->select('subject_id'));
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
