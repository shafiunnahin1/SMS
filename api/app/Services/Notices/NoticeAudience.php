<?php

namespace App\Services\Notices;

use App\Models\{Batch, BatchTeacher, Enrollment, Notice, ParentStudent, Student, Teacher, User};
use Illuminate\Database\Eloquent\Builder;

// D193 NTC.1: who a notice is for (academic-structure.md "Targeting Rule"). A notice names a group (all / students / teachers /
// parents) and, optionally, a program or one batch: both NULL = the whole institution, batch NULL = the whole program. A student
// reads by their active enrollments, a parent by each child's, a teacher by the batches they teach; others (accountant, staff)
// read only whole-institution notices for everyone. The admin sees every notice, scheduled ones too.
class NoticeAudience
{
    public const ROLE_TARGET = ['student' => 'students', 'parent' => 'parents', 'teacher' => 'teachers'];

    /** [batch ids, program ids] the user belongs to */
    public function places(User $user): array
    {
        $enr = match ($user->role) {
            'student' => Enrollment::whereIn('student_id', Student::where('user_id', $user->id)->pluck('id'))->where('status', 'active')->get(['program_id', 'batch_id']),
            'parent' => Enrollment::whereIn('student_id', ParentStudent::where('parent_user_id', $user->id)->pluck('student_id'))->where('status', 'active')->get(['program_id', 'batch_id']),
            'teacher' => Batch::whereIn('id', BatchTeacher::whereIn('teacher_id', Teacher::where('user_id', $user->id)->pluck('id'))->pluck('batch_id'))->get(['program_id', 'id as batch_id']),
            default => collect(),
        };
        return [$enr->pluck('batch_id')->filter()->unique()->values()->all(), $enr->pluck('program_id')->filter()->unique()->values()->all()];
    }

    /** The notices this user may read now */
    public function visible(User $user): Builder
    {
        $q = Notice::query();
        if ($user->role === 'admin') return $q;
        $q->where('published_at', '<=', now());
        $target = self::ROLE_TARGET[$user->role] ?? null;
        if (!$target) return $q->where('target', 'all')->whereNull('program_id')->whereNull('batch_id');
        [$batches, $programs] = $this->places($user);
        return $q->whereIn('target', ['all', $target])->where(function (Builder $w) use ($batches, $programs) {
            $w->where(fn ($x) => $x->whereNull('program_id')->whereNull('batch_id'))
              ->orWhereIn('batch_id', $batches)
              ->orWhere(fn ($x) => $x->whereNull('batch_id')->whereIn('program_id', $programs));
        });
    }

    /** Every user the notice is for (the receipts report) */
    public function recipients(Notice $notice): array
    {
        $roles = $notice->target === 'all' ? ['student', 'parent', 'teacher'] : [array_search($notice->target, self::ROLE_TARGET, true)];
        $whole = !$notice->program_id && !$notice->batch_id;
        $batchIds = $notice->batch_id ? [$notice->batch_id] : ($notice->program_id ? Batch::where('program_id', $notice->program_id)->pluck('id')->all() : null);
        $ids = [];
        foreach ($roles as $role) {
            $ids = array_merge($ids, match ($role) {
                'student' => $this->studentIds($batchIds)->pipe(fn ($s) => Student::whereIn('id', $s)->whereNotNull('user_id')->pluck('user_id'))->all(),
                'parent' => ParentStudent::whereIn('student_id', $this->studentIds($batchIds))->pluck('parent_user_id')->all(),
                'teacher' => Teacher::whereNotNull('user_id')->when(!$whole, fn ($q) => $q->whereIn('id', BatchTeacher::whereIn('batch_id', $batchIds)->pluck('teacher_id')))->pluck('user_id')->all(),
            });
        }
        if ($notice->target === 'all' && $whole) $ids = array_merge($ids, User::inTenant()->whereIn('role', ['accountant', 'institution_staff'])->pluck('id')->all());
        return array_values(array_unique(array_map('intval', $ids)));
    }

    private function studentIds(?array $batchIds)
    {
        return Enrollment::where('status', 'active')->when($batchIds !== null, fn ($q) => $q->whereIn('batch_id', $batchIds))->pluck('student_id')->unique();
    }
}
