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
