<?php

namespace Tests\Feature\Attendance;

use App\Models\{Attendance, Batch, ParentStudent, Program, Teacher};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// docs/TESTING.md "ParentAttendanceAccessTest": the parent gets their own child's month; another child's id - in the same institution
// or another one - is a 404 (not 403). Plus the Step 4.3 rule that a teacher works only on their own batches.
class ParentAttendanceAccessTest extends TestCase
{
    use RefreshDatabase;

    private function setUpSchool(string $slug): array
    {
        Queue::fake();
        $i = $this->makeInstitution($slug, 'school');
        [$batch, $mine, $other] = Tenancy::as($i, function () {
            $batch = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']);
            $svc = app(StudentService::class);
            return [$batch, $svc->create(['name' => 'Mine', 'guardian_phone' => '01711110001'], $batch), $svc->create(['name' => 'Other', 'guardian_phone' => '01711110002'], $batch)];
        });
        $parent = \App\Models\User::where('institution_id', $i->id)->where('phone', '01711110001')->first();
        $parent->forceFill(['must_change_password' => false])->save();
        Tenancy::as($i, fn () => Attendance::create(['student_id' => $mine->id, 'batch_id' => $batch->id, 'program_id' => $batch->program_id,
            'date' => now()->startOfMonth()->toDateString(), 'status' => 'absent']));
        return [$i, $parent, $mine, $other, $batch];
    }

    public function test_a_parent_sees_only_their_own_childs_month(): void
    {
        [$i, $parent, $mine, $other] = $this->setUpSchool('patt');
        $host = $this->hostOf($i);
        $this->api('GET', $host, "parent/children/{$mine->id}/attendance", $parent)->assertOk()
            ->assertJsonPath('data.student.name', 'Mine')->assertJsonPath('data.absent', 1)->assertJsonPath('data.daily_records.0.status', 'absent');
        $this->api('GET', $host, "parent/children/{$other->id}/attendance", $parent)->assertNotFound();

        [, , $foreign] = $this->setUpSchool('patt2');
        $this->api('GET', $host, "parent/children/{$foreign->id}/attendance", $parent)->assertNotFound();
        $this->assertSame(1, Tenancy::as($i, fn () => ParentStudent::where('parent_user_id', $parent->id)->count()));
    }

    public function test_a_teacher_works_only_on_their_own_batch(): void
    {
        [$i, , $mine, , $batch] = $this->setUpSchool('tatt');
        $host = $this->hostOf($i);
        $teacher = $this->makeUser($i, 'teacher');
        $sheet = fn () => $this->api('GET', $host, "attendance?batch_id={$batch->id}&date=" . now()->toDateString(), $teacher);
        $sheet()->assertForbidden();
        $this->api('POST', $host, 'attendance', $teacher, ['batch_id' => $batch->id, 'date' => now()->toDateString(),
            'records' => [['student_id' => $mine->id, 'status' => 'present']]])->assertForbidden();

        Tenancy::as($i, fn () => $batch->forceFill(['teacher_id' => Teacher::create(['user_id' => $teacher->id, 'employee_id' => 'T1'])->id])->save());
        $sheet()->assertOk();
        $rec = Tenancy::as($i, fn () => Attendance::first());
        $this->api('PUT', $host, "attendance/{$rec->id}", $teacher, ['status' => 'leave'])->assertOk()->assertJsonPath('data.status', 'leave');
        $this->api('GET', $host, "attendance/report?batch_id={$batch->id}&month=" . now()->format('Y-m'), $teacher)->assertOk()
            ->assertJsonPath('data.rows.0.name', 'Mine')->assertJsonPath('data.rows.0.leave', 1);
        $this->api('GET', $host, "attendance/summary/{$mine->id}?month=" . now()->format('Y-m'), $teacher)->assertOk()->assertJsonPath('data.leave', 1);
    }
}
