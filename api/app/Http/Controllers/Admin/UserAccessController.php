<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\{DepartmentDuty, DepartmentDutyAssignment, DepartmentMembership, InstitutionDepartment, User};
use App\Services\Access\TeacherFeatures;

// D205 PERM.3: one read for the admin's 'access per person' screen. A teacher: the institution's switched-off features, their own
// exceptions and the effective list. A staff member: their department memberships with the active duties and the duty keys each
// duty gives. Changes go through the existing APIs (teacher-features, department memberships and duties). Teachers and staff of
// this institution only; anyone else is 404.
class UserAccessController extends Controller
{
    public function show(int $id, TeacherFeatures $features)
    {
        $u = User::inTenant()->whereIn('role', ['teacher', 'institution_staff'])->findOrFail($id);
        $data = ['user_id' => $u->id, 'name' => $u->name, 'role' => $u->role, 'is_active' => (bool) $u->is_active];
        if ($u->role === 'teacher') {
            $i = app('currentInstitution');
            $data['teacher'] = ['features' => TeacherFeatures::keys(), 'institution_off' => $features->institutionOff($i),
                'overrides' => (object) $features->overrides($u), 'off' => $features->offFor($u, $i)];
        } else {
            $memberships = DepartmentMembership::where('user_id', $u->id)->orderBy('id')->get();
            $departments = InstitutionDepartment::whereIn('id', $memberships->pluck('department_id'))->get(['id', 'name', 'status'])->keyBy('id');
            $assigned = DepartmentDutyAssignment::whereIn('membership_id', $memberships->pluck('id'))->where('status', 'active')->get(['membership_id', 'duty_id'])->groupBy('membership_id');
            $duties = DepartmentDuty::whereIn('id', $assigned->flatten()->pluck('duty_id'))->get(['id', 'code', 'name', 'permission_keys', 'status'])->keyBy('id');
            $data['memberships'] = $memberships->map(fn ($m) => ['id' => $m->id, 'department_id' => $m->department_id, 'department' => $departments[$m->department_id]->name ?? null,
                'status' => $m->status, 'duties' => collect($assigned[$m->id] ?? [])->map(fn ($a) => $duties[$a->duty_id] ?? null)->filter()
                    ->map(fn ($d) => ['id' => $d->id, 'code' => $d->code, 'name' => $d->name, 'permission_keys' => $d->permission_keys ?? []])->values()])->values();
        }
        return response()->json(['success' => true, 'data' => $data]);
    }
}
