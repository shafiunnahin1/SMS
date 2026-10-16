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

    public function test_membership_assignment_checks_foreign_ids_same_department_and_principal_at_every_boundary(): void
    {
        $i = $this->makeInstitution('membership-local'); $other = $this->makeInstitution('membership-foreign');
        $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff');
        $fa = $this->makeUser($other, 'admin'); $fu = $this->makeUser($other, 'institution_staff'); $s = app(DepartmentService::class);
        $d = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Local']));
        $second = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Second']));
        $fd = Tenancy::as($other, fn () => $s->create($fa, ['name' => 'Foreign']));
        $m = Tenancy::as($i, fn () => $s->addMember($admin, $d->id, ['user_id' => $user->id]));
        $fm = Tenancy::as($other, fn () => $s->addMember($fa, $fd->id, ['user_id' => $fu->id]));
        $makeDuty = fn ($actor, $dept) => $s->createDuty($actor, $dept, ['code' => 'READ', 'name' => 'Read', 'permission_keys' => ['staff.report.dues']]);
        $wrong = Tenancy::as($i, fn () => $makeDuty($admin, $second->id)); $foreign = Tenancy::as($other, fn () => $makeDuty($fa, $fd->id));
        $host = $this->hostOf($i); $path = "admin/department-memberships/$m->id";
        $this->api('POST', $host, "admin/departments/$fd->id/members", $admin, ['user_id' => $user->id])->assertNotFound();
        $this->api('POST', $host, "admin/departments/$second->id/members", $admin, ['user_id' => $fu->id])->assertNotFound();
        $this->api('PATCH', $host, "admin/department-memberships/$fm->id", $admin, ['status' => 'ended'])->assertNotFound();
        $this->api('PUT', $host, "admin/department-memberships/$fm->id/duties", $admin, ['duty_ids' => []])->assertNotFound();
        foreach ([$wrong->id, $foreign->id, 999999] as $duty) {
            $this->api('PUT', $host, "$path/duties", $admin, ['duty_ids' => [$duty]])->assertNotFound();
            try { Tenancy::as($i, fn () => $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty]])); $this->fail('Mismatched duty accepted'); }
            catch (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException) { $this->assertSame(0, Tenancy::as($i, fn () => \App\Models\DepartmentDutyAssignment::count())); }
        }
        foreach (['teacher', 'accountant', 'institution_staff', 'parent', 'student'] as $role) {
            $actor = $role === 'institution_staff' ? $user : $this->makeUser($i, $role);
            $this->api('POST', $host, "admin/departments/$second->id/members", $actor, ['user_id' => $user->id])->assertForbidden();
            $this->api('PATCH', $host, $path, $actor, ['status' => 'ended'])->assertForbidden();
            $this->api('PUT', $host, "$path/duties", $actor, ['duty_ids' => []])->assertForbidden();
        }
        $stale = $admin->fresh(); $admin->update(['role' => 'teacher']);
        foreach ([fn () => $s->addMember($stale, $second->id, ['user_id' => $user->id]), fn () => $s->updateMember($stale, $m->id, ['status' => 'ended']), fn () => $s->assignDuties($stale, $m->id, ['duty_ids' => []])] as $op) {
            try { Tenancy::as($i, $op); $this->fail('Stale principal accepted'); }
            catch (BusinessException $e) { $this->assertSame(403, $e->status); }
        }
    }

    public function test_inactive_accounts_and_archived_duties_cannot_be_granted_but_can_be_resolved(): void
    {
        $i = $this->makeInstitution('membership-states'); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff'); $this->bindTenant($i); $s = app(DepartmentService::class);
        $d = $s->create($admin, ['name' => 'Office']); $m = $s->addMember($admin, $d->id, ['user_id' => $user->id]);
        $duty = $s->createDuty($admin, $d->id, ['code' => 'VIEW', 'name' => 'View', 'permission_keys' => ['staff.report.dues']]);
        $s->updateDuty($admin, $d->id, $duty->id, ['status' => 'archived']);
        try { $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]); $this->fail('Archived duty granted'); }
        catch (BusinessException $e) { $this->assertSame(409, $e->status); }
        $user->update(['is_active' => false]);
        try { $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]); $this->fail('Inactive account granted'); }
        catch (BusinessException $e) { $this->assertSame(409, $e->status); }
        $s->assignDuties($admin, $m->id, ['duty_ids' => []]); $s->updateMember($admin, $m->id, ['status' => 'ended']);
        $s->archive($admin, $d->id);
        try { $s->addMember($admin, $d->id, ['user_id' => $user->id]); $this->fail('Archived department received member'); }
        catch (BusinessException $e) { $this->assertSame(409, $e->status); }
        $this->assertSame('ended', $m->fresh()->status); $this->assertFalse($user->fresh()->is_active);
    }

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
