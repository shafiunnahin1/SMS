<?php

namespace Tests\Feature;

use App\Models\{Institution, Student, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D169 STW.2: staff read students only with the exact key in the SELECTED department (X-Department-Id, D91); the key held only
// in another department, no header, a revoked duty or another institution's student all fail; the full core profile is shown
// (D169 (3)) but never a fee override; every other student route stays closed to staff.
class StaffStudentViewTest extends TestCase
{
    use RefreshDatabase;

    private function setUpStaff(): array
    {
        $i = $this->makeInstitution('stwview', 'school');
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $admin = $this->makeUser($i, 'admin');
        $staff = $this->makeUser($i, 'institution_staff');
        [$office, $accounts] = Tenancy::as($i, function () use ($admin, $staff) {
            $s = app(DepartmentService::class);
            $office = $s->create($admin, ['name' => 'Office']);
            $m = $s->addMember($admin, $office->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $office->id, ['code' => 'VIEW', 'name' => 'View', 'permission_keys' => ['staff.student.index', 'staff.student.show', 'staff.enrollment.for_student']]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
            $accounts = $s->create($admin, ['name' => 'Accounts']);   // a member there, but without the student keys
            $s->addMember($admin, $accounts->id, ['user_id' => $staff->id]);
            return [$office, $accounts];
        });
        $student = $this->api('POST', $this->hostOf($i), 'students', $admin, ['name' => 'Rahim', 'guardian_phone' => '01711000001', 'date_of_birth' => '2012-03-04',
            'address' => 'Dhaka', 'fee_override' => '500.00', 'batch_id' => $this->batch($i)])->assertCreated()->json('data');
        Tenancy::as($i, fn () => Student::whereKey($student['id'])->update(['blood_group' => 'A+', 'religion' => 'Islam']));
        return [$i, $staff, $office, $accounts, $student];
    }

    private function batch(Institution $i): int
    {
        return Tenancy::as($i, function () use ($i) {
            $p = \App\Models\Program::create(['name' => 'Class 8']);
            return \App\Models\Batch::create(['program_id' => $p->id, 'name' => 'A', 'status' => 'running'])->id;
        });
    }

    private function asStaff(Institution $i, User $staff, $department, string $method, string $path)
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $staff->createToken('stw2')->plainTextToken];
        if ($department !== null) $headers['X-Department-Id'] = (string) $department;
        return $this->json($method, 'http://' . $this->hostOf($i) . '/api/v1/' . $path, [], $headers);
    }

    public function test_staff_read_students_only_with_the_key_in_the_selected_department(): void
    {
        [$i, $staff, $office, $accounts, $student] = $this->setUpStaff();
        $id = $student['id'];

        $list = $this->asStaff($i, $staff, $office->id, 'GET', 'students?q=Rahim')->assertOk()->json('data');
        $this->assertSame([$id], array_column($list, 'id'));
        $one = $this->asStaff($i, $staff, $office->id, 'GET', "students/{$id}")->assertOk()->json('data');
        // D169 (3): the full core profile, including the guardian phone unmasked
        foreach (['student_id', 'name', 'guardian_phone', 'date_of_birth', 'address', 'blood_group', 'religion', 'roll_no', 'status', 'photo_url'] as $field) $this->assertArrayHasKey($field, $one, $field);
        $this->assertSame(['01711000001', '2012-03-04', 'Dhaka', 'A+', 'Islam'], [$one['guardian_phone'], $one['date_of_birth'], $one['address'], $one['blood_group'], $one['religion']]);
        $this->assertStringNotContainsString('fee_override', json_encode($one), 'never a fee override');
        $enrollments = $this->asStaff($i, $staff, $office->id, 'GET', "students/{$id}/enrollments")->assertOk()->json('data');
        $this->assertNotEmpty($enrollments);
        $this->assertStringNotContainsString('fee_override', json_encode($enrollments));

        // the key only in another department, no header, a foreign student
        $this->asStaff($i, $staff, $accounts->id, 'GET', 'students')->assertForbidden();
        $this->asStaff($i, $staff, $accounts->id, 'GET', "students/{$id}")->assertForbidden();
        $this->asStaff($i, $staff, null, 'GET', 'students')->assertForbidden();
        $other = $this->makeInstitution('stwview2', 'school');
        $foreign = $this->api('POST', $this->hostOf($other), 'students', $this->makeUser($other, 'admin'), ['name' => 'Karim', 'guardian_phone' => '01711000002'])->assertCreated()->json('data.id');
        $this->asStaff($i, $staff, $office->id, 'GET', "students/{$foreign}")->assertNotFound();

        // every other student route stays closed, even with the view keys
        foreach ([['PUT', "students/{$id}"], ['DELETE', "students/{$id}"], ['GET', "students/{$id}/consents"], ['POST', "students/{$id}/anonymize"], ['POST', 'students']] as [$m, $p]) {
            $this->asStaff($i, $staff, $office->id, $m, $p)->assertForbidden();
        }

        // a revoked duty grants nothing
        Tenancy::as($i, fn () => \App\Models\DepartmentDutyAssignment::query()->update(['status' => 'revoked']));
        $this->asStaff($i, $staff, $office->id, 'GET', 'students')->assertForbidden();
    }

    public function test_the_head_still_sees_the_fee_override(): void
    {
        [$i, , , , $student] = $this->setUpStaff();
        $admin = User::where('institution_id', $i->id)->where('role', 'admin')->first();
        $one = $this->api('GET', $this->hostOf($i), "students/{$student['id']}", $admin)->assertOk()->json('data');
        $this->assertSame('500.00', $one['enrollments'][0]['fee_override']);
        $this->assertArrayHasKey('fee_override', $this->api('GET', $this->hostOf($i), "students/{$student['id']}/enrollments", $admin)->json('data.0'));
    }
}
