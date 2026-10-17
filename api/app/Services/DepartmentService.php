<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, DepartmentDuty, DepartmentMembership, Institution, InstitutionDepartment, User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\Rule;
use App\Support\DepartmentPermissionKeys;
use App\Models\DepartmentDutyAssignment;
use App\Services\Auth\TokenService;

class DepartmentService
{
    public function addMember(User $actor, int $department, array $input): DepartmentMembership
    {
        return $this->locked($actor, function ($principal) use ($department, $input) {
            $parent = InstitutionDepartment::whereKey($department)->lockForUpdate()->firstOrFail();
            if ($parent->status !== 'active') $this->membershipConflict();
            $this->validateMembership($input);
            $user = $this->membershipUser((int) $input['user_id']);
            if (!$user->is_active) $this->membershipConflict();
            if (DepartmentMembership::where('department_id', $department)->where('user_id', $user->id)->exists()) $this->membershipConflict();
            $member = DepartmentMembership::create($input + ['department_id' => $department, 'status' => 'active', 'created_by' => $principal->id]);
            $this->auditMembership('department_membership.created', $member, $principal);
            return $member;
        });
    }

    public function updateMember(User $actor, int $id, array $input): DepartmentMembership
    {
        return $this->locked($actor, function ($principal) use ($id, $input) {
            $member = DepartmentMembership::whereKey($id)->lockForUpdate()->firstOrFail();
            $parent = InstitutionDepartment::whereKey($member->department_id)->lockForUpdate()->firstOrFail();
            $user = $this->membershipUser($member->user_id);
            $this->validateMembership($input, $member);
            $next = $input['status'] ?? $member->status;
            // Resolution remains possible for an inactive account/archived department; granting does not.
            if ($next === 'active' && (!$user->is_active || $parent->status !== 'active')) $this->membershipConflict();
            $member->fill($input)->save();
            if (!$this->effective($member)) {
                foreach (DepartmentDutyAssignment::where('membership_id', $member->id)->where('status', 'active')->lockForUpdate()->get() as $assignment) {
                    $this->revokeAssignment($assignment, $principal);
                }
                $this->revokeIfNoMembership($user);
            }
            $this->auditMembership('department_membership.updated', $member, $principal);
            return $member;
        });
    }

    public function assignDuties(User $actor, int $id, array $input): DepartmentMembership
    {
        return $this->locked($actor, function ($principal) use ($id, $input) {
            $member = DepartmentMembership::whereKey($id)->lockForUpdate()->firstOrFail();
            $parent = InstitutionDepartment::whereKey($member->department_id)->lockForUpdate()->firstOrFail();
            $user = $this->membershipUser($member->user_id);
            Validator::make($input, ['duty_ids' => 'present|array', 'duty_ids.*' => 'required|integer|min:1|distinct'])->after(function ($v) use ($input) {
                if (array_diff(array_keys($input), ['duty_ids']) || (isset($input['duty_ids']) && is_array($input['duty_ids']) && !array_is_list($input['duty_ids']))) $v->errors()->add('request', __('errors.validation_failed'));
            })->validate();
            $ids = array_map('intval', $input['duty_ids']); sort($ids);
            // Empty replacement is always a permitted principal resolution, even after deactivation/archive.
            if ($ids && (!$user->is_active || $parent->status !== 'active' || !$this->effective($member))) $this->membershipConflict();
            $duties = DepartmentDuty::where('department_id', $member->department_id)->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            if ($duties->count() !== count($ids)) abort(404);
            if ($duties->contains(fn ($d) => $d->status !== 'active')) $this->membershipConflict();
            $existing = DepartmentDutyAssignment::where('membership_id', $member->id)->orderBy('id')->lockForUpdate()->get();
            foreach ($existing as $assignment) {
                if ($assignment->status === 'active' && !in_array($assignment->duty_id, $ids, true)) $this->revokeAssignment($assignment, $principal);
            }
            foreach ($ids as $dutyId) {
                $assignment = $existing->firstWhere('duty_id', $dutyId);
                if ($assignment?->status === 'active') continue;
                $values = ['status' => 'active', 'assigned_by' => $principal->id, 'assigned_at' => now(), 'revoked_by' => null, 'revoked_at' => null];
                if ($assignment) $assignment->forceFill($values)->save();
                else $assignment = DepartmentDutyAssignment::create($values + ['membership_id' => $member->id, 'duty_id' => $dutyId]);
                $this->auditAssignment('department_duty_assignment.granted', $assignment, $principal);
            }
            return $member;
        });
    }

    private function membershipUser(int $id): User
    {
        // Legacy roles are reviewed/mapped only in R3.6b, never silently converted here.
        return User::inTenant()->where('role', 'institution_staff')->whereKey($id)->lockForUpdate()->firstOrFail();
    }

    private function validateMembership(array $input, ?DepartmentMembership $member = null): void
    {
        $rules = ['starts_at' => 'sometimes|nullable|date_format:Y-m-d', 'ends_at' => 'sometimes|nullable|date_format:Y-m-d'];
        if (!$member) $rules['user_id'] = 'required|integer|min:1';
        else $rules['status'] = 'sometimes|required|in:active,inactive,ended';
        Validator::make($input, $rules)->after(function ($v) use ($input, $rules, $member) {
            if (array_diff(array_keys($input), array_keys($rules))) $v->errors()->add('request', __('errors.validation_failed'));
            $start = array_key_exists('starts_at', $input) ? $input['starts_at'] : $member?->starts_at?->toDateString();
            $end = array_key_exists('ends_at', $input) ? $input['ends_at'] : $member?->ends_at?->toDateString();
            if (is_string($start) && is_string($end) && $start > $end) $v->errors()->add('ends_at', __('errors.validation_failed'));
        })->validate();
    }

    private function effective(DepartmentMembership $member): bool
    {
        $today = today()->toDateString();
        return $member->status === 'active' && (!$member->starts_at || $member->starts_at->toDateString() <= $today)
            && (!$member->ends_at || $member->ends_at->toDateString() >= $today);
    }

    private function revokeIfNoMembership(User $user): void
    {
        $today = today()->toDateString();
        $activeDepartments = InstitutionDepartment::where('status', 'active')->select('id');
        $remaining = DepartmentMembership::where('user_id', $user->id)->where('status', 'active')->whereIn('department_id', $activeDepartments)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $today))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $today))->exists();
        if (!$remaining) app(TokenService::class)->revokeAll($user);
    }

    private function revokeAssignment(DepartmentDutyAssignment $assignment, User $actor): void
    {
        $assignment->forceFill(['status' => 'revoked', 'revoked_by' => $actor->id, 'revoked_at' => now()])->save();
        $this->auditAssignment('department_duty_assignment.revoked', $assignment, $actor);
    }

    private function auditAssignment(string $event, DepartmentDutyAssignment $assignment, User $actor): void
    {
        AuditLog::create(['institution_id' => $assignment->institution_id, 'user_id' => $actor->id, 'action' => $event,
            'model' => 'DepartmentDutyAssignment', 'model_id' => $assignment->id,
            'new_data' => ['membership_id' => $assignment->membership_id, 'duty_id' => $assignment->duty_id, 'state' => $assignment->status], 'ip_address' => request()?->ip()]);
    }

    private function auditMembership(string $event, DepartmentMembership $member, User $actor): void
    {
        AuditLog::create(['institution_id' => $member->institution_id, 'user_id' => $actor->id, 'action' => $event,
            'model' => 'DepartmentMembership', 'model_id' => $member->id,
            'new_data' => ['department_id' => $member->department_id, 'user_id' => $member->user_id, 'state' => $member->status], 'ip_address' => request()?->ip()]);
    }

    private function membershipConflict(): never { throw new BusinessException(__('department.membership_conflict'), 'department_membership_conflict', 409); }

    public function duties(User $actor, int $department, int $perPage = 25)
    {
        return $this->locked($actor, function () use ($department, $perPage) {
            InstitutionDepartment::whereKey($department)->firstOrFail();
            return DepartmentDuty::where('department_id', $department)->orderBy('id')->paginate(max(1, min(100, $perPage)));
        });
    }

    public function createDuty(User $actor, int $department, array $input): DepartmentDuty
    {
        return $this->locked($actor, function ($principal) use ($department, $input) {
            $parent = InstitutionDepartment::whereKey($department)->lockForUpdate()->firstOrFail();
            if ($parent->status !== 'active') $this->dutyConflict();
            $this->validateDuty($input, $department);
            $duty = DepartmentDuty::create($input + ['department_id' => $department, 'status' => 'active', 'created_by' => $principal->id]);
            $this->auditDuty('department_duty.created', $duty, $principal);
            return $duty;
        });
    }

    public function updateDuty(User $actor, int $department, int $id, array $input): DepartmentDuty
    {
        return $this->locked($actor, function ($principal) use ($department, $id, $input) {
            $parent = InstitutionDepartment::whereKey($department)->lockForUpdate()->firstOrFail();
            $duty = DepartmentDuty::where('department_id', $department)->whereKey($id)->lockForUpdate()->firstOrFail();
            $this->validateDuty($input, $department, $id);
            if ($parent->status !== 'active') $this->dutyConflict();
            // Archival disables the duty; historical assignment rows are retained, never transferred or rewritten.
            if ($duty->status === 'archived') {
                if ($input === ['status' => 'archived']) return $duty;
                $this->dutyConflict();
            }
            $duty->fill($input)->forceFill(['updated_by' => $principal->id])->save();
            $this->auditDuty('department_duty.updated', $duty, $principal);
            return $duty;
        });
    }

    private function validateDuty(array $input, int $department, ?int $id = null): void
    {
        $required = $id ? 'sometimes' : 'required';
        $allowed = ['code', 'name', 'description', 'permission_keys'];
        if ($id) $allowed[] = 'status';
        Validator::make($input, [
            'code' => [$required, 'required', 'string', 'max:40', Rule::unique('department_duties', 'code')->where('institution_id', Tenancy::current()->id)->where('department_id', $department)->ignore($id)],
            'name' => [$required, 'required', 'string', 'max:120'],
            'description' => 'sometimes|nullable|string|max:500',
            'permission_keys' => [$required, 'required', 'array', 'min:1', 'max:150'],
            'permission_keys.*' => ['required', 'string', 'distinct:strict', Rule::in(DepartmentPermissionKeys::known())],
            'status' => 'sometimes|required|in:active,archived',
        ])->after(function ($v) use ($input, $allowed) {
            if (array_diff(array_keys($input), $allowed)) $v->errors()->add('request', __('errors.validation_failed'));
            if (isset($input['permission_keys']) && is_array($input['permission_keys']) && !array_is_list($input['permission_keys'])) $v->errors()->add('permission_keys', __('errors.validation_failed'));
        })->validate();
    }

    private function auditDuty(string $event, DepartmentDuty $duty, User $actor): void
    {
        AuditLog::create(['institution_id' => $duty->institution_id, 'user_id' => $actor->id, 'action' => $event,
            'model' => 'DepartmentDuty', 'model_id' => $duty->id, 'new_data' => ['department_id' => $duty->department_id, 'state' => $duty->status],
            'ip_address' => request()?->ip()]);
    }

    private function dutyConflict(): never { throw new BusinessException(__('department.duty_conflict'), 'department_duty_conflict', 409); }

    public function index(User $actor, int $perPage = 25)
    {
        return $this->locked($actor, fn () => InstitutionDepartment::orderBy('id')->paginate(max(1, min(100, $perPage))));
    }

    public function create(User $actor, array $input): InstitutionDepartment
    {
        return $this->locked($actor, function ($principal) use ($input) {
            $this->validate($input);
            $department = InstitutionDepartment::create($input + ['status' => 'active', 'created_by' => $principal->id]);
            $this->audit('department.created', $department, $principal);
            return $department;
        });
    }

    public function update(User $actor, int $id, array $input): InstitutionDepartment
    {
        return $this->locked($actor, function ($principal) use ($id, $input) {
            $department = InstitutionDepartment::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($department->status !== 'active') $this->conflict();
            $this->validate($input, $id);
            $department->fill($input)->forceFill(['updated_by' => $principal->id])->save();
            $this->audit('department.updated', $department, $principal);
            return $department;
        });
    }

    public function archive(User $actor, int $id, array $input = []): InstitutionDepartment
    {
        return $this->locked($actor, function ($principal) use ($id, $input) {
            Validator::make($input, [])->after(function ($v) use ($input) {
                if ($input) $v->errors()->add('request', __('errors.validation_failed'));
            })->validate();
            $department = InstitutionDepartment::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($department->status === 'archived') return $department;
            // Count all active rows, including future/expired memberships: resolving them is an explicit principal action.
            if (DepartmentMembership::where('department_id', $id)->where('status', 'active')->exists()
                || DepartmentDuty::where('department_id', $id)->where('status', 'active')->exists()) $this->conflict();
            $department->forceFill(['status' => 'archived', 'archived_at' => now(), 'updated_by' => $principal->id])->save();
            $this->audit('department.archived', $department, $principal);
            return $department;
        });
    }

    private function locked(User $actor, \Closure $operation): mixed
    {
        $tenant = Tenancy::current();
        if (!$tenant || in_array('impersonated', $actor->currentAccessToken()?->abilities ?? [], true)) $this->forbidden();
        return DB::transaction(function () use ($tenant, $actor, $operation) {
            $institution = Institution::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            if ($institution->status !== 'active') $this->forbidden();
            return Tenancy::as($institution, function () use ($actor, $operation) {
                $principal = User::inTenant()->whereKey($actor->id)->lockForUpdate()->first();
                if (!$principal || !$principal->is_active || $principal->role !== 'admin'
                    || ($principal->locked_until && $principal->locked_until->isFuture())) $this->forbidden();
                return $operation($principal);
            });
        });
    }

    private function validate(array $input, ?int $id = null): void
    {
        $tenant = Tenancy::current()->id;
        Validator::make($input, [
            'name' => [($id ? 'sometimes' : 'required'), 'required', 'string', 'max:120', Rule::unique('institution_departments', 'name')->where('institution_id', $tenant)->ignore($id)],
            'code' => ['sometimes', 'nullable', 'string', 'max:40', Rule::unique('institution_departments', 'code')->where('institution_id', $tenant)->ignore($id)],
            'description' => 'sometimes|nullable|string|max:500',
        ])->after(function ($v) use ($input) {
            if (array_diff(array_keys($input), ['name', 'code', 'description'])) $v->errors()->add('request', __('errors.validation_failed'));
        })->validate();
    }

    private function audit(string $event, InstitutionDepartment $department, User $actor): void
    {
        AuditLog::create(['institution_id' => $department->institution_id, 'user_id' => $actor->id,
            'action' => $event, 'model' => 'InstitutionDepartment', 'model_id' => $department->id,
            'new_data' => ['state' => $department->status], 'ip_address' => request()?->ip()]);
    }

    private function forbidden(): never { throw new BusinessException(__('errors.forbidden'), 'forbidden', 403); }
    private function conflict(): never { throw new BusinessException(__('department.conflict'), 'department_conflict', 409); }
}
