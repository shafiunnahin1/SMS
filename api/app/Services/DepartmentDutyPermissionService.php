<?php

namespace App\Services;

use App\Models\{DepartmentDuty, DepartmentDutyAssignment, DepartmentMembership, Institution, InstitutionDepartment, StaffMember, Teacher, User};
use App\Support\{DepartmentPermissionKeys, Tenancy};

/** D90 prerequisite only: callers still require module/feature, resource, ownership and D33/maker-checker checks.
 * This service does not open routes, switch a tenant, map legacy roles or cache permission results.
 */
class DepartmentDutyPermissionService
{
    public function has(User $actor, int $departmentId, string $permission): bool
    {
        $tenant = Tenancy::current();
        if (!$tenant || Tenancy::isBypassed() || !in_array($permission, DepartmentPermissionKeys::known(), true)
            || in_array('impersonated', $actor->currentAccessToken()?->abilities ?? [], true)) return false;

        if (!Institution::whereKey($tenant->id)->where('status', 'active')->where('staff_department_mode', 'department')->exists()) return false;
        $user = User::inTenant()->whereKey($actor->id)->first();
        if (!$user || $user->role !== 'institution_staff' || !$user->is_active
            || ($user->locked_until && $user->locked_until->isFuture())) return false;

        // Historical links participate in ambiguity review; one Teacher plus one StaffMember is valid.
        if (Teacher::withTrashed()->where('user_id', $user->id)->count() > 1
            || StaffMember::withTrashed()->where('user_id', $user->id)->count() > 1) return false;
        if (!InstitutionDepartment::whereKey($departmentId)->where('status', 'active')->exists()) return false;

        $today = today()->toDateString();
        $membership = DepartmentMembership::where('department_id', $departmentId)->where('user_id', $user->id)->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $today))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $today))->first();
        if (!$membership) return false;

        $dutyIds = DepartmentDutyAssignment::where('membership_id', $membership->id)->where('status', 'active')->pluck('duty_id');
        // Composite tenant FKs alone do not prove that assignment and duty share a department.
        $duties = DepartmentDuty::where('department_id', $departmentId)->whereIn('id', $dutyIds)->where('status', 'active')->get(['permission_keys']);
        foreach ($duties as $duty) {
            $keys = $duty->permission_keys;
            if (!is_array($keys) || !array_is_list($keys) || !$keys) continue;
            foreach ($keys as $key) {
                if (!is_string($key) || !in_array($key, DepartmentPermissionKeys::known(), true)) continue 2;
            }
            if (count(array_unique($keys)) !== count($keys)) continue;
            if (in_array($permission, $keys, true)) return true;
        }
        return false;
    }
}
