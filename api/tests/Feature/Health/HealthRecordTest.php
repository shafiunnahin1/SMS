<?php

namespace Tests\Feature\Health;

use App\Models\{AuditLog, Batch, BatchTeacher, Program, Student, StudentHealthRecord, Teacher, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D235 HLT.1 (extended-features.md section 6): one record per student written by the admin (and staff with staff.health.manage);
// read by the admin, staff with staff.health.read and the parents; a teacher sees only the emergency fields of their own batches;
// the audit log names the changed fields, never the values; the class report counts; another institution 404.
class HealthRecordTest extends TestCase
{
    use RefreshDatabase;

    public function test_record_access_audit_and_report(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $i = $this->makeInstitution('hlt1', 'school');
        $admin = $this->makeUser($i, 'admin');
        [$p, $a, $b, $rafi, $mitu, $nila] = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 8']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $svc = app(StudentService::class);
            return [$p, $a, $b, $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $a), $svc->create(['name' => 'Mitu', 'guardian_phone' => '01722222222'], $a),
                $svc->create(['name' => 'Nila', 'guardian_phone' => '01733333333'], $b)];
        });
        $host = $this->hostOf($i);
        $tu = User::create(['institution_id' => $i->id, 'name' => 'Teacher A', 'email' => "ta-{$i->id}@example.test", 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
        $tu->forceFill(['must_change_password' => false])->save();
        Tenancy::as($i, fn () => BatchTeacher::create(['batch_id' => $a->id, 'teacher_id' => Teacher::create(['user_id' => $tu->id, 'employee_id' => 'T-A', 'status' => 'active'])->id, 'subject_id' => 0]));

        $this->assertFalse($this->api('GET', $host, "students/{$rafi->id}/health", $admin)->assertOk()->json('data.exists'));
        $this->api('PUT', $host, "students/{$rafi->id}/health", $admin, ['blood_group' => 'Z+'])->assertStatus(422)->assertJsonValidationErrors('blood_group');
        $this->api('PUT', $host, "students/{$rafi->id}/health", $admin, ['height_cm' => '142.5', 'weight_kg' => '38', 'blood_group' => 'B+', 'medical_conditions' => 'Peanut allergy',
            'emergency_contact' => 'Abdul Karim (father)', 'emergency_phone' => '01700000000', 'doctor_name' => 'Dr. Rahman', 'last_checkup_date' => '2026-10-01'])->assertOk()->assertJsonPath('data.record.height_cm', '142.5');
        $this->api('PUT', $host, "students/{$rafi->id}/health", $admin, ['weight_kg' => '39', 'blood_group' => 'B+'])->assertOk();
        $this->api('PUT', $host, "students/{$mitu->id}/health", $admin, ['blood_group' => 'O+'])->assertOk();
        $this->assertSame(2, Tenancy::as($i, fn () => StudentHealthRecord::count()), 'one record per student, updated in place');

        $audits = Tenancy::as($i, fn () => AuditLog::where('action', 'health.updated')->orderBy('id')->get());
        $this->assertSame(['weight_kg'], $audits[1]->new_data['fields'], 'only the changed field names');
        $this->assertStringNotContainsString('Peanut', json_encode($audits->pluck('new_data')->all()), 'never the health values');

        $t = $this->api('GET', $host, "students/{$rafi->id}/health", $tu)->assertOk()->json('data.record');
        $this->assertSame(['blood_group', 'medical_conditions', 'emergency_contact', 'emergency_phone'], array_keys($t));
        $this->api('GET', $host, "students/{$nila->id}/health", $tu)->assertForbidden();
        $this->api('PUT', $host, "students/{$rafi->id}/health", $tu, ['blood_group' => 'A+'])->assertForbidden();

        $parent = Tenancy::as($i, fn () => Student::find($rafi->id)->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $this->assertSame(['39.0', 'Peanut allergy'], [$this->api('GET', $host, "parent/children/{$rafi->id}/health", $parent)->assertOk()->json('data.record.weight_kg'), $this->api('GET', $host, "parent/children/{$rafi->id}/health", $parent)->json('data.record.medical_conditions')]);
        $this->api('GET', $host, "parent/children/{$nila->id}/health", $parent)->assertNotFound();
        $this->api('GET', $host, "students/{$rafi->id}/health", $parent)->assertForbidden();

        $report = $this->api('GET', $host, "health/reports/{$p->id}", $admin)->assertOk()->json('data');
        $this->assertSame([3, 2, 1, ['B+' => 1, 'O+' => 1], 1, 1], [$report['students'], $report['records'], $report['missing'], $report['blood_groups'], $report['with_conditions'], $report['no_blood_group']]);
        $this->assertSame(1, $this->api('GET', $host, "health/reports/{$p->id}", $admin, ['batch_id' => $b->id])->json('data.missing'));
        $this->api('GET', $host, 'health/reports/abc', $admin)->assertNotFound();

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
        [$nurse, $nd] = $staff('Nurse', ['staff.health.read', 'staff.health.manage']);
        [$clerk, $cd] = $staff('Clerk', ['staff.health.read']);
        $as($nurse, $nd, 'PUT', "students/{$nila->id}/health", ['blood_group' => 'A-'])->assertOk();
        $as($clerk, $cd, 'GET', "students/{$nila->id}/health")->assertOk()->assertJsonPath('data.record.blood_group', 'A-');
        $as($clerk, $cd, 'PUT', "students/{$nila->id}/health", ['blood_group' => 'A+'])->assertForbidden();

        $j = $this->makeInstitution('hlt2', 'school');
        $other = $this->makeUser($j, 'admin');
        $this->api('GET', $this->hostOf($j), "students/{$rafi->id}/health", $other)->assertNotFound();
        $this->api('GET', $this->hostOf($j), "health/reports/{$p->id}", $other)->assertNotFound();
    }
}
