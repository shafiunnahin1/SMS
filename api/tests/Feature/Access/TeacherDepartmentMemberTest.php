<?php

namespace Tests\Feature\Access;

use App\Services\DepartmentDutyPermissionService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D206 TDM.1: a teacher may be a department member (D90/D91 amended): the admin adds them, gives them a duty; the teacher sees
// their departments and the portal; the duty key counts for them; a parent or accountant still cannot be a member.
class TeacherDepartmentMemberTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_a_teacher_can_be_a_member_with_duties(): void
    {
        $s = $this->school('tdm1');
        $s['i']->forceFill(['staff_department_mode' => 'department'])->save();
        $h = $s['host'];
        $karim = $s['karimUser'];
        $dept = $this->api('POST', $h, 'admin/departments', $s['admin'], ['name' => 'Office'])->assertCreated()->json('data.id');
        $duty = $this->api('POST', $h, "admin/departments/{$dept}/duties", $s['admin'], ['code' => 'LEADS', 'name' => 'Leads', 'permission_keys' => ['staff.lead.read']])->assertCreated()->json('data.id');

        // not a member yet: an empty list
        $this->assertSame([], $this->api('GET', $h, 'staff/departments', $karim)->assertOk()->json('data'));

        // the admin adds the teacher and gives the duty
        $member = $this->api('POST', $h, "admin/departments/{$dept}/members", $s['admin'], ['user_id' => $karim->id])->assertCreated()->json('data.id');
        $this->api('PUT', $h, "admin/department-memberships/{$member}/duties", $s['admin'], ['duty_ids' => [$duty]])->assertOk();
        $this->assertSame([$dept], array_column($this->api('GET', $h, 'staff/departments', $karim)->assertOk()->json('data'), 'id'));
        $this->api('GET', $h, "staff/departments/{$dept}/portal", $karim)->assertOk();
        $this->assertTrue(Tenancy::as($s['i'], fn () => app(DepartmentDutyPermissionService::class)->has($karim, $dept, 'staff.lead.read')));
        $this->assertFalse(Tenancy::as($s['i'], fn () => app(DepartmentDutyPermissionService::class)->has($karim, $dept, 'staff.lead.create')));

        // still never a parent or an accountant
        $acct = $this->makeUser($s['i'], 'accountant');
        $this->assertGreaterThanOrEqual(400, $this->api('POST', $h, "admin/departments/{$dept}/members", $s['admin'], ['user_id' => $acct->id])->status());
        $this->assertGreaterThanOrEqual(400, $this->api('POST', $h, "admin/departments/{$dept}/members", $s['admin'], ['user_id' => $s['parent']->id])->status());
        $this->api('GET', $h, 'staff/departments', $s['parent'])->assertForbidden();
    }
}
