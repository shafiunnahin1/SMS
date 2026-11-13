<?php

namespace Tests\Feature\Access;

use App\Models\User;
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D205 PERM.3: the admin's one read per person - a teacher's feature switches, a staff member's departments and duty keys; only
// teachers and staff of this institution; only the admin.
class UserAccessTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_one_read_per_person(): void
    {
        $s = $this->school('uacc');
        $o = $this->school('uacc2');
        $h = $s['host'];
        $staff = User::create(['institution_id' => $s['i']->id, 'name' => 'Office', 'email' => 'office@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
        Tenancy::as($s['i'], function () use ($s, $staff) {
            $svc = app(DepartmentService::class);
            $d = $svc->create($s['admin'], ['name' => 'Front office']);
            $m = $svc->addMember($s['admin'], $d->id, ['user_id' => $staff->id]);
            $duty = $svc->createDuty($s['admin'], $d->id, ['code' => 'LEADS', 'name' => 'Leads desk', 'permission_keys' => ['staff.lead.read', 'staff.lead.update']]);
            $svc->assignDuties($s['admin'], $m->id, ['duty_ids' => [$duty->id]]);
        });

        // a staff member: their department, duty and keys
        $d = $this->api('GET', $h, "admin/users/{$staff->id}/access", $s['admin'])->assertOk()->json('data');
        $this->assertSame(['institution_staff', 'Front office', 'Leads desk', ['staff.lead.read', 'staff.lead.update']],
            [$d['role'], $d['memberships'][0]['department'], $d['memberships'][0]['duties'][0]['name'], $d['memberships'][0]['duties'][0]['permission_keys']]);
        $this->assertArrayNotHasKey('teacher', $d);

        // a teacher: the switches
        $this->api('PUT', $h, 'admin/teacher-features', $s['admin'], ['off' => ['notices']])->assertOk();
        $this->api('PUT', $h, "admin/users/{$s['karimUser']->id}/teacher-features", $s['admin'], ['overrides' => ['ai_assistant' => 'blocked']])->assertOk();
        $t = $this->api('GET', $h, "admin/users/{$s['karimUser']->id}/access", $s['admin'])->assertOk()->json('data');
        $this->assertSame(['teacher', ['notices'], ['ai_assistant' => 'blocked'], ['ai_assistant', 'notices']],
            [$t['role'], $t['teacher']['institution_off'], $t['teacher']['overrides'], $t['teacher']['off']]);

        // nobody else; never another institution; admin only
        $this->api('GET', $h, "admin/users/{$s['admin']->id}/access", $s['admin'])->assertNotFound();
        $this->api('GET', $h, "admin/users/{$s['parent']->id}/access", $s['admin'])->assertNotFound();
        $this->api('GET', $h, "admin/users/{$o['karimUser']->id}/access", $s['admin'])->assertNotFound();
        $this->api('GET', $h, "admin/users/{$staff->id}/access", $s['karimUser'])->assertForbidden();
    }
}
