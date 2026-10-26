<?php

namespace Tests\Feature;

use App\Models\DepartmentDutyAssignment;
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D169 STW.1: a department's portal also lists the duty keys the staff member holds THERE (so the staff menu shows only that work);
// another department's keys never leak in, an inactive duty grants nothing, and the keys come from the same rules as has().
class StaffDepartmentPortalKeysTest extends TestCase
{
    use RefreshDatabase;

    public function test_portal_lists_only_this_departments_keys(): void
    {
        $i = $this->makeInstitution('stwkeys', 'school');
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $admin = $this->makeUser($i, 'admin');
        $staff = $this->makeUser($i, 'institution_staff');
        [$office, $accounts, $assignment] = Tenancy::as($i, function () use ($admin, $staff) {
            $s = app(DepartmentService::class);
            $office = $s->create($admin, ['name' => 'Office']);
            $m = $s->addMember($admin, $office->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $office->id, ['code' => 'ADM', 'name' => 'Admission', 'permission_keys' => ['staff.student.index', 'staff.student.store']]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
            $accounts = $s->create($admin, ['name' => 'Accounts']);
            $m2 = $s->addMember($admin, $accounts->id, ['user_id' => $staff->id]);
            $fee = $s->createDuty($admin, $accounts->id, ['code' => 'FEE', 'name' => 'Fees', 'permission_keys' => ['staff.fee.collect']]);
            $s->assignDuties($admin, $m2->id, ['duty_ids' => [$fee->id]]);
            return [$office, $accounts, DepartmentDutyAssignment::where('membership_id', $m2->id)->first()];
        });
        $h = $this->hostOf($i);
        $keys = fn ($d) => $this->api('GET', $h, "staff/departments/{$d->id}/portal", $staff)->assertOk()->json('permissions');

        $this->assertEqualsCanonicalizing(['staff.student.index', 'staff.student.store'], $keys($office));
        $this->assertSame(['staff.fee.collect'], $keys($accounts));
        $this->app['auth']->forgetGuards();
        Tenancy::as($i, fn () => $assignment->update(['status' => 'revoked']));
        $this->assertSame([], $keys($accounts), 'a revoked duty assignment grants nothing');
    }
}
