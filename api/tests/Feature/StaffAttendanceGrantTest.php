<?php

namespace Tests\Feature;

use App\Models\{Attendance, AuditLog, Batch, Institution, Program, StaffAttendanceGrant, Student, Teacher, User};
use App\Services\{DepartmentService, EnrollmentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D169 (4) STW.5: the head / admin or the batch's teacher in charge (not another teacher, not staff) grants and revokes; a staff
// member takes or corrects a batch's attendance only with BOTH the selected department's key and an active grant; the staff list
// shows only granted batches (owner 2026-10-27 "খ"); a repeat grant changes nothing; every grant, revoke and staff save is audited.
class StaffAttendanceGrantTest extends TestCase
{
    use RefreshDatabase;

    private function asStaff(Institution $i, User $staff, $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $staff->createToken('stw5')->plainTextToken];
        if ($department !== null) $headers['X-Department-Id'] = (string) $department;
        return $this->json($method, 'http://' . $this->hostOf($i) . '/api/v1/' . $path, $body, $headers);
    }

    public function test_grants_and_staff_attendance(): void
    {
        Queue::fake();
        $this->travelTo('2026-10-20 10:00:00');
        $i = $this->makeInstitution('stwatt', 'school');
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $admin = $this->makeUser($i, 'admin');
        $classTeacher = $this->makeUser($i, 'teacher');
        $otherTeacher = User::create(['institution_id' => $i->id, 'name' => 'Other teacher', 'email' => 'other-teacher@example.test', 'password' => 'Teacher-pass-42', 'role' => 'teacher', 'is_active' => true]);
        $staff = $this->makeUser($i, 'institution_staff');
        [$office, $accounts, $batch, $other, $student] = Tenancy::as($i, function () use ($admin, $staff, $classTeacher, $otherTeacher) {
            $s = app(DepartmentService::class);
            $office = $s->create($admin, ['name' => 'Office']);
            $m = $s->addMember($admin, $office->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $office->id, ['code' => 'ATT', 'name' => 'Attendance', 'permission_keys' => ['staff.attendance.index', 'staff.attendance.store', 'staff.attendance.update']]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
            $accounts = $s->create($admin, ['name' => 'Accounts']);
            $s->addMember($admin, $accounts->id, ['user_id' => $staff->id]);
            $t = Teacher::create(['user_id' => $classTeacher->id, 'employee_id' => 'T-1', 'status' => 'active']);
            Teacher::create(['user_id' => $otherTeacher->id, 'employee_id' => 'T-2', 'status' => 'active']);
            $p = Program::create(['name' => 'Class 8']);
            $batch = Batch::create(['program_id' => $p->id, 'name' => 'A', 'status' => 'running', 'teacher_id' => $t->id]);
            $other = Batch::create(['program_id' => $p->id, 'name' => 'B', 'status' => 'running']);
            $st = Student::create(['student_id' => 'S-1', 'guardian_phone' => '01711111111']);
            app(EnrollmentService::class)->enroll($st, $batch, ['enrolled_at' => '2026-10-01']);
            return [$office, $accounts, $batch, $other, $st];
        });
        $h = $this->hostOf($i);
        $sheet = fn ($dept, $b = null) => $this->asStaff($i, $staff, $dept, 'GET', 'attendance?batch_id=' . ($b ?? $batch)->id . '&date=2026-10-20');
        $save = fn ($dept, $b = null) => $this->asStaff($i, $staff, $dept, 'POST', 'attendance', ['batch_id' => ($b ?? $batch)->id, 'date' => '2026-10-20',
            'records' => [['student_id' => $student->id, 'status' => 'present']]]);

        // no grant yet: the key alone is not enough, and the list is empty
        $sheet($office->id)->assertForbidden();
        $this->assertSame([], $this->asStaff($i, $staff, null, 'GET', 'staff/attendance-batches')->assertOk()->json('data'));

        // who may grant: the head and the class teacher; not another teacher; not staff
        $this->api('POST', $h, "batches/{$batch->id}/attendance-grants", $otherTeacher, ['user_id' => $staff->id])->assertForbidden();
        $this->asStaff($i, $staff, $office->id, 'POST', "batches/{$batch->id}/attendance-grants", ['user_id' => $staff->id])->assertForbidden();
        $this->api('POST', $h, "batches/{$batch->id}/attendance-grants", $classTeacher, ['user_id' => $otherTeacher->id])->assertStatus(422);   // only staff
        $grantId = $this->api('POST', $h, "batches/{$batch->id}/attendance-grants", $classTeacher, ['user_id' => $staff->id])->assertCreated()->json('data.id');
        $this->api('POST', $h, "batches/{$batch->id}/attendance-grants", $admin, ['user_id' => $staff->id])->assertOk()->assertJsonPath('data.id', $grantId);   // one active grant
        $this->assertSame(1, Tenancy::as($i, fn () => StaffAttendanceGrant::count()));
        $listed = $this->api('GET', $h, "batches/{$batch->id}/attendance-grants", $classTeacher)->assertOk()->json('data');
        $this->assertSame([$staff->id], array_column(array_column($listed['grants'], 'user'), 'id'));
        $this->assertContains($staff->id, array_column($listed['staff'], 'id'));
        $this->api('GET', $h, "batches/{$other->id}/attendance-grants", $classTeacher)->assertForbidden();   // not their batch

        // with the grant: only the granted batch is listed; the key must be in the selected department
        $this->assertSame([$batch->id], array_column($this->asStaff($i, $staff, null, 'GET', 'staff/attendance-batches')->json('data'), 'id'));
        $sheet($office->id)->assertOk();
        $sheet($accounts->id)->assertForbidden();
        $sheet(null)->assertForbidden();
        $sheet($office->id, $other)->assertForbidden();   // no grant for that batch
        $save($office->id)->assertCreated();
        $record = Tenancy::as($i, fn () => Attendance::where('batch_id', $batch->id)->sole());
        $this->asStaff($i, $staff, $office->id, 'PUT', "attendance/{$record->id}", ['status' => 'late'])->assertOk();
        Tenancy::as($i, function () use ($staff, $office, $grantId) {
            $saved = AuditLog::where('action', 'attendance.staff_saved')->sole();
            $this->assertSame([$staff->id, $office->id, $grantId], [$saved->user_id, $saved->new_data['department_id'], $saved->new_data['grant_id']]);
            $this->assertSame(1, AuditLog::where('action', 'attendance.staff_corrected')->count());
            $this->assertSame(1, AuditLog::where('action', 'attendance.grant_given')->count());
        });

        // revoked by the head: the staff member is out again, the list is empty
        $this->api('DELETE', $h, "attendance-grants/{$grantId}", $admin)->assertOk();
        $save($office->id)->assertForbidden();
        $this->asStaff($i, $staff, $office->id, 'PUT', "attendance/{$record->id}", ['status' => 'present'])->assertForbidden();
        $this->assertSame([], $this->asStaff($i, $staff, null, 'GET', 'staff/attendance-batches')->json('data'));
        $this->assertSame(1, Tenancy::as($i, fn () => AuditLog::where('action', 'attendance.grant_revoked')->count()));
        // the class teacher may revoke too (a new grant, then revoke)
        $again = $this->api('POST', $h, "batches/{$batch->id}/attendance-grants", $admin, ['user_id' => $staff->id])->assertCreated()->json('data.id');
        $this->api('DELETE', $h, "attendance-grants/{$again}", $otherTeacher)->assertForbidden();
        $this->api('DELETE', $h, "attendance-grants/{$again}", $classTeacher)->assertOk();
    }
}
