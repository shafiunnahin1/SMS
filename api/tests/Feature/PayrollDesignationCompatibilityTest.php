<?php

namespace Tests\Feature;

use App\Models\{BonusScheme, SalaryRevision, StaffMember, Teacher, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// R3.6b (docs/TESTING.md): department membership, duties and their titles are separate from HR/payroll - changing them
// leaves the Teacher/StaffMember designation and every salary/bonus snapshot exactly as it was.
class PayrollDesignationCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    private const HR_TABLES = ['teachers', 'staff_members', 'salary_revisions', 'bonus_schemes', 'users'];

    private function snapshot(): array
    {
        $out = [];
        foreach (self::HR_TABLES as $table) $out[$table] = DB::table($table)->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        return $out;
    }

    public function test_department_changes_leave_designation_and_payroll_snapshots_untouched(): void
    {
        $i = $this->makeInstitution('payroll-compat'); $admin = $this->makeUser($i, 'admin'); $user = $this->makeUser($i, 'institution_staff');
        [$staffId] = Tenancy::as($i, function () use ($user) {
            Teacher::create(['user_id' => $user->id, 'employee_id' => 'T-9', 'designation' => 'Assistant Teacher', 'department' => 'Science']);
            $staff = StaffMember::create(['user_id' => $user->id, 'employee_id' => 'S-9', 'name' => 'Rina', 'designation' => 'Office Assistant']);
            SalaryRevision::factory()->create(['payee_type' => 'staff', 'payee_id' => $staff->id]);
            BonusScheme::factory()->create(['status' => 'applied', 'application_snapshot' => ['rows' => [['type' => 'staff', 'id' => $staff->id, 'amount' => '500.00']]]]);
            return [$staff->id];
        });
        $before = $this->snapshot();

        $s = app(DepartmentService::class); $host = $this->hostOf($i); $today = today()->toDateString();
        $d = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Accounts Office']));
        $empty = Tenancy::as($i, fn () => $s->create($admin, ['name' => 'Old Office']));
        $duty = Tenancy::as($i, fn () => $s->createDuty($admin, $d->id, ['code' => 'CASH', 'name' => 'Head of Accounts', 'permission_keys' => ['staff.report.dues']]));
        $member = $this->api('POST', $host, "admin/departments/$d->id/members", $admin, ['user_id' => $user->id, 'starts_at' => $today])->assertCreated()->json('data.id');
        $this->api('PUT', $host, "admin/department-memberships/$member/duties", $admin, ['duty_ids' => [$duty->id]])->assertOk();
        $this->api('PUT', $host, "admin/departments/$d->id/duties/$duty->id", $admin, ['name' => 'Chief Accountant'])->assertOk();
        $this->api('PUT', $host, "admin/departments/$d->id", $admin, ['name' => 'Finance Office'])->assertOk();
        $this->api('PUT', $host, "admin/department-memberships/$member/duties", $admin, ['duty_ids' => []])->assertOk();
        $this->api('POST', $host, "admin/departments/$empty->id/archive", $admin)->assertOk();

        $this->assertSame($before, $this->snapshot(), 'designation, department text, salary and bonus snapshots are unchanged');
        Tenancy::as($i, function () use ($staffId) {
            $this->assertSame('Office Assistant', StaffMember::findOrFail($staffId)->designation);
            $this->assertSame(['Assistant Teacher', 'Science'], [Teacher::sole()->designation, Teacher::sole()->department]);
        });
        $this->assertSame('institution_staff', User::findOrFail($user->id)->role);
    }
}
