<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{DepartmentMembership, Institution, InstitutionDepartment, StaffMember, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/** Own membership metadata only. This is not a duty, module or business-resource grant. */
class DepartmentContextService
{
    public function index(User $actor): Collection
    {
        $memberships = $this->memberships($actor)->orderBy('department_id')->get(['id', 'department_id']);
        return $this->metadataFor($memberships);
    }

    public function paginate(User $actor, int $perPage = 25, int $page = 1): LengthAwarePaginator
    {
        $rows = $this->memberships($actor)
            ->whereIn('department_id', InstitutionDepartment::where('status', 'active')->select('id'))
            ->orderBy('department_id')->paginate($perPage, ['id', 'department_id'], 'page', $page);
        return $rows->setCollection($this->metadataFor($rows->getCollection()));
    }

    private function metadataFor(Collection $memberships): Collection
    {
        $departments = InstitutionDepartment::whereIn('id', $memberships->pluck('department_id'))
            ->where('status', 'active')->get(['id', 'code', 'name'])->keyBy('id');

        return $memberships->filter(fn ($member) => $departments->has($member->department_id))
            ->map(fn ($member) => $this->metadata($departments[$member->department_id], $member))->values();
    }

    public function show(User $actor, int $departmentId): array
    {
        $member = $this->memberships($actor)->where('department_id', $departmentId)->firstOrFail(['id', 'department_id']);
        $department = InstitutionDepartment::whereKey($departmentId)->where('status', 'active')->firstOrFail(['id', 'code', 'name']);

        return $this->metadata($department, $member);
    }

    private function memberships(User $actor): Builder
    {
        $tenant = Tenancy::current();
        if (!$tenant || Tenancy::isBypassed()
            || in_array('impersonated', $actor->currentAccessToken()?->abilities ?? [], true)
            || !Institution::whereKey($tenant->id)->where('status', 'active')->exists()) $this->forbidden();

        $user = User::inTenant()->whereKey($actor->id)->first();
        if (!$user || $user->role !== 'institution_staff' || !$user->is_active
            || ($user->locked_until && $user->locked_until->isFuture())) $this->forbidden();
        if (Teacher::withTrashed()->where('user_id', $user->id)->count() > 1
            || StaffMember::withTrashed()->where('user_id', $user->id)->count() > 1) $this->forbidden();

        $today = today()->toDateString();
        return DepartmentMembership::where('user_id', $user->id)->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $today))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $today));
    }

    private function metadata(InstitutionDepartment $department, DepartmentMembership $member): array
    {
        return ['id' => $department->id, 'code' => $department->code, 'name' => $department->name, 'membership_id' => $member->id];
    }

    private function forbidden(): never
    {
        throw new BusinessException('Forbidden', 'forbidden', 403);
    }
}
