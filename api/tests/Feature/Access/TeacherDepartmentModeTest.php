<?php

namespace Tests\Feature\Access;

use App\Models\User;
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D206 TDM.2: a teacher who selects a department acts exactly as department staff for that request - the duty keys open the staff
// routes (money included, owner choice), a missing key is 403 even where a teacher could otherwise act, and nothing of the switch is
// ever stored. Without a department the teacher is an ordinary teacher.
class TeacherDepartmentModeTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private array $s;

    private function as(User $u, ?int $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken] + ($department !== null ? ['X-Department-Id' => (string) $department] : []);
        return $this->json($method, 'http://' . $this->s['host'] . '/api/v1/' . $path, $body, $headers);
    }

    public function test_department_mode_is_staff_mode_and_never_stored(): void
    {
        $s = $this->s = $this->school('tdm2');
        $s['i']->forceFill(['staff_department_mode' => 'department'])->save();
        $karim = $s['karimUser'];
        $dept = Tenancy::as($s['i'], function () use ($s, $karim) {
            $svc = app(DepartmentService::class);
            $d = $svc->create($s['admin'], ['name' => 'Office']);
            $m = $svc->addMember($s['admin'], $d->id, ['user_id' => $karim->id]);
            $duty = $svc->createDuty($s['admin'], $d->id, ['code' => 'DESK', 'name' => 'Desk', 'permission_keys' => ['staff.lead.read', 'staff.fee.dues']]);
            $svc->assignDuties($s['admin'], $m->id, ['duty_ids' => [$duty->id]]);
            return $d->id;
        });
        $other = Tenancy::as($s['i'], fn () => app(DepartmentService::class)->create($s['admin'], ['name' => 'Elsewhere']))->id;

        // without a department: an ordinary teacher (no leads, no dues); their own teacher work still works
        $this->as($karim, null, 'GET', 'leads')->assertForbidden();
        $this->as($karim, null, 'GET', 'fees/dues?student_id=' . $s['mine']->id)->assertForbidden();
        $this->as($karim, null, 'GET', 'teacher/dashboard')->assertOk();

        // in their department: the duty keys open the staff routes, money included
        $this->as($karim, $dept, 'GET', 'leads')->assertOk();
        $this->as($karim, $dept, 'GET', 'fees/dues?student_id=' . $s['mine']->id)->assertOk();
        // a department they are not in, or a key they do not hold: 403
        $this->as($karim, $other, 'GET', 'leads')->assertForbidden();
        $this->as($karim, $dept, 'POST', 'leads', ['name' => 'X', 'phone' => '01711223344'])->assertForbidden();
        // no teacher right mixes in: attendance is a teacher's own work, but in department mode it needs the staff key they lack
        $this->as($karim, $dept, 'GET', 'attendance?batch_id=' . $s['a']->id . '&date=2030-01-01')->assertForbidden();

        // nothing of the switch is stored
        $this->assertSame('teacher', User::find($karim->id)->role);
        $this->as($karim, null, 'GET', 'auth/me')->assertOk()->assertJsonPath('data.user.role', 'teacher');
        $this->as($karim, $dept, 'GET', 'auth/me')->assertOk()->assertJsonPath('data.user.role', 'teacher');   // identity routes never switch
    }

    public function test_the_switch_is_never_saved_even_when_the_user_row_is_written(): void
    {
        $s = $this->s = $this->school('tdm2b');
        $u = $s['karimUser'];
        request()->attributes->set(\App\Support\DepartmentMode::ATTRIBUTE, $u->id);
        \App\Support\DepartmentMode::asStaff($u);
        $this->assertSame('institution_staff', $u->role);
        $u->name = 'Renamed';
        $u->save();
        $this->assertSame(['teacher', 'Renamed'], [User::find($u->id)->role, User::find($u->id)->name]);
    }
}
