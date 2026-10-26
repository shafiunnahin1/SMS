<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Batch, StaffAttendanceGrant, Teacher, User};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * D169 (4) STW.5: the head / admin, or the batch's teacher in charge (class teacher), grants one institution staff member the
 * batch's attendance and either may revoke it. One active grant per batch and staff member, kept under the batch row lock.
 * A grant never replaces the staff member's duty key - attendance still needs staff.attendance.* in the selected department.
 */
class StaffAttendanceGrantService
{
    /** the head / admin always; a teacher only for a batch they are in charge of */
    public function canManage(User $actor, Batch $batch): bool
    {
        if ($actor->role === 'admin') return true;
        if ($actor->role !== 'teacher') return false;
        $teacher = Teacher::where('user_id', $actor->id)->where('status', 'active')->first(['id']);
        return $teacher && (int) $batch->teacher_id === $teacher->id;
    }

    /** the batch's active grants and the staff members who could be given one */
    public function forBatch(User $actor, int $batchId): array
    {
        $batch = Batch::findOrFail($batchId);
        $this->authorize($actor, $batch);
        $grants = StaffAttendanceGrant::active()->where('batch_id', $batch->id)->with('user:id,name')->orderBy('id')->get()
            ->map(fn ($g) => ['id' => $g->id, 'user' => ['id' => $g->user_id, 'name' => $g->user?->name], 'granted_at' => $g->created_at?->toIso8601String()]);
        $staff = User::inTenant()->where('role', 'institution_staff')->where('is_active', true)->orderBy('name')->get(['id', 'name'])
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name]);
        return ['batch' => ['id' => $batch->id, 'name' => $batch->name], 'grants' => $grants->values(), 'staff' => $staff->values()];
    }

    public function grant(User $actor, int $batchId, int $userId): StaffAttendanceGrant
    {
        return DB::transaction(function () use ($actor, $batchId, $userId) {
            $batch = Batch::whereKey($batchId)->lockForUpdate()->firstOrFail();
            $this->authorize($actor, $batch);
            $staff = User::inTenant()->whereKey($userId)->where('role', 'institution_staff')->where('is_active', true)->first();
            if (!$staff) throw new BusinessException(__('errors.staff_grant_not_staff'), 'staff_grant_not_staff', 422);
            $existing = StaffAttendanceGrant::active()->where('batch_id', $batch->id)->where('user_id', $staff->id)->first();
            if ($existing) return $existing;   // one active grant per batch and staff member - a repeat changes nothing
            $grant = StaffAttendanceGrant::create(['batch_id' => $batch->id, 'user_id' => $staff->id, 'granted_by' => $actor->id]);
            AuditLog::record('attendance.grant_given', $grant, ['grant_id' => $grant->id, 'batch_id' => $batch->id, 'staff_id' => $staff->id]);
            return $grant;
        });
    }

    public function revoke(User $actor, int $grantId): StaffAttendanceGrant
    {
        return DB::transaction(function () use ($actor, $grantId) {
            $grant = StaffAttendanceGrant::whereKey($grantId)->lockForUpdate()->firstOrFail();
            $this->authorize($actor, Batch::findOrFail($grant->batch_id));
            if ($grant->revoked_at) return $grant;
            $grant->update(['revoked_by' => $actor->id, 'revoked_at' => now()]);
            AuditLog::record('attendance.grant_revoked', $grant, ['grant_id' => $grant->id, 'batch_id' => $grant->batch_id, 'staff_id' => $grant->user_id]);
            return $grant;
        });
    }

    /** the active grant that lets this staff member take this batch's attendance, or null */
    public function activeGrant(User $staff, int $batchId): ?StaffAttendanceGrant
    {
        return StaffAttendanceGrant::active()->where('batch_id', $batchId)->where('user_id', $staff->id)->first();
    }

    /** the staff member's own granted batches (still upcoming or running) - the attendance page's list ("খ", owner 2026-10-27) */
    public function myBatches(User $staff): Collection
    {
        return StaffAttendanceGrant::active()->where('user_id', $staff->id)->with('batch.program:id,name')->get()
            ->filter(fn ($g) => $g->batch && in_array($g->batch->status, ['upcoming', 'running'], true))
            ->map(fn ($g) => ['id' => $g->batch->id, 'name' => $g->batch->name, 'program' => $g->batch->program ? ['id' => $g->batch->program->id, 'name' => $g->batch->program->name] : null])
            ->sortBy('name')->values();
    }

    private function authorize(User $actor, Batch $batch): void
    {
        if (!$this->canManage($actor, $batch)) throw new BusinessException(__('errors.forbidden'), 'forbidden', 403);
    }
}
