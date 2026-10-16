<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, DepartmentDuty, DepartmentMembership, Institution, InstitutionDepartment, User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\Rule;
use App\Support\DepartmentPermissionKeys;

class DepartmentService
{
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
            'permission_keys.*' => ['required', 'string', 'distinct:strict', Rule::in(DepartmentPermissionKeys::ALL)],
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
