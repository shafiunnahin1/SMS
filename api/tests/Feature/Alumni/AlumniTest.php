<?php

namespace Tests\Feature\Alumni;

use App\Models\{Alumnus, AuditLog, Batch, Program, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D243 ALM.1 (extended-features.md section 16): candidates from ended enrollments, adding from students and by hand, verify, edit,
// delete audited without contact data, stats per year, the public directory (off by default, verified only, no contact data),
// staff keys, the directory switch admin-only, coaching without the module, another institution 404.
class AlumniTest extends TestCase
{
    use RefreshDatabase;

    public function test_alumni_from_students_by_hand_directory_and_privacy(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-21 10:00:00');
        $i = $this->makeInstitution('alm1', 'school');
        $i->forceFill(['enabled_modules' => null])->save();
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        [$rafi, $nila, $tara] = Tenancy::as($i, function () {
            $b = Batch::create(['program_id' => Program::create(['name' => 'Class 10'])->id, 'name' => 'A']);
            $svc = app(StudentService::class);
            $r = $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $b);
            $n = $svc->create(['name' => 'Nila', 'guardian_phone' => '01733333333'], $b);
            $t = $svc->create(['name' => 'Tara', 'guardian_phone' => '01744444444'], $b);
            $r->enrollments()->update(['status' => 'completed', 'left_at' => '2025-12-31']);
            $n->enrollments()->update(['status' => 'transferred', 'left_at' => '2026-03-15']);
            return [$r, $n, $t];
        });

        $cands = $this->api('GET', $host, 'alumni/candidates', $admin)->assertOk()->json('data');
        $this->assertSame([[$rafi->id, 'Class 10', 2025], [$nila->id, 'Class 10', 2026]], array_map(fn ($c) => [$c['id'], $c['last_class'], $c['graduation_year']], $cands));
        $this->api('POST', $host, 'alumni/from-students', $admin, ['student_ids' => [$tara->id]])->assertStatus(422);
        $made = $this->api('POST', $host, 'alumni/from-students', $admin, ['student_ids' => [$rafi->id, $nila->id]])->assertCreated()->json('data');
        $this->assertSame(['Rafi', 'Nila'], array_column($made, 'name'));
        $this->assertSame([], $this->api('GET', $host, 'alumni/candidates', $admin)->json('data'));
        $this->assertCount(0, $this->api('POST', $host, 'alumni/from-students', $admin, ['student_ids' => [$rafi->id]])->json('data'), 'never twice');
        $old = $this->api('POST', $host, 'alumni', $admin, ['name' => 'Karim Old', 'graduation_year' => 1998, 'current_profession' => 'Doctor', 'current_institution' => 'DMCH',
            'phone' => '01799999999', 'email' => 'karim@example.test', 'address' => 'Dhaka'])->assertCreated()->json('data');
        $this->api('POST', $host, 'alumni', $admin, ['name' => 'X'])->assertStatus(422)->assertJsonValidationErrors('graduation_year');

        $this->api('PUT', $host, "alumni/{$made[0]['id']}", $admin, ['current_profession' => 'Engineer'])->assertOk()->assertJsonPath('data.current_profession', 'Engineer');
        $this->api('PATCH', $host, "alumni/{$old['id']}/verify", $admin, ['verified' => true])->assertOk()->assertJsonPath('data.is_verified', true);
        $this->api('PATCH', $host, "alumni/{$made[0]['id']}/verify", $admin, ['verified' => true])->assertOk();
        $this->assertSame(['Rafi'], array_column($this->api('GET', $host, 'alumni', $admin, ['q' => 'raf'])->json('data'), 'name'));
        $this->assertSame(['Karim Old'], array_column($this->api('GET', $host, 'alumni', $admin, ['year' => 1998])->json('data'), 'name'));
        $stats = $this->api('GET', $host, 'alumni/stats', $admin)->assertOk()->json('data');
        $this->assertSame(3, $stats['total']);
        $this->assertSame([['year' => 2026, 'total' => 1, 'verified' => 0], ['year' => 2025, 'total' => 1, 'verified' => 1], ['year' => 1998, 'total' => 1, 'verified' => 1]], $stats['years']);

        // the public directory: off until switched on; verified only; never contact data
        $this->getJson("http://{$host}/api/v1/public/alumni")->assertNotFound();
        $this->assertFalse($this->api('GET', $host, 'alumni/settings', $admin)->assertOk()->json('data.directory'));
        $this->api('PUT', $host, 'alumni/settings', $admin, ['directory' => true])->assertOk()->assertJsonPath('data.directory', true);
        $pub = $this->getJson("http://{$host}/api/v1/public/alumni")->assertOk();
        $this->assertSame(['Rafi', 'Karim Old'], array_column($pub->json('data'), 'name'));
        foreach (['01799999999', 'karim@example.test', 'Dhaka', 'phone', 'email', 'address'] as $hidden) $this->assertStringNotContainsString($hidden, $pub->getContent());
        $this->api('PATCH', $host, "alumni/{$old['id']}/verify", $admin, ['verified' => false])->assertOk();
        $this->assertSame(['Rafi'], array_column($this->getJson("http://{$host}/api/v1/public/alumni")->json('data'), 'name'), 'unverified leaves the directory');

        // delete on request: the audit keeps the name and year, never the contact data
        $this->api('DELETE', $host, "alumni/{$old['id']}", $admin)->assertOk();
        $this->assertNull(Tenancy::as($i, fn () => Alumnus::find($old['id'])));
        $logs = json_encode(Tenancy::as($i, fn () => AuditLog::pluck('new_data')->all()));
        $this->assertStringContainsString('Karim Old', $logs);
        foreach (['01799999999', 'karim@example.test'] as $hidden) $this->assertStringNotContainsString($hidden, $logs);

        // teachers out; staff keys; the switch is the admin's
        $this->api('GET', $host, 'alumni', $this->makeUser($i, 'teacher'))->assertForbidden();
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
        [$reader, $rd] = $staff('AlmReader', ['staff.alumni.read']);
        [$keeper, $kd] = $staff('AlmKeeper', ['staff.alumni.manage']);
        $as($reader, $rd, 'GET', 'alumni')->assertOk();
        $as($reader, $rd, 'POST', 'alumni', ['name' => 'Y', 'graduation_year' => 2001])->assertForbidden();
        $as($keeper, $kd, 'POST', 'alumni', ['name' => 'Y', 'graduation_year' => 2001])->assertCreated();
        $as($keeper, $kd, 'PUT', 'alumni/settings', ['directory' => false])->assertForbidden();

        // another institution; coaching without the module
        $j = $this->makeInstitution('alm2', 'school');
        $this->api('GET', $this->hostOf($j), "alumni/{$made[0]['id']}", $this->makeUser($j, 'admin'))->assertNotFound();
        $c = $this->makeInstitution('almc', 'coaching');
        $this->api('GET', $this->hostOf($c), 'alumni', $this->makeUser($c, 'admin'))->assertForbidden();
    }
}
