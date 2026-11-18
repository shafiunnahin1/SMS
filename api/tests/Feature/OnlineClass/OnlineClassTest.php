<?php

namespace Tests\Feature\OnlineClass;

use App\Models\{AuditLog, Batch, OnlineClass, Program, Student, Teacher, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D231 OCL.1 (docs/modules/online-class.md): every admin and teacher schedules a class for a batch or a whole program (https links
// only); a teacher changes, completes or cancels only their own; notices to the class's students and parents on create, re-time and
// cancel; live / ended from the clock; cancel keeps the row; the family sees only their classes and no link once cancelled; staff
// exact keys; private batch has the module; another institution 404.
class OnlineClassTest extends TestCase
{
    use RefreshDatabase;

    private function school(string $slug, string $type = 'school'): array
    {
        Queue::fake();
        $this->travelTo('2026-11-20 09:00:00');
        $i = $this->makeInstitution($slug, $type);
        $admin = $this->makeUser($i, 'admin');
        $data = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 8']);
            $other = Program::create(['name' => 'Class 9']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $c = Batch::create(['program_id' => $other->id, 'name' => 'C']);
            $svc = app(StudentService::class);
            return ['p' => $p, 'other' => $other, 'a' => $a, 'b' => $b, 'c' => $c,
                'rafi' => $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $a),
                'mitu' => $svc->create(['name' => 'Mitu', 'guardian_phone' => '01722222222'], $b),
                'nila' => $svc->create(['name' => 'Nila', 'guardian_phone' => '01733333333'], $c)];
        });
        return [$i, $admin, $data, $this->hostOf($i)];
    }

    private function teacher($i, string $code): array
    {
        $u = User::create(['institution_id' => $i->id, 'name' => "Teacher {$code}", 'email' => strtolower($code) . "-{$i->id}@example.test", 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
        $u->forceFill(['must_change_password' => false])->save();
        $t = Tenancy::as($i, fn () => Teacher::where('user_id', $u->id)->first() ?? Teacher::create(['user_id' => $u->id, 'employee_id' => $code, 'status' => 'active']));
        return [$u, $t];
    }

    private function user($i, Student $s): User
    {
        $u = User::find(Tenancy::as($i, fn () => Student::find($s->id)->user_id));
        $u->forceFill(['must_change_password' => false])->save();
        return $u;
    }

    public function test_teachers_and_admin_schedule_notices_and_lifecycle(): void
    {
        [$i, $admin, $d, $host] = $this->school('ocl1');
        [$tu, $t] = $this->teacher($i, 'T-1');
        [$tu2, $t2] = $this->teacher($i, 'T-2');
        $base = ['title' => 'ভগ্নাংশ', 'program_id' => $d['p']->id, 'batch_id' => $d['a']->id, 'platform' => 'google_meet', 'meeting_link' => 'https://meet.google.com/abc-defg-hij', 'passcode' => '1234', 'scheduled_at' => '2026-11-21 18:00', 'duration_minutes' => 45];

        $this->api('POST', $host, 'online-classes', $tu, ['meeting_link' => 'http://meet.example.test/x'] + $base)->assertStatus(422)->assertJsonValidationErrors('meeting_link');
        $this->api('POST', $host, 'online-classes', $tu, ['scheduled_at' => '2026-11-19 18:00'] + $base)->assertStatus(422)->assertJsonValidationErrors('scheduled_at');
        $this->api('POST', $host, 'online-classes', $tu, ['batch_id' => $d['c']->id] + $base)->assertStatus(422)->assertJsonValidationErrors('batch_id');
        $opts = $this->api('GET', $host, 'online-classes/options', $tu)->assertOk()->json('data');
        $this->assertSame([[], 2], [$opts['teachers'], count($opts['programs'])], 'OCL.2: a teacher gets the lists, no teacher list');
        $this->assertCount(2, $this->api('GET', $host, 'online-classes/options', $admin)->assertOk()->json('data.teachers'));
        $own = $this->api('POST', $host, 'online-classes', $tu, $base + ['teacher_id' => $t2->id])->assertCreated()->json('data');
        $this->assertSame([$t->id, 'scheduled', '2026-11-21 18:45'], [$own['teacher']['id'], $own['status'], $own['ends_at']], 'a teacher always schedules as themselves');

        $rafi = $this->user($i, $d['rafi']);
        $mitu = $this->user($i, $d['mitu']);
        $rafiParent = Tenancy::as($i, fn () => Student::find($d['rafi']->id)->parents()->first());
        $this->assertSame([1, 1, 0], [$rafi->notifications()->count(), $rafiParent->notifications()->count(), $mitu->notifications()->count()], 'batch A only');
        $this->assertSame('online_class_scheduled', $rafi->notifications()->first()->data['type']);

        $whole = $this->api('POST', $host, 'online-classes', $admin, ['batch_id' => null, 'teacher_id' => $t2->id, 'title' => 'সবার জন্য'] + $base)->assertCreated()->json('data');
        $this->assertSame([2, 1], [$rafi->fresh()->notifications()->count(), $mitu->fresh()->notifications()->count()], 'a whole-program class reaches both batches');
        $this->api('POST', $host, 'online-classes', $admin, $base)->assertStatus(422)->assertJsonValidationErrors('teacher_id');

        $this->api('PUT', $host, "online-classes/{$whole['id']}", $tu, ['title' => 'x'])->assertForbidden();
        $this->api('PUT', $host, "online-classes/{$own['id']}", $tu, ['title' => 'ভগ্নাংশ ২'])->assertOk();
        $this->assertSame(2, $rafi->fresh()->notifications()->count(), 'a title change is no re-time');
        $this->api('PUT', $host, "online-classes/{$own['id']}", $tu, ['scheduled_at' => '2026-11-21 19:00'])->assertOk()->assertJsonPath('data.scheduled_at', '2026-11-21 19:00');
        $this->assertContains('online_class_retimed', $rafi->fresh()->notifications()->get()->pluck('data.type')->all());

        $this->assertSame([$own['id']], array_column($this->api('GET', $host, 'online-classes', $tu)->assertOk()->json('data'), 'id'), 'a teacher lists the classes they teach');
        $this->assertCount(2, $this->api('GET', $host, 'online-classes', $admin)->json('data'));
        $this->api('PATCH', $host, "online-classes/{$own['id']}/complete", $tu)->assertStatus(422)->assertJsonPath('error', 'online_class_not_started');

        $this->travelTo('2026-11-21 19:10:00');
        $this->assertSame(['ended', 'live'], array_column($this->api('GET', $host, 'student/online-classes', $rafi)->assertOk()->json('data'), 'status'), '18:00-18:45 ended; 19:00-19:45 live at 19:10');
        $this->travelTo('2026-11-21 20:00:00');
        $this->api('PATCH', $host, "online-classes/{$own['id']}/complete", $tu, ['recording_url' => 'ftp://x'])->assertStatus(422);
        $this->api('PATCH', $host, "online-classes/{$own['id']}/complete", $tu, ['recording_url' => 'https://drive.example.test/rec'])->assertOk()->assertJsonPath('data.status', 'completed');

        $this->api('DELETE', $host, "online-classes/{$whole['id']}", $admin)->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame([], $this->api('GET', $host, 'online-classes', $admin)->json('data'), 'OCL.2: completed and cancelled classes leave the upcoming list at once');
        $this->assertSame(['completed', 'cancelled'], array_column($this->api('GET', $host, 'online-classes', $admin, ['when' => 'past'])->json('data'), 'status'));
        $this->api('DELETE', $host, "online-classes/{$whole['id']}", $admin)->assertStatus(409);
        $this->assertSame(2, Tenancy::as($i, fn () => OnlineClass::count()), 'cancelled, never deleted');
        $this->assertContains('online_class_cancelled', $mitu->fresh()->notifications()->get()->pluck('data.type')->all());

        $seen = $this->api('GET', $host, 'student/online-classes', $rafi)->assertOk()->json('data');
        $byTitle = array_column($seen, null, 'title');
        $this->assertSame(['https://drive.example.test/rec', 'https://meet.google.com/abc-defg-hij'], [$byTitle['ভগ্নাংশ ২']['recording_url'], $byTitle['ভগ্নাংশ ২']['meeting_link']]);
        $this->assertNull($byTitle['সবার জন্য']['meeting_link'], 'no link once cancelled');
        $this->assertSame(['সবার জন্য'], array_column($this->api('GET', $host, 'student/online-classes', $mitu)->json('data'), 'title'));
        $nila = $this->user($i, $d['nila']);
        $this->assertSame([], $this->api('GET', $host, 'student/online-classes', $nila)->json('data'), 'another program sees nothing');
        $rafiParent->forceFill(['must_change_password' => false])->save();
        $this->assertCount(2, $this->api('GET', $host, "parent/children/{$d['rafi']->id}/online-classes", $rafiParent)->assertOk()->json('data'));
        $this->api('GET', $host, "parent/children/{$d['nila']->id}/online-classes", $rafiParent)->assertNotFound();
        $this->api('GET', $host, 'online-classes', $rafi)->assertForbidden();
        $this->assertSame(1, Tenancy::as($i, fn () => AuditLog::where('action', 'online_class.cancelled')->count()));
    }

    public function test_staff_keys_private_batch_and_other_institution(): void
    {
        [$i, $admin, $d, $host] = $this->school('ocl2');
        [$tu, $t] = $this->teacher($i, 'T-1');
        $c = $this->api('POST', $host, 'online-classes', $tu, ['title' => 'Physics', 'program_id' => $d['p']->id, 'meeting_link' => 'https://zoom.example.test/j/1', 'scheduled_at' => '2026-11-22 10:00'])->assertCreated()->json('data');

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
        [$reader, $rd] = $staff('OclReader', ['staff.online_class.read']);
        [$manager, $md] = $staff('OclManager', ['staff.online_class.manage']);
        $as($reader, $rd, 'GET', 'online-classes')->assertOk()->assertJsonPath('data.0.id', $c['id']);
        $as($reader, $rd, 'DELETE', "online-classes/{$c['id']}")->assertForbidden();
        $as($manager, $md, 'PUT', "online-classes/{$c['id']}", ['title' => 'Physics 2'])->assertOk();
        $as($manager, $md, 'GET', 'online-classes')->assertForbidden();

        [$j, $otherAdmin, , $otherHost] = $this->school('ocl3');
        $this->api('PUT', $otherHost, "online-classes/{$c['id']}", $otherAdmin, ['title' => 'x'])->assertNotFound();

        $tutor = $this->makeInstitution('ocl-tutor', 'private_batch');
        $this->assertTrue(app(\App\Services\ModuleGate::class)->allows($tutor, 'online_class'), 'D231: private batch too');
    }
}
