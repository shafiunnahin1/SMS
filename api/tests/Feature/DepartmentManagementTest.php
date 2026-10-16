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
