<?php

namespace Tests\Feature\Substitution;

use App\Models\{LeaveSubstitutionOperation, LeaveType, Routine, Teacher, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D204 GAP.4 (the gap SUBM.3 left untested): department staff reopen a period that a routine change cancelled, with exactly the
// `staff.leave_substitution.refresh_source` key in their selected department - the reason is required, the department is recorded;
// the offer or clear key does not reopen, and nothing works without the department header.
class SubstitutionStaffRefreshTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private array $s;

    private function staff(string $name, array $keys): array
    {
        $i = $this->s['i'];
        $u = User::create(['institution_id' => $i->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
        $u->forceFill(['must_change_password' => false])->save();
        $d = Tenancy::as($i, function () use ($u, $name, $keys) {
            $svc = app(DepartmentService::class);
            $d = $svc->create($this->s['admin'], ['name' => "Dept {$name}"]);
            $m = $svc->addMember($this->s['admin'], $d->id, ['user_id' => $u->id]);
            $duty = $svc->createDuty($this->s['admin'], $d->id, ['code' => strtoupper($name), 'name' => $name, 'permission_keys' => $keys]);
            $svc->assignDuties($this->s['admin'], $m->id, ['duty_ids' => [$duty->id]]);
            return $d->id;
        });
        return [$u, $d];
    }

    private function as(User $u, ?int $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken, 'Idempotency-Key' => 'k-' . uniqid('', true)] + ($department !== null ? ['X-Department-Id' => (string) $department] : []);
        return $this->json($method, 'http://' . $this->s['host'] . '/api/v1/' . $path, $body, $headers);
    }

    public function test_staff_reopen_a_cancelled_period_only_with_the_refresh_key(): void
    {
        $this->travelTo('2030-01-01 08:00:00');
        $s = $this->s = $this->school('ssr');
        $s['i']->forceFill(['staff_department_mode' => 'department'])->save();
        $karim = Tenancy::as($s['i'], fn () => Teacher::where('user_id', $s['karimUser']->id)->value('id'));
        $routine = Tenancy::as($s['i'], fn () => Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim, 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45']));
        $type = Tenancy::as($s['i'], fn () => LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 20, 'is_paid' => true]));
        $leave = $this->api('POST', $s['host'], 'hr/leaves', $s['admin'], ['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06', 'reason' => 'x'])->assertCreated()->json('data.id');
        $this->api('PATCH', $s['host'], "hr/leaves/{$leave}/approve", $s['admin'])->assertOk();
        [$refresher, $rd] = $this->staff('Refresher', ['staff.leave_substitution.read', 'staff.leave_substitution.refresh_source']);
        [$offerer, $od] = $this->staff('Offerer', ['staff.leave_substitution.read', 'staff.leave_substitution.offer', 'staff.leave_substitution.clear_offer']);
        $base = "hr/leaves/{$leave}/substitution-slots";

        // the routine moves: the period is cancelled until someone reopens it
        $this->api('PUT', $s['host'], "routines/{$routine->id}", $s['admin'], ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim, 'day_of_week' => 'sun', 'start_time' => '09:05', 'end_time' => '09:50'])->assertOk();
        $slot = $this->as($refresher, $rd, 'GET', $base)->assertOk()->json('data.slots.0');
        $this->assertSame('cancelled', $slot['status']);
        $exp = ['expected_versions' => ['slot' => $slot['version'], 'source' => $slot['source']]];
        $path = "{$base}/{$slot['id']}/refresh-source";

        // not with the offer / clear keys, not without the header, not without a reason
        $this->as($offerer, $od, 'PATCH', $path, ['reason' => 'Routine fixed'] + $exp)->assertForbidden();
        $this->as($refresher, null, 'PATCH', $path, ['reason' => 'Routine fixed'] + $exp)->assertForbidden();
        $this->as($refresher, $od, 'PATCH', $path, ['reason' => 'Routine fixed'] + $exp)->assertForbidden();
        $this->as($refresher, $rd, 'PATCH', $path, $exp)->assertStatus(422);

        // with the key: a fresh gap at the new time; the department is on the receipt
        $this->as($refresher, $rd, 'PATCH', $path, ['reason' => 'Routine fixed'] + $exp)->assertOk()->assertJsonPath('data.events.0.result_status', 'unassigned');
        $now = $this->as($refresher, $rd, 'GET', $base)->json('data.slots.0');
        $this->assertSame(['unassigned', '09:05'], [$now['status'], substr($now['source_start_time'], 0, 5)]);
        $op = Tenancy::as($s['i'], fn () => LeaveSubstitutionOperation::where('action', 'refresh_source')->sole());
        $this->assertSame([$refresher->id, $rd], [$op->user_id, $op->department_id]);
    }
}
