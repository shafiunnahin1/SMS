<?php

namespace App\Services;

use App\Models\{Institution, StaffMappingReview, StaffMember, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StaffDepartmentModeService
{
    public function __construct(private LegacyStaffMappingDryRunService $dryRun) {}

    public function recordReview(
        User $reviewer,
        User $user,
        ?int $teacherId,
        ?int $staffMemberId,
        string $decision,
        ?string $note = null,
    ): StaffMappingReview {
        $institution = Tenancy::current();
        $this->assertPrincipal($reviewer, $institution->id);
        if ((int) $user->institution_id !== (int) $institution->id || !in_array($user->role, LegacyStaffMappingDryRunService::LEGACY_ROLES, true)) {
            throw new AuthorizationException();
        }
        if (trim($decision) === '' || mb_strlen($decision) > 40 || ($note !== null && mb_strlen($note) > 255)) {
            throw ValidationException::withMessages(['decision' => 'Invalid staff mapping review.']);
        }

        if ($teacherId !== null) {
            $teacher = Teacher::whereKey($teacherId)->first();
            if (!$teacher || ($teacher->user_id !== null && (int) $teacher->user_id !== (int) $user->id)) {
                throw ValidationException::withMessages(['teacher_id' => 'The teacher profile is not available for this user.']);
            }
        }
        if ($staffMemberId !== null) {
            $staff = StaffMember::whereKey($staffMemberId)->first();
            if (!$staff || ($staff->user_id !== null && (int) $staff->user_id !== (int) $user->id)) {
                throw ValidationException::withMessages(['staff_member_id' => 'The staff profile is not available for this user.']);
            }
        }

        return StaffMappingReview::create([
            'user_id' => $user->id,
            'teacher_id' => $teacherId,
            'staff_member_id' => $staffMemberId,
            'decision' => trim($decision),
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => now(),
            'note' => $note,
        ]);
    }

    public function switchMode(User $actor, string $mode): Institution
    {
        if (!in_array($mode, ['legacy', 'department'], true)) {
            throw ValidationException::withMessages(['mode' => 'Invalid staff department mode.']);
        }
        $institution = Tenancy::current();
        $this->assertPrincipal($actor, $institution->id);

        return DB::transaction(function () use ($actor, $institution, $mode) {
            $locked = Institution::whereKey($institution->id)->lockForUpdate()->firstOrFail();
            $currentMode = $locked->staff_department_mode ?: 'legacy';
            if ($currentMode === $mode) return $locked;

            if ($mode === 'department') $this->assertReadyForDepartmentMode($institution->id);

            $locked->forceFill(['staff_department_mode' => $mode, 'switched_by' => $actor->id, 'switched_at' => now()])->save();

            if ($currentMode === 'department' && $mode === 'legacy') {
                User::where('institution_id', $institution->id)
                    ->whereIn('role', LegacyStaffMappingDryRunService::LEGACY_ROLES)
                    ->eachById(fn (User $user) => $user->tokens()->delete());
            }

            return $locked->refresh();
        });
    }

    private function assertReadyForDepartmentMode(int $institutionId): void
    {
        $report = $this->dryRun->report();
        if ($report['summary']['unresolved_identity_collisions'] > 0) {
            throw ValidationException::withMessages(['mapping' => 'Resolve identity collisions before switching staff mode.']);
        }

        $userIds = User::where('institution_id', $institutionId)
            ->whereIn('role', LegacyStaffMappingDryRunService::LEGACY_ROLES)
            ->pluck('id');
        $reviewedIds = StaffMappingReview::whereIn('user_id', $userIds)->distinct()->pluck('user_id');
        if ($userIds->diff($reviewedIds)->isNotEmpty()) {
            throw ValidationException::withMessages(['mapping' => 'Review every in-scope staff account before switching.']);
        }

        $latestReviewIds = StaffMappingReview::selectRaw('MAX(id)')->whereIn('user_id', $userIds)->groupBy('user_id');
        $latestReviews = StaffMappingReview::whereIn('id', $latestReviewIds)->get(['teacher_id', 'staff_member_id']);
        foreach (['teacher_id', 'staff_member_id'] as $profileKey) {
            $profileIds = $latestReviews->pluck($profileKey)->filter();
            if ($profileIds->count() !== $profileIds->unique()->count()) {
                throw ValidationException::withMessages(['mapping' => 'A legacy profile cannot be mapped to multiple accounts.']);
            }
        }
    }

    private function assertPrincipal(User $actor, int $institutionId): void
    {
        if ((int) $actor->institution_id !== $institutionId || $actor->role !== 'admin' || !$actor->is_active) {
            throw new AuthorizationException();
        }
    }
}