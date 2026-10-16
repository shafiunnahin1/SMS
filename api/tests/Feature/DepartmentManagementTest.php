<?php
namespace Tests\Feature;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, DepartmentDuty, DepartmentMembership, InstitutionDepartment, StaffMember, Teacher};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_memberships_and_explicit_assignment_replacement_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $i = $this->makeInstitution('member-'.$type, $type); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff');
            $s = app(DepartmentService::class); $d = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Office']));
            $duty = Tenancy::as($i, fn () => $s->createDuty($admin, $d->id, ['code' => 'READ', 'name' => 'Reader', 'permission_keys' => ['staff.report.dues']]));
            $host = $this->hostOf($i); $today = today()->toDateString();
            $res = $this->api('POST', $host, "admin/departments/$d->id/members", $admin, ['user_id' => $user->id, 'starts_at' => $today, 'ends_at' => $today])->assertCreated();
            $id = $res->json('data.id'); $path = "admin/department-memberships/$id";
            $this->assertSame(['id', 'department_id', 'user_id', 'status', 'starts_at', 'ends_at'], array_keys($res->json('data')));
            $this->assertSame(0, Tenancy::as($i, fn () => \App\Models\DepartmentDutyAssignment::count()));
            $this->api('PUT', $host, "$path/duties", $admin, ['duty_ids' => [$duty->id]])->assertOk();
            $before = Tenancy::as($i, fn () => \App\Models\DepartmentDutyAssignment::sole()->getAttributes());
            $this->api('PUT', $host, "$path/duties", $admin, ['duty_ids' => [$duty->id]])->assertOk();
            $this->assertSame($before, Tenancy::as($i, fn () => \App\Models\DepartmentDutyAssignment::sole()->getAttributes()));
            $this->api('PUT', $host, "$path/duties", $admin, ['duty_ids' => []])->assertOk();
            Tenancy::as($i, function () use ($admin, $before) {
                $a = \App\Models\DepartmentDutyAssignment::sole(); $this->assertSame($before['id'], $a->id);
                $this->assertSame('revoked', $a->status); $this->assertSame($admin->id, $a->revoked_by); $this->assertNotNull($a->revoked_at);
            });
            $this->api('PUT', $host, "$path/duties", $admin, ['duty_ids' => []])->assertOk();
            $this->api('PUT', $host, "$path/duties", $admin, ['duty_ids' => [$duty->id]])->assertOk();
            Tenancy::as($i, function () use ($before, $admin) {
                $a = \App\Models\DepartmentDutyAssignment::sole(); $this->assertSame($before['id'], $a->id);
                $this->assertSame('active', $a->status); $this->assertSame($admin->id, $a->assigned_by); $this->assertNull($a->revoked_at);
                $events = AuditLog::where('model', 'DepartmentDutyAssignment')->get(); $this->assertCount(3, $events);
                $this->assertSame(['department_duty_assignment.granted', 'department_duty_assignment.revoked', 'department_duty_assignment.granted'], $events->pluck('action')->all());
                foreach ($events as $event) $this->assertSame(['membership_id', 'duty_id', 'state'], array_keys($event->new_data));
            });
            // Foundation records are not yet an executable business grant.
            $this->api('GET', $host, 'accountant/dashboard', $user)->assertForbidden();
            $this->assertSame(0, Tenancy::as($i, fn () => Teacher::count())); $this->assertSame(0, Tenancy::as($i, fn () => StaffMember::count()));
        }
    }

    public function test_membership_revocation_preserves_other_membership_session_then_revokes_last_and_never_restores_duties(): void
    {
        $i = $this->makeInstitution('member-revoke'); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff');
        $this->bindTenant($i); $s = app(DepartmentService::class);
        $a = $s->create($admin, ['name' => 'A']); $b = $s->create($admin, ['name' => 'B']);
        $m = $s->addMember($admin, $a->id, ['user_id' => $user->id]); $other = $s->addMember($admin, $b->id, ['user_id' => $user->id]);
        $duty = $s->createDuty($admin, $a->id, ['code' => 'VIEW', 'name' => 'View', 'permission_keys' => ['staff.report.dues']]);
        $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]); $user->createToken('retained');
        $s->updateMember($admin, $m->id, ['status' => 'inactive']);
        $this->assertSame(1, $user->tokens()->count());
        $assignment = \App\Models\DepartmentDutyAssignment::sole(); $this->assertSame('revoked', $assignment->status);
        $s->updateMember($admin, $other->id, ['status' => 'ended']); $this->assertSame(0, $user->tokens()->count());
        $s->updateMember($admin, $m->id, ['status' => 'active']); $this->assertSame('revoked', $assignment->fresh()->status);
        $this->assertSame('ended', $s->updateMember($admin, $other->id, ['status' => 'ended'])->status);
        $this->assertSame('active', $s->updateMember($admin, $other->id, ['status' => 'active'])->status);
        $this->assertSame('revoked', $assignment->fresh()->status);
        $this->assertSame($user->id, $m->fresh()->user_id); $this->assertTrue($user->fresh()->is_active);
    }

    public function test_membership_dates_are_merged_and_ineffective_dates_revoke_assignments_and_last_sessions(): void
    {
        $i = $this->makeInstitution('member-dates'); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff'); $this->bindTenant($i);
        $s = app(DepartmentService::class); $d = $s->create($admin, ['name' => 'Dates']);
        $m = $s->addMember($admin, $d->id, ['user_id' => $user->id, 'starts_at' => today()->subDays(2)->toDateString(), 'ends_at' => today()->addDay()->toDateString()]);
        $duty = $s->createDuty($admin, $d->id, ['code' => 'VIEW', 'name' => 'View', 'permission_keys' => ['staff.report.dues']]);
        foreach ([['starts_at' => today()->addDays(2)->toDateString()], ['ends_at' => today()->subDays(3)->toDateString()], ['starts_at' => '2026-02-30']] as $input) {
            try { $s->updateMember($admin, $m->id, $input); $this->fail('Invalid merged dates accepted'); }
            catch (\Illuminate\Validation\ValidationException $e) { $this->assertNotEmpty($e->errors()); }
        }
        $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]); $user->createToken('expired');
        $s->updateMember($admin, $m->id, ['ends_at' => today()->subDay()->toDateString()]);
        $this->assertSame(0, $user->tokens()->count()); $this->assertSame('revoked', \App\Models\DepartmentDutyAssignment::sole()->status);
        try { $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]); $this->fail('Expired membership assigned'); }
        catch (BusinessException $e) { $this->assertSame(409, $e->status); }
        $s->updateMember($admin, $m->id, ['starts_at' => today()->addDay()->toDateString(), 'ends_at' => null]);
        try { $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]); $this->fail('Future membership assigned'); }
        catch (BusinessException $e) { $this->assertSame(409, $e->status); }
        $s->assignDuties($admin, $m->id, ['duty_ids' => []]);
    }

    public function test_membership_and_assignment_http_and_direct_allowlists_and_atomic_rollback(): void
    {
        $i = $this->makeInstitution('member-validation'); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff'); $s = app(DepartmentService::class);
        $d = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Office'])); $host = $this->hostOf($i);
        foreach ([['status' => 'active'], ['created_by' => $admin->id], ['department_id' => $d->id], ['institution_id' => $i->id], ['designation' => 'Payroll'], ['starts_at' => 'wrong'], ['ends_at' => '2026-02-30']] as $extra) {
            $input = ['user_id' => $user->id] + $extra;
            $this->api('POST', $host, "admin/departments/$d->id/members", $admin, $input)->assertUnprocessable();
            try { Tenancy::as($i, fn () => $s->addMember($admin, $d->id, $input)); $this->fail('Injected member fields accepted'); }
            catch (\Illuminate\Validation\ValidationException $e) { $this->assertNotEmpty($e->errors()); }
        }
        $m = Tenancy::as($i, fn () => $s->addMember($admin, $d->id, ['user_id' => $user->id]));
        $this->api('POST', $host, "admin/departments/$d->id/members", $admin, ['user_id' => $user->id])->assertStatus(409);
        foreach ([[], ['duty_ids' => null], ['duty_ids' => [1, '1']], ['duty_ids' => ['x' => 1]], ['duty_ids' => [0]], ['duty_ids' => [], 'assigned_by' => $admin->id]] as $input) {
            $this->api('PUT', $host, "admin/department-memberships/$m->id/duties", $admin, $input)->assertUnprocessable();
            try { Tenancy::as($i, fn () => $s->assignDuties($admin, $m->id, $input)); $this->fail('Invalid assignment accepted'); }
            catch (\Illuminate\Validation\ValidationException $e) { $this->assertNotEmpty($e->errors()); }
        }
        $this->api('PATCH', $host, "admin/department-memberships/$m->id", $admin, ['user_id' => $admin->id])->assertUnprocessable();
        Tenancy::as($i, function () use ($s, $d, $m, $admin, $user) {
            $duty = $s->createDuty($admin, $d->id, ['code' => 'READ', 'name' => 'Reader', 'permission_keys' => ['staff.report.dues']]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]); $user->createToken('rollback');
            $before = [$m->fresh()->getAttributes(), \App\Models\DepartmentDutyAssignment::sole()->getAttributes(), AuditLog::count()];
            \Illuminate\Support\Facades\DB::beginTransaction();
            $s->updateMember($admin, $m->id, ['status' => 'ended']); \Illuminate\Support\Facades\DB::rollBack();
            $this->assertSame($before, [$m->fresh()->getAttributes(), \App\Models\DepartmentDutyAssignment::sole()->getAttributes(), AuditLog::count()]);
            $this->assertSame(1, $user->tokens()->count());
            \Illuminate\Support\Facades\DB::beginTransaction();
            $s->assignDuties($admin, $m->id, ['duty_ids' => []]); \Illuminate\Support\Facades\DB::rollBack();
            $this->assertSame('active', \App\Models\DepartmentDutyAssignment::sole()->status);
        });
    }

    public function test_runtime_duty_keys_exactly_match_all_150_owner_approved_options(): void
    {
        $contract = json_decode(file_get_contents(base_path('../docs/department-permission-contract.json')), true, flags: JSON_THROW_ON_ERROR);
        $keys = [];
        foreach ($contract['routes'] as $route) {
            array_push($keys, ...$route['permission_options']);
            foreach ($route['selector_variants'] as $variant) {
                if (!($variant['principal_only'] ?? false) && isset($variant['permission'])) $keys[] = $variant['permission'];
            }
        }
        $keys = array_values(array_unique($keys)); sort($keys);
        $this->assertCount(150, $keys);
        $this->assertSame($keys, \App\Support\DepartmentPermissionKeys::ALL);
        foreach ($keys as $key) $this->assertStringNotContainsString('*', $key);
    }

    public function test_principal_duty_lifecycle_is_scoped_has_no_implicit_assignment_and_retains_history(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $i = $this->makeInstitution('duty-'.$type, $type); $admin = $this->makeUser($i, 'admin'); $host = $this->hostOf($i);
            $d = Tenancy::as($i, fn () => app(DepartmentService::class)->create($admin, ['name' => 'Office']));
            $path = "admin/departments/$d->id/duties";
            $created = $this->api('POST', $host, $path, $admin, ['code' => 'BOOKS', 'name' => 'Private duty label', 'permission_keys' => ['staff.dashboard.accountant']])->assertCreated();
            $id = $created->json('data.id');
            $this->assertSame(['id', 'department_id', 'code', 'name', 'description', 'permission_keys', 'status'], array_keys($created->json('data')));
            $this->api('GET', $host, $path.'?per_page=1', $admin)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
            $this->assertSame(0, Tenancy::as($i, fn () => \App\Models\DepartmentDutyAssignment::count()));
            $assignment = Tenancy::as($i, fn () => \App\Models\DepartmentDutyAssignment::factory()->create(['duty_id' => $id,
                'membership_id' => DepartmentMembership::factory()->create(['department_id' => $d->id])->id]));
            $before = $assignment->fresh()->getAttributes();
            $this->api('PUT', $host, "$path/$id", $admin, ['name' => 'Changed display', 'permission_keys' => ['staff.report.dues']])->assertOk()->assertJsonPath('data.permission_keys', ['staff.report.dues']);
            $this->api('PUT', $host, "$path/$id", $admin, ['status' => 'archived'])->assertOk()->assertJsonPath('data.status', 'archived');
            $this->api('PUT', $host, "$path/$id", $admin, ['status' => 'archived'])->assertOk();
            $this->api('PUT', $host, "$path/$id", $admin, ['status' => 'active'])->assertStatus(409);
            $this->assertSame($before, Tenancy::as($i, fn () => $assignment->fresh()->getAttributes()));
            Tenancy::as($i, function () use ($admin, $id) {
                $duty = DepartmentDuty::findOrFail($id); $this->assertSame($admin->id, $duty->created_by); $this->assertSame($admin->id, $duty->updated_by);
                $audits = AuditLog::where('model', 'DepartmentDuty')->get(); $this->assertCount(3, $audits);
                foreach ($audits as $audit) {
                    $this->assertSame(['department_id', 'state'], array_keys($audit->new_data));
                    $this->assertStringNotContainsString('Private duty label', json_encode($audit->getAttributes()));
                    $this->assertStringNotContainsString('staff.report.dues', json_encode($audit->getAttributes()));
                }
            });
        }
    }

    public function test_invalid_duty_permissions_and_injected_fields_are_rejected_by_http_and_direct_service(): void
    {
        $i = $this->makeInstitution('duty-validation'); $admin = $this->makeUser($i, 'admin');
        $s = app(DepartmentService::class); $d = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Office']));
        $valid = ['code' => 'CHECK', 'name' => 'Reviewer', 'permission_keys' => ['staff.report.dues']];
        $bad = [['permission_keys' => ['*']], ['permission_keys' => ['staff.*']], ['permission_keys' => ['admin.staff.manage']],
            ['permission_keys' => []], ['permission_keys' => ['staff.report.dues', 'staff.report.dues']], ['permission_keys' => ['named' => 'staff.report.dues']],
            ['permission_keys' => [150]], ['permission_keys' => [null]],
            ['institution_id' => $i->id], ['department_id' => $d->id], ['created_by' => $admin->id], ['status' => 'active'], ['designation' => 'Principal']];
        foreach ($bad as $override) {
            $input = array_replace($valid, $override);
            $this->api('POST', $this->hostOf($i), "admin/departments/$d->id/duties", $admin, $input)->assertUnprocessable();
            try { Tenancy::as($i, fn () => $s->createDuty($admin, $d->id, $input)); $this->fail('Invalid duty accepted'); }
            catch (\Illuminate\Validation\ValidationException) { $this->assertSame(0, Tenancy::as($i, fn () => DepartmentDuty::count())); }
        }
        $one = Tenancy::as($i, fn () => $s->createDuty($admin, $d->id, $valid));
        try { Tenancy::as($i, fn () => $s->updateDuty($admin, $d->id, $one->id, ['permission_keys' => ['staff.report.dues ']])); $this->fail('Noncanonical direct-service key accepted'); }
        catch (\Illuminate\Validation\ValidationException) { $this->assertSame(['staff.report.dues'], Tenancy::as($i, fn () => $one->fresh()->permission_keys)); }
        // HTTP TrimStrings normalizes transport whitespace before the exact key allowlist is checked.
        $this->api('PUT', $this->hostOf($i), "admin/departments/$d->id/duties/$one->id", $admin, ['permission_keys' => ['staff.report.dues ']])->assertOk()->assertJsonPath('data.permission_keys', ['staff.report.dues']);
        $this->api('POST', $this->hostOf($i), "admin/departments/$d->id/duties", $admin, $valid)->assertUnprocessable();
        $other = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Other']));
        Tenancy::as($i, fn () => $s->createDuty($admin, $other->id, $valid));
        $this->api('PUT', $this->hostOf($i), "admin/departments/$d->id/duties/$one->id", $admin, ['permission_keys' => ['*']])->assertUnprocessable();
        $this->assertSame(['staff.report.dues'], Tenancy::as($i, fn () => $one->fresh()->permission_keys));
    }

    public function test_duty_creation_rolls_back_atomically_and_archived_department_cannot_receive_duties(): void
    {
        $i = $this->makeInstitution('duty-rollback'); $admin = $this->makeUser($i, 'admin');
        $s = app(DepartmentService::class); $d = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Office']));
        Tenancy::as($i, function () use ($s, $d, $admin) {
            \Illuminate\Support\Facades\DB::beginTransaction();
            $s->createDuty($admin, $d->id, ['name' => 'Rollback', 'code' => 'ROLL', 'permission_keys' => ['staff.report.dues']]);
            \Illuminate\Support\Facades\DB::rollBack();
            $this->assertSame(0, DepartmentDuty::count()); $this->assertSame(0, AuditLog::where('model', 'DepartmentDuty')->count());
            $s->archive($admin, $d->id);
        });
        $this->api('POST', $this->hostOf($i), "admin/departments/$d->id/duties", $admin, ['code' => 'NEW', 'name' => 'Denied', 'permission_keys' => ['staff.report.dues']])->assertStatus(409);
    }

    public function test_principal_crud_archive_and_no_implicit_grants_across_four_types(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $i = $this->makeInstitution('dept-'.$type, $type); $admin = $this->makeUser($i, 'admin'); $host = $this->hostOf($i);
            $created = $this->api('POST', $host, 'admin/departments', $admin, ['name' => 'Academic', 'code' => 'ACA', 'description' => 'Private label'])->assertCreated();
            $id = $created->json('data.id');
            $this->assertSame(['id', 'name', 'code', 'description', 'status', 'archived_at'], array_keys($created->json('data')));
            $this->api('PUT', $host, "admin/departments/$id", $admin, ['name' => 'Teaching', 'code' => null, 'description' => null])->assertOk()->assertJsonPath('data.name', 'Teaching');
            $this->api('GET', $host, 'admin/departments', $admin)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
            $this->api('POST', $host, "admin/departments/$id/archive", $admin)->assertOk()->assertJsonPath('data.status', 'archived');
            $this->api('POST', $host, "admin/departments/$id/archive", $admin)->assertOk();
            $this->api('PUT', $host, "admin/departments/$id", $admin, ['name' => 'Changed'])->assertStatus(409);
            Tenancy::as($i, function () use ($id, $admin) {
                $d = InstitutionDepartment::findOrFail($id);
                $this->assertSame($admin->id, $d->created_by); $this->assertSame($admin->id, $d->updated_by); $this->assertNotNull($d->archived_at);
                $this->assertSame(0, DepartmentMembership::count()); $this->assertSame(0, DepartmentDuty::count());
                $this->assertSame(0, Teacher::count()); $this->assertSame(0, StaffMember::count());
                $audits = AuditLog::where('model', 'InstitutionDepartment')->get(); $this->assertCount(3, $audits);
                foreach ($audits as $audit) {
                    $this->assertSame(['state'], array_keys($audit->new_data));
                    $this->assertStringNotContainsString('Private label', json_encode($audit->getAttributes()));
                    $this->assertStringNotContainsString('Teaching', json_encode($audit->getAttributes()));
                }
            });
        }
    }

    public function test_archive_requires_explicit_resolution_and_preserves_child_history(): void
    {
        $i = $this->makeInstitution('dept-block'); $admin = $this->makeUser($i, 'admin'); $this->bindTenant($i);
        $d = app(DepartmentService::class)->create($admin, ['name' => 'Finance']);
        $m = DepartmentMembership::factory()->create(['department_id' => $d->id, 'ends_at' => now()->subDay()]);
        $duty = DepartmentDuty::factory()->create(['department_id' => $d->id]); $host = $this->hostOf($i);
        $this->api('POST', $host, "admin/departments/$d->id/archive", $admin)->assertStatus(409);
        Tenancy::as($i, fn () => $m->update(['status' => 'ended']));
        $this->api('POST', $host, "admin/departments/$d->id/archive", $admin)->assertStatus(409);
        Tenancy::as($i, fn () => $duty->update(['status' => 'archived']));
        $before = Tenancy::as($i, fn () => [$m->fresh()->getAttributes(), $duty->fresh()->getAttributes()]);
        $this->api('POST', $host, "admin/departments/$d->id/archive", $admin)->assertOk();
        $this->assertSame($before, Tenancy::as($i, fn () => [$m->fresh()->getAttributes(), $duty->fresh()->getAttributes()]));
    }

    public function test_allowlists_and_tenant_local_uniqueness_in_http_and_service(): void
    {
        $i = $this->makeInstitution('dept-validation'); $admin = $this->makeUser($i, 'admin'); $this->bindTenant($i);
        $s = app(DepartmentService::class); $d = $s->create($admin, ['name' => 'Office', 'code' => 'OFF']);
        foreach ([['name' => 'Office'], ['name' => 'Other', 'code' => 'OFF'], ['name' => str_repeat('x', 121)], ['name' => 'Other', 'status' => 'archived'], ['name' => 'Other', 'created_by' => $admin->id], ['name' => 'Other', 'institution_id' => $i->id]] as $input) {
            $this->api('POST', $this->hostOf($i), 'admin/departments', $admin, $input)->assertUnprocessable();
        }
        $this->api('POST', $this->hostOf($i), "admin/departments/$d->id/archive", $admin, ['status' => 'archived'])->assertUnprocessable();
        try { Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Bad', 'permission_keys' => ['*']])); $this->fail('Injected fields accepted'); }
        catch (\Illuminate\Validation\ValidationException) { $this->assertSame(1, Tenancy::as($i, fn () => InstitutionDepartment::count())); }
        $other = $this->makeInstitution('dept-reuse'); $otherAdmin = $this->makeUser($other, 'admin');
        Tenancy::as($other, fn () => $s->create($otherAdmin, ['name' => 'Office', 'code' => 'OFF']));
        $this->assertSame('OFF', Tenancy::as($i, fn () => $s->update($admin, $d->id, ['code' => 'OFF'])->code));
    }

    public function test_service_rechecks_stale_actor_and_institution_and_refuses_impersonation(): void
    {
        $i = $this->makeInstitution('dept-principal'); $admin = $this->makeUser($i, 'admin'); $this->bindTenant($i); $s = app(DepartmentService::class);
        foreach (['inactive', 'locked', 'role', 'institution', 'impersonation'] as $case) {
            $admin->forceFill(['is_active' => true, 'role' => 'admin', 'locked_until' => null])->save(); $i->update(['status' => 'active']);
            $stale = $admin->fresh();
            if ($case === 'inactive') $admin->update(['is_active' => false]);
            if ($case === 'locked') $admin->forceFill(['locked_until' => now()->addHour()])->save();
            if ($case === 'role') $admin->update(['role' => 'teacher']);
            if ($case === 'institution') $i->update(['status' => 'inactive']);
            if ($case === 'impersonation') $stale->withAccessToken($admin->createToken('support', ['impersonated'])->accessToken);
            try { $s->create($stale, ['name' => 'Denied']); $this->fail($case); }
            catch (BusinessException $e) { $this->assertSame(403, $e->status); }
        }
        $this->assertSame(0, InstitutionDepartment::count());
    }
}
