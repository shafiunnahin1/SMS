<?php

namespace Tests\Feature\Behavior;

use App\Models\{AuditLog, Batch, BatchTeacher, BehaviorLog, Program, Student, Teacher, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D235 BHV.1 (extended-features.md section 5): a teacher logs for their own batches' students and corrects only their own entries
// (the old text audited, never deleted); the parent sees positive entries at once, the others only after "tell the parent" (one
// in-app notice); per-student summary; staff keys; another institution 404.
class BehaviorLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_log_correct_tell_parent_and_visibility(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $i = $this->makeInstitution('bhv1', 'school');
        $admin = $this->makeUser($i, 'admin');
        [$a, $b, $rafi, $nila] = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 8']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $svc = app(StudentService::class);
            return [$a, $b, $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $a), $svc->create(['name' => 'Nila', 'guardian_phone' => '01733333333'], $b)];
        });
        $host = $this->hostOf($i);
        $tu = User::create(['institution_id' => $i->id, 'name' => 'Teacher A', 'email' => "ta-{$i->id}@example.test", 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
        $tu->forceFill(['must_change_password' => false])->save();
        Tenancy::as($i, fn () => BatchTeacher::create(['batch_id' => $a->id, 'teacher_id' => Teacher::create(['user_id' => $tu->id, 'employee_id' => 'T-A', 'status' => 'active'])->id, 'subject_id' => 0]));

        $good = $this->api('POST', $host, "students/{$rafi->id}/behavior", $tu, ['type' => 'positive', 'category' => 'achievement', 'title' => 'Best speaker in the debate', 'date' => '2026-11-18'])->assertCreated()->json('data');
        $bad = $this->api('POST', $host, "students/{$rafi->id}/behavior", $tu, ['type' => 'negative', 'category' => 'discipline', 'title' => 'Phone in class', 'action_taken' => 'Phone kept till the end of the day', 'date' => '2026-11-19'])->assertCreated()->json('data');
        $this->api('POST', $host, "students/{$rafi->id}/behavior", $tu, ['type' => 'negative', 'title' => 'x', 'date' => '2026-11-21'])->assertStatus(422)->assertJsonValidationErrors('date');
        $this->api('POST', $host, "students/{$nila->id}/behavior", $tu, ['type' => 'negative', 'title' => 'x', 'date' => '2026-11-19'])->assertForbidden();
        $adminNote = $this->api('POST', $host, "students/{$rafi->id}/behavior", $admin, ['type' => 'neutral', 'title' => 'Moved to the front row', 'date' => '2026-11-20'])->assertCreated()->json('data');

        $this->api('PUT', $host, "behavior/{$adminNote['id']}", $tu, ['title' => 'x'])->assertForbidden();
        $this->api('PUT', $host, "behavior/{$bad['id']}", $tu, ['title' => 'Phone used in class'])->assertOk()->assertJsonPath('data.title', 'Phone used in class');
        $this->assertSame('Phone in class', Tenancy::as($i, fn () => AuditLog::where('action', 'behavior.corrected')->sole()->new_data['was']['title']));
        $this->assertSame(['positive' => 1, 'negative' => 1, 'neutral' => 1], $this->api('GET', $host, "behavior/summary/{$rafi->id}", $tu)->assertOk()->json('data'));
        $this->assertCount(3, $this->api('GET', $host, "students/{$rafi->id}/behavior", $tu)->assertOk()->json('data.entries'));
        $this->api('GET', $host, "students/{$nila->id}/behavior", $tu)->assertForbidden();
        $this->assertCount(3, $this->api('GET', $host, 'behavior', $tu)->json('data'), 'a teacher lists their batches');
        $this->api('GET', $host, 'behavior', $tu, ['batch_id' => $b->id])->assertForbidden();

        $parent = Tenancy::as($i, fn () => Student::find($rafi->id)->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $seen = $this->api('GET', $host, "parent/children/{$rafi->id}/behavior", $parent)->assertOk()->json('data');
        $this->assertSame(['Best speaker in the debate'], array_column($seen['entries'], 'title'), 'positive at once, the others not yet');
        $this->assertArrayNotHasKey('reported_by', $seen['entries'][0]);
        $this->api('POST', $host, "behavior/{$bad['id']}/notify-parent", $tu)->assertOk()->assertJsonPath('data.parent_notified', true);
        $this->api('POST', $host, "behavior/{$bad['id']}/notify-parent", $tu)->assertOk();
        $this->assertSame(1, $parent->notifications()->where('data->type', 'behavior_note')->count(), 'told once');
        $this->assertSame(['Phone used in class', 'Best speaker in the debate'], array_column($this->api('GET', $host, "parent/children/{$rafi->id}/behavior", $parent)->json('data.entries'), 'title'));
        $this->api('GET', $host, "parent/children/{$nila->id}/behavior", $parent)->assertNotFound();
        $this->assertSame(3, Tenancy::as($i, fn () => BehaviorLog::count()), 'never deleted');

        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = function (string $name, array $keys) use ($i, $admin) {
            $u = User::create(['institution_id' => $i->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
            $u->forceFill(['must_change_password' => false])->save();
            $dep = Tenancy::as($i, function () use ($u, $name, $keys, $admin) {
                $svc = app(\App\Services\DepartmentService::class);
                $dep = $svc->create($admin, ['name' => "Dept {$name}"]);
                $m = $svc->addMember($admin, $dep->id, ['user_id' => $u->id]);
                $svc->assignDuties($admin, $m->id, ['duty_ids' => [$svc->createDuty($admin, $dep->id, ['code' => strtoupper($name), 'name' => $name, 'permission_keys' => $keys])->id]]);
                return $dep->id;
            });
            return [$u, $dep];
        };
        $as = function (User $u, int $dep, string $method, string $path, array $body = []) use ($host) {
            $this->app['auth']->forgetGuards();
            return $this->json($method, "http://{$host}/api/v1/{$path}", $body, ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken, 'X-Department-Id' => (string) $dep]);
        };
        [$reader, $rd] = $staff('BhvReader', ['staff.behavior.read']);
        [$keeper, $kd] = $staff('BhvKeeper', ['staff.behavior.manage']);
        $as($reader, $rd, 'GET', "students/{$nila->id}/behavior")->assertOk();
        $as($reader, $rd, 'POST', "students/{$nila->id}/behavior", ['type' => 'positive', 'title' => 'Helped a friend', 'date' => '2026-11-20'])->assertForbidden();
        $as($keeper, $kd, 'POST', "students/{$nila->id}/behavior", ['type' => 'positive', 'title' => 'Helped a friend', 'date' => '2026-11-20'])->assertCreated();

        $j = $this->makeInstitution('bhv2', 'school');
        $other = $this->makeUser($j, 'admin');
        $this->api('PUT', $this->hostOf($j), "behavior/{$bad['id']}", $other, ['title' => 'x'])->assertNotFound();
        $this->api('GET', $this->hostOf($j), "behavior/summary/{$rafi->id}", $other)->assertNotFound();
    }
}
