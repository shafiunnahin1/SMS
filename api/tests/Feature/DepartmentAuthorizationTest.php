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

    public function test_http_context_is_own_metadata_across_four_types_and_foreign_ids_are_404(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            extract($this->fixture('http-context-'.$type, $type));
            $foreign = $this->fixture('http-foreign-'.$type, $type);
            $unassigned = Tenancy::as($i, fn () => app(DepartmentService::class)->create($admin, ['name' => 'Unassigned private']));
            $host = $this->hostOf($i);
            $expected = ['id' => $department->id, 'code' => $department->code, 'name' => 'Office', 'membership_id' => $membership->id];
            $this->api('GET', $host, 'staff/departments', $user)->assertOk()->assertJsonPath('success', true)
                ->assertJsonPath('data', [$expected])->assertJsonPath('meta.total', 1);
            $this->api('GET', $host, "staff/departments/{$department->id}/portal", $user)->assertOk()
                ->assertExactJson(['success' => true, 'data' => $expected]);
            $this->api('HEAD', $host, 'staff/departments', $user)->assertOk();
            $this->api('HEAD', $host, "staff/departments/{$department->id}/portal", $user)->assertOk();
            foreach ([$foreign['department']->id, $unassigned->id, 999999] as $id) {
                $this->api('GET', $host, "staff/departments/{$id}/portal", $user)->assertNotFound();
            }
            $this->api('GET', $host, 'staff/departments', $foreign['user'])->assertForbidden();
            $this->api('GET', $host, 'staff/departments')->assertUnauthorized();
            $this->api('GET', $host, 'staff/departments', $admin)->assertForbidden();
            $this->api('GET', $host, 'accountant/reports/dues', $user)->assertForbidden();
        }
    }

    public function test_http_context_pagination_empty_state_and_input_allowlist(): void
    {
        extract($this->fixture('http-context-pages')); $host = $this->hostOf($i);
        $second = Tenancy::as($i, function () use ($admin, $user) {
            $service = app(DepartmentService::class);
            $department = $service->create($admin, ['name' => 'Second']);
            $service->addMember($admin, $department->id, ['user_id' => $user->id]);
            return $department;
        });
        $this->api('GET', $host, 'staff/departments?per_page=1&page=2', $user)->assertOk()
            ->assertJsonPath('meta.total', 2)->assertJsonPath('meta.current_page', 2)->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $second->id);
        $this->api('GET', $host, 'staff/departments?per_page=1&page=3', $user)->assertOk()->assertJsonPath('data', []);
        foreach (['per_page=101', 'page=0', 'per_page[]=1', 'user_id=1', 'institution_id=1', 'department_id=1', 'permission_keys[]=*'] as $query) {
            $this->api('GET', $host, 'staff/departments?'.$query, $user)->assertUnprocessable();
        }
        $this->api('GET', $host, "staff/departments/{$department->id}/portal?user_id=1", $user)->assertUnprocessable();
        $this->api('GET', $host, 'staff/departments', $user, ['role' => 'admin'])->assertUnprocessable();
        Tenancy::as($i, fn () => \App\Models\DepartmentMembership::where('user_id', $user->id)->update(['status' => 'inactive']));
        $this->api('GET', $host, 'staff/departments', $user)->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.total', 0);
    }

    public function test_http_context_rechecks_dates_archive_and_identity_on_every_request(): void
    {
        extract($this->fixture('http-context-revoke')); $host = $this->hostOf($i); $path = "staff/departments/{$department->id}/portal";
        foreach ([['active', null, null, 'active', true], ['active', today(), today(), 'active', true],
            ['active', today()->addDay(), null, 'active', false], ['active', null, today()->subDay(), 'active', false],
            ['inactive', null, null, 'active', false], ['active', null, null, 'archived', false]] as [$status, $start, $end, $deptStatus, $allowed]) {
            Tenancy::as($i, function () use ($membership, $department, $status, $start, $end, $deptStatus) {
                $membership->update(['status' => $status, 'starts_at' => $start, 'ends_at' => $end]);
                $department->update(['status' => $deptStatus]);
            });
            $this->api('GET', $host, 'staff/departments', $user)->assertOk()->assertJsonPath('meta.total', $allowed ? 1 : 0);
            $this->api('GET', $host, $path, $user)->assertStatus($allowed ? 200 : 404);
        }
        Tenancy::as($i, fn () => $department->update(['status' => 'active']));
        $user->forceFill(['locked_until' => now()->addHour()])->save();
        $this->api('GET', $host, 'staff/departments', $user)->assertForbidden();
        $user->forceFill(['locked_until' => null])->save();
        Tenancy::as($i, function () use ($user) {
            Teacher::create(['user_id' => $user->id, 'employee_id' => 'HTTP-T1']);
            Teacher::create(['user_id' => $user->id, 'employee_id' => 'HTTP-T2'])->delete();
        });
        $this->api('GET', $host, $path, $user)->assertForbidden();
        $this->api('GET', $host, 'staff/departments', $user)->assertForbidden();
    }

    public function test_own_context_is_minimal_read_only_metadata_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            extract($this->fixture('context-'.$type, $type));
            Tenancy::as($i, function () use ($user, $admin, $department, $membership) {
                $service = app(\App\Services\DepartmentContextService::class);
                $other = app(DepartmentService::class)->create($admin, ['name' => 'Private unassigned']);
                $teacher = Teacher::create(['user_id' => $user->id, 'employee_id' => 'CONTEXT-T']);
                $staff = StaffMember::factory()->create(['user_id' => $user->id]);
                $before = [$user->fresh()->getAttributes(), $teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $membership->fresh()->getAttributes()];
                $expected = ['id' => $department->id, 'code' => $department->code, 'name' => 'Office', 'membership_id' => $membership->id];
                $this->assertSame([$expected], $service->index($user)->all());
                $this->assertSame($expected, $service->show($user, $department->id));
                try { $service->show($user, $other->id); $this->fail('Unassigned context exposed'); }
                catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertTrue(true); }
                $this->assertSame($before, [$user->fresh()->getAttributes(), $teacher->fresh()->getAttributes(), $staff->fresh()->getAttributes(), $membership->fresh()->getAttributes()]);
            });
            $this->api('GET', $this->hostOf($i), 'programs', $user)->assertForbidden();
        }
    }

    public function test_context_membership_dates_and_department_archive_are_fresh(): void
    {
        extract($this->fixture('context-dates')); $this->bindTenant($i);
        $service = app(\App\Services\DepartmentContextService::class);
        foreach ([['active', null, null, 'active', true], ['active', today(), today(), 'active', true],
            ['active', today()->addDay(), null, 'active', false], ['active', null, today()->subDay(), 'active', false],
            ['inactive', null, null, 'active', false], ['active', null, null, 'archived', false]] as [$status, $start, $end, $deptStatus, $allowed]) {
            $membership->update(['status' => $status, 'starts_at' => $start, 'ends_at' => $end]);
            $department->update(['status' => $deptStatus]);
            $this->assertSame($allowed ? 1 : 0, $service->index($user)->count());
            if ($allowed) $this->assertSame($department->id, $service->show($user, $department->id)['id']);
            else {
                try { $service->show($user, $department->id); $this->fail('Ineffective context exposed'); }
                catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertTrue(true); }
            }
        }
    }

    public function test_context_rejects_foreign_inactive_ambiguous_and_impersonated_identity(): void
    {
        $a = $this->fixture('context-a'); $b = $this->fixture('context-b');
        $service = app(\App\Services\DepartmentContextService::class);
        $denied = function ($actor) use ($service, $a) {
            foreach ([fn () => $service->index($actor), fn () => $service->show($actor, $a['department']->id)] as $read) {
                try { $read(); $this->fail('Invalid identity accepted'); }
                catch (\App\Exceptions\BusinessException $e) { $this->assertSame(403, $e->status); }
            }
        };
        $denied($a['user']);
        Tenancy::as($a['i'], function () use ($a, $b, $service, $denied) {
            $denied($b['user']); $denied($a['admin']);
            Tenancy::withoutTenancy(fn () => $denied($a['user']));
            try { $service->show($a['user'], $b['department']->id); $this->fail('Foreign context exposed'); }
            catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertTrue(true); }
            foreach ([[$a['user'], 'is_active', false], [$a['user'], 'role', 'teacher'], [$a['user'], 'locked_until', now()->addHour()], [$a['i'], 'status', 'inactive']] as [$row, $field, $value]) {
                $before = $row->getAttribute($field); $row->forceFill([$field => $value])->save();
                $denied($a['user']); $row->forceFill([$field => $before])->save();
                $this->assertCount(1, $service->index($a['user']));
            }
            $actor = $a['user']->fresh()->withAccessToken($a['user']->createToken('support', ['impersonated'])->accessToken);
            $denied($actor);
            StaffMember::factory()->create(['user_id' => $a['user']->id]);
            $duplicate = StaffMember::factory()->create(['user_id' => $a['user']->id]);
            $denied($a['user']); $duplicate->delete(); $denied($a['user']);
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
