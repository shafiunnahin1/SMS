<?php

namespace Tests\Feature;

use App\Models\{DepartmentDuty, DepartmentDutyAssignment, StaffMember, Teacher};
use App\Services\{DepartmentDutyPermissionService, DepartmentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(string $slug = 'duty-auth', string $type = 'school'): array
    {
        $i = $this->makeInstitution($slug, $type); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff');
        return Tenancy::as($i, function () use ($i, $admin, $user) {
            $s = app(DepartmentService::class);
            $department = $s->create($admin, ['name' => 'Office']);
            $membership = $s->addMember($admin, $department->id, ['user_id' => $user->id]);
            $duty = $s->createDuty($admin, $department->id, ['code' => 'READ', 'name' => 'Read', 'permission_keys' => ['staff.report.dues']]);
            $s->assignDuties($admin, $membership->id, ['duty_ids' => [$duty->id]]);
            return compact('i', 'admin', 'user', 'department', 'membership', 'duty');
        });
    }

    public function test_exact_duty_prerequisite_across_four_types_never_opens_a_business_route(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            extract($this->fixture('prereq-'.$type, $type));
            $check = app(DepartmentDutyPermissionService::class);
            Tenancy::as($i, function () use ($check, $user, $department, $admin) {
                $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
                foreach (['*', 'staff.*', 'staff.report', 'staff.report.dues ', 'staff.report.fees', 'principal.approve'] as $key) $this->assertFalse($check->has($user, $department->id, $key));
                $this->assertFalse($check->has($admin, $department->id, 'staff.report.dues'));
                $this->assertSame(0, Teacher::count()); $this->assertSame(0, StaffMember::count());
            });
            $this->api('GET', $this->hostOf($i), 'accountant/reports/dues', $user)->assertForbidden();
            $this->api('GET', $this->hostOf($i), 'programs', $user)->assertForbidden();
            $this->assertSame('institution_staff', $user->fresh()->role);
        }
    }

    public function test_every_revoked_or_inactive_prerequisite_is_rechecked_in_the_same_process(): void
    {
        extract($this->fixture()); $this->bindTenant($i); $check = app(DepartmentDutyPermissionService::class);
        $assignment = DepartmentDutyAssignment::sole();
        foreach ([[$assignment, 'status', 'revoked'], [$duty, 'status', 'archived'], [$membership, 'status', 'inactive'],
            [$department, 'status', 'archived'], [$user, 'is_active', false], [$user, 'role', 'teacher'], [$user, 'locked_until', now()->addHour()], [$i, 'status', 'inactive']] as [$row, $field, $denied]) {
            $before = $row->getAttribute($field);
            $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
            $row->forceFill([$field => $denied])->save();
            $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'), $row::class.'.'.$field);
            $row->forceFill([$field => $before])->save();
        }
        $membership->update(['starts_at' => today()->toDateString(), 'ends_at' => today()->toDateString()]);
        $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
        $membership->update(['starts_at' => today()->addDay()->toDateString(), 'ends_at' => null]);
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
        $membership->update(['starts_at' => null, 'ends_at' => today()->subDay()->toDateString()]);
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
    }

    public function test_foreign_context_missing_membership_mismatched_department_and_impersonation_fail_closed(): void
    {
        $a = $this->fixture('prereq-a'); $b = $this->fixture('prereq-b'); $check = app(DepartmentDutyPermissionService::class);
        $this->assertFalse($check->has($a['user'], $a['department']->id, 'staff.report.dues'));
        Tenancy::as($a['i'], function () use ($a, $b, $check) {
            $this->assertFalse($check->has($b['user'], $a['department']->id, 'staff.report.dues'));
            $this->assertFalse($check->has($a['user'], $b['department']->id, 'staff.report.dues'));
            $this->assertFalse(Tenancy::withoutTenancy(fn () => $check->has($a['user'], $a['department']->id, 'staff.report.dues')));
            $other = app(DepartmentService::class)->create($a['admin'], ['name' => 'Unassigned']);
            $this->assertFalse($check->has($a['user'], $other->id, 'staff.report.dues'));
            // Legal tenant FKs, intentionally wrong department: service must still refuse it.
            $wrongDuty = DepartmentDuty::factory()->create(['department_id' => $other->id, 'permission_keys' => ['staff.report.dues']]);
            DepartmentDutyAssignment::sole()->update(['duty_id' => $wrongDuty->id]);
            $this->assertFalse($check->has($a['user'], $a['department']->id, 'staff.report.dues'));
            DepartmentDutyAssignment::sole()->update(['duty_id' => $a['duty']->id]);
            $actor = $a['user']->fresh()->withAccessToken($a['user']->createToken('support', ['impersonated'])->accessToken);
            $this->assertFalse($check->has($actor, $a['department']->id, 'staff.report.dues'));
        });
    }

    public function test_malformed_stored_keys_never_become_executable_permissions(): void
    {
        extract($this->fixture()); $this->bindTenant($i); $check = app(DepartmentDutyPermissionService::class);
        foreach ([['*'], ['staff.report.dues', '*'], ['staff.report.dues', 'staff.report.dues'], ['key' => 'staff.report.dues'], [1], [], 'staff.report.dues'] as $keys) {
            $duty->update(['permission_keys' => $keys]);
            $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
        }
        $duty->update(['permission_keys' => ['staff.report.dues']]);
        $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
    }

    public function test_one_teacher_and_one_staff_profile_is_valid_but_ambiguous_links_need_review(): void
    {
        extract($this->fixture()); $this->bindTenant($i); $check = app(DepartmentDutyPermissionService::class);
        $teacher = Teacher::create(['user_id' => $user->id, 'employee_id' => 'AUTH-T', 'designation' => 'Historical teacher']);
        $staff = StaffMember::factory()->create(['user_id' => $user->id, 'employee_id' => 'AUTH-S', 'designation' => 'Historical staff']);
        $before = [$teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $user->fresh()->getAttributes()];
        $this->assertTrue($check->has($user, $department->id, 'staff.report.dues'));
        $duplicate = Teacher::create(['user_id' => $user->id, 'employee_id' => 'AUTH-T2']);
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'));
        $duplicate->delete();
        $this->assertFalse($check->has($user, $department->id, 'staff.report.dues'), 'Soft deletion is not a reviewed identity reconciliation');
        $this->assertSame($before, [$teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $user->fresh()->getAttributes()]);
    }
}
