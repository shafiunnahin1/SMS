<?php

namespace Tests\Feature\Access;

use App\Models\{LeaveType, Routine, Teacher, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D206 TDM.3: in department mode a teacher never acts on their own matters - their own leave's cover, their own pay (salary
// history, advances), their own profile - 403 `own_matter`; the same work on somebody else is allowed by the same keys.
class TeacherOwnMatterTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private array $s;

    private function as(User $u, ?int $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken] + ($department !== null ? ['X-Department-Id' => (string) $department] : []);
        return $this->json($method, 'http://' . $this->s['host'] . '/api/v1/' . $path, $body, $headers);
    }

    public function test_never_on_their_own_matters(): void
    {
        $this->travelTo('2030-01-01 08:00:00');
        $s = $this->s = $this->school('tdm3');
        $s['i']->forceFill(['staff_department_mode' => 'department'])->save();
        $karim = $s['karimUser'];
        [$myTeacher, $otherTeacher, $type] = Tenancy::as($s['i'], function () use ($s) {
            $mine = Teacher::where('user_id', $s['karimUser']->id)->first();
            $other = Teacher::where('user_id', $s['otherUser']->id)->first();
            foreach ([$mine, $other] as $n => $t) Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $t->id, 'day_of_week' => 'sun', 'start_time' => $n ? '10:00' : '09:00', 'end_time' => $n ? '10:45' : '09:45']);
            return [$mine, $other, LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 20, 'is_paid' => true])];
        });
        $leave = fn (User $u) => tap($this->api('POST', $s['host'], 'hr/leaves', $s['admin'], ['user_id' => $u->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06', 'reason' => 'x'])->assertCreated()->json('data.id'),
            fn ($id) => $this->api('PATCH', $s['host'], "hr/leaves/{$id}/approve", $s['admin'])->assertOk());
        $myLeave = $leave($karim);
        $otherLeave = $leave($s['otherUser']);
        $dept = Tenancy::as($s['i'], function () use ($s, $karim) {
            $svc = app(DepartmentService::class);
            $d = $svc->create($s['admin'], ['name' => 'HR desk']);
            $m = $svc->addMember($s['admin'], $d->id, ['user_id' => $karim->id]);
            $duty = $svc->createDuty($s['admin'], $d->id, ['code' => 'HR', 'name' => 'HR', 'permission_keys' => ['staff.leave_substitution.read', 'staff.salary_structure.history', 'staff.salary_advance.index', 'staff.salary_advance.store']]);
            $svc->assignDuties($s['admin'], $m->id, ['duty_ids' => [$duty->id]]);
            return $d->id;
        });

        // their own leave's cover: refused; somebody else's: allowed
        $this->as($karim, $dept, 'GET', "hr/leaves/{$myLeave}/substitution-slots")->assertForbidden()->assertJsonPath('error', 'own_matter');
        $this->as($karim, $dept, 'GET', "hr/leaves/{$otherLeave}/substitution-slots")->assertOk();

        // their own pay: refused; somebody else's: allowed
        $this->as($karim, $dept, 'GET', "hr/people/teacher/{$myTeacher->id}/salary")->assertForbidden()->assertJsonPath('error', 'own_matter');
        // (staff never read someone else's salary history on this route either - the staff rule answers, not own_matter)
        $this->as($karim, $dept, 'GET', "hr/people/teacher/{$otherTeacher->id}/salary")->assertForbidden();
        $this->assertNotSame('own_matter', $this->as($karim, $dept, 'GET', "hr/people/teacher/{$otherTeacher->id}/salary")->json('error'));
        $this->as($karim, $dept, 'POST', 'hr/advances', ['payee_type' => 'teacher', 'payee_id' => $myTeacher->id, 'amount' => '1000.00', 'reason' => 'x'])->assertForbidden()->assertJsonPath('error', 'own_matter');
        $this->assertNotSame('own_matter', $this->as($karim, $dept, 'POST', 'hr/advances', ['payee_type' => 'teacher', 'payee_id' => $otherTeacher->id, 'amount' => '1000.00', 'reason' => 'x'])->json('error'));

        // their own profile through the staff route
        $this->as($karim, $dept, 'PATCH', 'staff/profile', ['name' => 'Changed'])->assertForbidden()->assertJsonPath('error', 'own_matter');
        $this->assertSame($karim->name, $karim->fresh()->name);
    }
}
