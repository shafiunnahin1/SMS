<?php

namespace App\Services;

use App\Models\{StaffMember, Teacher, User};
use App\Support\Tenancy;

/**
 * R3.6b (D90, staff-account-contract.md): report-only legacy staff mapping for one tenant. It reads Users and their
 * Teacher/StaffMember links and writes nothing. Department text and role labels never become duties (proposed_duties is
 * always empty); ambiguous or invalid links are reported as unresolved and must be reconciled by the principal before
 * any later, separately approved per-tenant switch.
 */
class LegacyStaffMappingDryRunService
{
    /** Roles whose accounts the department model replaces; every other role (admin, student, parent, platform) is out of scope */
    public const LEGACY_ROLES = ['teacher', 'accountant', 'institution_staff'];

    public function report(): array
    {
        $institution = Tenancy::current();
        $users = User::where('institution_id', $institution->id)->whereIn('role', self::LEGACY_ROLES)->orderBy('id')->get(['id', 'role', 'is_active']);
        $teachers = Teacher::withTrashed()->orderBy('id')->get(['id', 'user_id', 'employee_id', 'designation', 'department', 'status', 'deleted_at']);
        $staff = StaffMember::withTrashed()->orderBy('id')->get(['id', 'user_id', 'employee_id', 'designation', 'department', 'status', 'deleted_at']);
        $tenantUsers = User::where('institution_id', $institution->id)->whereIn('id', $teachers->pluck('user_id')->merge($staff->pluck('user_id'))->filter()->unique())->get(['id', 'role'])->keyBy('id');

        $rows = [];
        foreach ($users as $user) {
            $t = $teachers->where('user_id', $user->id)->values(); $s = $staff->where('user_id', $user->id)->values();
            $issues = [];
            if ($t->count() > 1) $issues[] = 'ambiguous_teacher_link';
            if ($s->count() > 1) $issues[] = 'ambiguous_staff_link';
            $rows[] = [
                'user_id' => $user->id, 'role' => $user->role, 'is_active' => (bool) $user->is_active,
                'teachers' => $t->map(fn ($p) => $this->profile($p))->all(), 'staff_members' => $s->map(fn ($p) => $this->profile($p))->all(),
                'issues' => $issues, 'needs_principal_review' => $issues !== [] || $t->merge($s)->contains(fn ($p) => filled($p->department)),
                'proposed_duties' => [],
            ];
        }

        $profiles = [];
        foreach ([['teacher', $teachers], ['staff_member', $staff]] as [$type, $list]) {
            foreach ($list as $p) {
                if ($p->user_id === null) { $issue = 'unlinked_profile'; }
                elseif (!$tenantUsers->has($p->user_id)) { $issue = 'link_outside_tenant_or_missing'; }
                elseif (!in_array($tenantUsers[$p->user_id]->role, self::LEGACY_ROLES, true)) { $issue = 'link_to_non_staff_role'; }
                else continue;
                $profiles[] = ['type' => $type] + $this->profile($p) + ['user_id' => $p->user_id, 'issue' => $issue];
            }
        }

        $unresolved = collect($rows)->sum(fn ($r) => count($r['issues'])) + collect($profiles)->where('issue', '!=', 'unlinked_profile')->count();
        return [
            'institution_id' => $institution->id, 'dry_run' => true, 'users' => $rows, 'profiles_without_valid_login' => $profiles,
            'summary' => [
                'users' => count($rows), 'needs_principal_review' => collect($rows)->where('needs_principal_review', true)->count(),
                'unlinked_profiles' => collect($profiles)->where('issue', 'unlinked_profile')->count(),
                'unresolved_identity_collisions' => $unresolved, 'switch_ready' => false,
            ],
        ];
    }

    private function profile($p): array
    {
        return ['id' => $p->id, 'employee_id' => $p->employee_id, 'designation' => $p->designation, 'department_text' => $p->department,
            'status' => $p->status, 'deleted' => $p->deleted_at !== null];
    }
}
