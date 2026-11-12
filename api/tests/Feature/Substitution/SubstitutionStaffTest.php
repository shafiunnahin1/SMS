<?php

namespace Tests\Feature\Substitution;

use App\Models\{LeaveSubstitutionEvent, LeaveSubstitutionOperation, LeaveType, Routine, Teacher, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D201 SUBM.3: department staff as cover reviewers. With the selected department (X-Department-Id), an active membership and the
// EXACT duty key a staff user reads the reviewer lists (`staff.leave_substitution.read`) or offers / clears / reopens (one key
// each) for any teacher's leave; no key implies another; without the header, with another department, or without the key it is
// 403; nominate, accept, decline and leave approval are never theirs; the department is recorded on the receipt and the event.
class SubstitutionStaffTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private array $s;

    /** a staff user in a new department holding exactly these keys: [user, department id] */
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

    private function as(User $u, ?int $department, string $method, string $path, array $body = [], bool $key = false)
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken] + ($department !== null ? ['X-Department-Id' => (string) $department] : []) + ($key ? ['Idempotency-Key' => 'k-' . uniqid()] : []);
        return $this->json($method, 'http://' . $this->s['host'] . '/api/v1/' . $path, $body, $headers);
    }

    public function test_staff_review_only_with_the_exact_key_in_their_department(): void
    {
        $this->travelTo('2030-01-01 08:00:00');
        $s = $this->s = $this->school('sst');
        $s['i']->forceFill(['staff_department_mode' => 'department'])->save();
        [$free, $freeUser, $type] = Tenancy::as($s['i'], function () use ($s) {
            $fu = User::create(['institution_id' => $s['i']->id, 'name' => 'Free teacher', 'email' => 'free@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => Teacher::where('user_id', $s['karimUser']->id)->value('id'), 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45']);
            return [Teacher::create(['user_id' => $fu->id, 'employee_id' => 'T-F']), $fu, LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 20, 'is_paid' => true])];
        });
        $leave = $this->api('POST', $s['host'], 'hr/leaves', $s['admin'], ['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06', 'reason' => 'SECRET-REASON'])->assertCreated()->json('data.id');
        $this->api('PATCH', $s['host'], "hr/leaves/{$leave}/approve", $s['admin'])->assertOk();
        [$reader, $readDept] = $this->staff('Reader', ['staff.leave_substitution.read']);
        [$offerer, $offerDept] = $this->staff('Offerer', ['staff.leave_substitution.offer']);
        [$clearer, $clearDept] = $this->staff('Clearer', ['staff.leave_substitution.clear_offer']);
        $base = "hr/leaves/{$leave}/substitution-slots";

        // the read key: the three reviewer reads, for any teacher's leave - never the reason; nothing without the header or in another department
        $list = $this->as($reader, $readDept, 'GET', 'hr/substitution-slots?from=2030-01-01&to=2030-01-20')->assertOk()->assertJsonPath('data.total', 1);
        $this->assertStringNotContainsString('SECRET-REASON', $list->getContent());
        $slot = $this->as($reader, $readDept, 'GET', $base)->assertOk()->json('data.slots.0');
        $this->assertContains($free->id, array_column($this->as($reader, $readDept, 'GET', "{$base}/{$slot['id']}/candidates")->assertOk()->json('data'), 'id'));
        $this->as($reader, null, 'GET', 'hr/substitution-slots')->assertForbidden();
        $this->as($reader, $offerDept, 'GET', 'hr/substitution-slots')->assertForbidden();
        $this->as($offerer, $offerDept, 'GET', 'hr/substitution-slots')->assertForbidden();            // the offer key does not read
        $exp = ['expected_versions' => ['slot' => $slot['version'], 'source' => $slot['source']]];
        $this->as($reader, $readDept, 'PUT', "{$base}/{$slot['id']}/offer", ['substitute_teacher_id' => (string) $free->id] + $exp, true)->assertForbidden();   // the read key does not offer

        // the offer key: offers; the department is on the receipt and the event; the target is told
        $this->as($offerer, null, 'PUT', "{$base}/{$slot['id']}/offer", ['substitute_teacher_id' => (string) $free->id] + $exp, true)->assertForbidden();
        $this->as($offerer, $offerDept, 'PUT', "{$base}/{$slot['id']}/offer", ['substitute_teacher_id' => (string) $free->id] + $exp, true)->assertOk()->assertJsonPath('data.events.0.result_status', 'offered');
        $op = Tenancy::as($s['i'], fn () => LeaveSubstitutionOperation::where('action', 'offer')->first());
        $this->assertSame([$offerer->id, $offerDept, $offerDept], [$op->user_id, $op->department_id, Tenancy::as($s['i'], fn () => LeaveSubstitutionEvent::where('leave_substitution_operation_id', $op->id)->value('department_id'))]);
        $this->assertSame(1, $freeUser->fresh()->notifications()->where('data->type', 'leave_substitution')->count());

        // one key each: the offerer cannot clear; the clearer can; nobody on staff nominates, accepts, declines or approves a leave
        $now = $this->as($reader, $readDept, 'GET', $base)->json('data.slots.0');
        $exp = ['expected_versions' => ['slot' => $now['version'], 'source' => $now['source']]];
        $this->as($offerer, $offerDept, 'DELETE', "{$base}/{$slot['id']}/offer", $exp, true)->assertForbidden();
        $this->as($offerer, $offerDept, 'PATCH', "{$base}/{$slot['id']}/refresh-source", ['reason' => 'x'] + $exp, true)->assertForbidden();
        foreach ([['PUT', 'nomination', ['substitute_teacher_id' => (string) $free->id]], ['PATCH', 'accept', []], ['PATCH', 'decline', []]] as [$m, $suffix, $body]) {
            $this->as($clearer, $clearDept, $m, "{$base}/{$slot['id']}/{$suffix}", $body + $exp, true)->assertForbidden();
        }
        $this->as($clearer, $clearDept, 'PATCH', "hr/leaves/{$leave}/cancel", ['reason' => 'x'])->assertForbidden();
        $this->as($clearer, $clearDept, 'DELETE', "{$base}/{$slot['id']}/offer", $exp, true)->assertOk()->assertJsonPath('data.events.0.result_status', 'unassigned');
        $this->assertSame('unassigned', $this->as($reader, $readDept, 'GET', $base)->json('data.slots.0.status'));
    }
}
