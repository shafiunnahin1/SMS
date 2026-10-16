<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, DepartmentDuty, DepartmentMembership, Institution, InstitutionDepartment, User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\Rule;

class DepartmentService
{
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
