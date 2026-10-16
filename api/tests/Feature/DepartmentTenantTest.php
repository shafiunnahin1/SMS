<?php
namespace Tests\Feature;

use App\Exceptions\BusinessException;
use App\Models\InstitutionDepartment;
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentTenantTest extends TestCase
{
    use RefreshDatabase;

    public function test_duties_require_same_tenant_and_same_department_with_principal_authorization(): void
    {
        $i = $this->makeInstitution('duty-local'); $other = $this->makeInstitution('duty-foreign');
        $admin = $this->makeUser($i, 'admin'); $foreignAdmin = $this->makeUser($other, 'admin'); $s = app(DepartmentService::class);
        $d = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Local']));
        $second = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Second']));
        $foreign = Tenancy::as($other, fn () => $s->create($foreignAdmin, ['name' => 'Foreign']));
        $input = ['code' => 'VIEW', 'name' => 'Reader', 'permission_keys' => ['staff.report.dues']];
        $duty = Tenancy::as($i, fn () => $s->createDuty($admin, $d->id, $input));
        $fd = Tenancy::as($other, fn () => $s->createDuty($foreignAdmin, $foreign->id, $input)); $host = $this->hostOf($i);
        $this->api('GET', $host, "admin/departments/$foreign->id/duties", $admin)->assertNotFound();
        $this->api('POST', $host, "admin/departments/$foreign->id/duties", $admin, $input)->assertNotFound();
        foreach ([[$d->id, $fd->id], [$second->id, $duty->id], [$foreign->id, $duty->id]] as [$dept, $row]) {
            $this->api('PUT', $host, "admin/departments/$dept/duties/$row", $admin, ['name' => 'Denied'])->assertNotFound();
            try { Tenancy::as($i, fn () => $s->updateDuty($admin, $dept, $row, ['status' => 'archived'])); $this->fail('Foreign/mismatched duty accepted'); }
            catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertTrue(true); }
        }
        $this->api('GET', $host, "admin/departments/$second->id/duties", $admin)->assertOk()->assertJsonCount(0, 'data');
        foreach (['teacher', 'accountant', 'institution_staff', 'parent', 'student'] as $role) {
            $user = $this->makeUser($i, $role);
            $this->api('GET', $host, "admin/departments/$d->id/duties", $user)->assertForbidden();
            $this->api('POST', $host, "admin/departments/$d->id/duties", $user, $input)->assertForbidden();
            $this->api('PUT', $host, "admin/departments/$d->id/duties/$duty->id", $user, ['status' => 'archived'])->assertForbidden();
        }
        $stale = $admin->fresh(); $admin->update(['is_active' => false]);
        foreach ([fn () => $s->duties($stale, $d->id), fn () => $s->createDuty($stale, $d->id, $input), fn () => $s->updateDuty($stale, $d->id, $duty->id, ['status' => 'archived'])] as $operation) {
            try { Tenancy::as($i, $operation); $this->fail('Stale principal accepted'); }
            catch (BusinessException $e) { $this->assertSame(403, $e->status); }
        }
        $this->assertSame('active', Tenancy::as($i, fn () => $duty->fresh()->status));
    }
    public function test_foreign_departments_are_absent_and_nonprincipals_denied(): void
    {
        $a = $this->makeInstitution('dept-a'); $b = $this->makeInstitution('dept-b');
        $admin = $this->makeUser($a, 'admin'); $foreign = $this->makeUser($b, 'admin');
        $d = Tenancy::as($b, fn () => app(DepartmentService::class)->create($foreign, ['name' => 'Foreign confidential'])); $host = $this->hostOf($a);
        $this->api('GET', $host, 'admin/departments', $admin)->assertOk()->assertJsonCount(0, 'data');
        $this->api('PUT', $host, "admin/departments/$d->id", $admin, ['name' => 'Hijack'])->assertNotFound();
        $this->api('POST', $host, "admin/departments/$d->id/archive", $admin)->assertNotFound();
        foreach (['teacher', 'accountant', 'institution_staff', 'student', 'parent'] as $role) {
            $user = $this->makeUser($a, $role);
            $this->api('GET', $host, 'admin/departments', $user)->assertForbidden();
            $this->api('POST', $host, 'admin/departments', $user, ['name' => 'Denied'])->assertForbidden();
            $this->api('PUT', $host, "admin/departments/$d->id", $user, ['name' => 'Denied'])->assertForbidden();
            $this->api('POST', $host, "admin/departments/$d->id/archive", $user)->assertForbidden();
        }
        $this->api('GET', $host, 'admin/departments')->assertUnauthorized(); $this->bindTenant($a);
        try { app(DepartmentService::class)->index($foreign); $this->fail('Foreign principal accepted'); }
        catch (BusinessException $e) { $this->assertSame(403, $e->status); }
        $this->assertSame('Foreign confidential', Tenancy::as($b, fn () => InstitutionDepartment::findOrFail($d->id)->name));
    }
}
