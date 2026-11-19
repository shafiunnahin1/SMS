<?php

namespace Tests\Feature\Meeting;

use App\Models\{Batch, BatchTeacher, ParentMeeting, Program, Student, Teacher, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Artisan, Queue};
use Tests\TestCase;

// D235 MTG.1 (extended-features.md section 14): a teacher requests a meeting only for their own students, the admin for any teacher;
// the parent confirms, asks for another time (stays pending, the teacher is told) or cancels; re-timing goes back to pending and
// tells the parents; completing needs the day to have come; in-app notices and the evening reminder (no SMS); the parent may
// request one with their child's teacher only; staff keys; another institution 404.
class ParentMeetingTest extends TestCase
{
    use RefreshDatabase;

    private function teacher($i, string $code, ?Batch $batch): array
    {
        $u = User::create(['institution_id' => $i->id, 'name' => "Teacher {$code}", 'email' => strtolower($code) . "-{$i->id}@example.test", 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
        $u->forceFill(['must_change_password' => false])->save();
        $t = Tenancy::as($i, function () use ($u, $code, $batch) {
            $t = Teacher::create(['user_id' => $u->id, 'employee_id' => $code, 'status' => 'active']);
            if ($batch) BatchTeacher::create(['batch_id' => $batch->id, 'teacher_id' => $t->id, 'subject_id' => 0]);
            return $t;
        });
        return [$u, $t];
    }

    public function test_requests_confirm_retime_cancel_complete_and_reminders(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $i = $this->makeInstitution('mtg1', 'school');
        $admin = $this->makeUser($i, 'admin');
        [$a, $b, $rafi, $mitu] = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 8']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $svc = app(StudentService::class);
            return [$a, $b, $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $a), $svc->create(['name' => 'Mitu', 'guardian_phone' => '01722222222'], $b)];
        });
        [$tu, $t] = $this->teacher($i, 'T-A', $a);
        [$tu2, $t2] = $this->teacher($i, 'T-B', $b);
        $host = $this->hostOf($i);
        $parent = Tenancy::as($i, fn () => Student::find($rafi->id)->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $base = ['subject' => 'Math results', 'proposed_date' => '2026-11-25', 'proposed_time' => '15:30'];

        $this->api('POST', $host, 'meetings', $tu, ['student_id' => $mitu->id] + $base)->assertStatus(422)->assertJsonValidationErrors('student_code');
        $this->api('POST', $host, 'meetings', $tu, ['student_id' => $rafi->id, 'proposed_date' => '2026-11-19'] + $base)->assertStatus(422)->assertJsonValidationErrors('proposed_date');
        $code = Tenancy::as($i, fn () => Student::find($rafi->id)->student_id);
        $m = $this->api('POST', $host, 'meetings', $tu, ['student_code' => $code] + $base)->assertCreated()->json('data');
        $this->assertSame(['pending', 'teacher', $t->id], [$m['status'], $m['requested_by'], $m['teacher']['id']]);
        $this->assertSame('meeting_requested', $parent->notifications()->first()->data['type']);
        $this->api('POST', $host, 'meetings', $admin, ['student_id' => $mitu->id] + $base)->assertStatus(422)->assertJsonValidationErrors('teacher_id');
        $am = $this->api('POST', $host, 'meetings', $admin, ['student_id' => $mitu->id, 'teacher_id' => $t2->id, 'location' => 'Principal room'] + $base)->assertCreated()->json('data');

        $this->api('PUT', $host, "meetings/{$am['id']}", $tu, ['subject' => 'x'])->assertForbidden();
        $this->assertSame([$m['id']], array_column($this->api('GET', $host, 'meetings', $tu)->json('data'), 'id'), 'a teacher lists their own');
        $this->assertCount(2, $this->api('GET', $host, 'meetings', $admin)->json('data'));

        // the parent: their own meetings, asks for another time, then confirms after the teacher re-times
        $this->assertSame([$m['id']], array_column($this->api('GET', $host, 'parent/meetings', $parent)->json('data'), 'id'));
        $this->api('PATCH', $host, "parent/meetings/{$am['id']}/confirm", $parent)->assertNotFound();
        $this->api('PATCH', $host, "parent/meetings/{$m['id']}/reschedule", $parent, ['note' => 'Office hours; after 5 pm please'])->assertOk()->assertJsonPath('data.status', 'pending');
        $this->assertSame('meeting_parent_retime', $tu->notifications()->first()->data['type']);
        $this->api('PUT', $host, "meetings/{$m['id']}", $tu, ['proposed_time' => '17:30'])->assertOk()->assertJsonPath('data.time', '17:30');
        $this->assertContains('meeting_retimed', $parent->fresh()->notifications()->get()->pluck('data.type')->all());
        $this->api('PATCH', $host, "parent/meetings/{$m['id']}/confirm", $parent)->assertOk()->assertJsonPath('data.status', 'confirmed');
        $this->api('PATCH', $host, "parent/meetings/{$m['id']}/confirm", $parent)->assertStatus(409);

        // the reminder the evening before, then completing on the day
        $this->travelTo('2026-11-24 18:00:00');
        Artisan::call('meetings:remind');
        $this->assertSame(1, $parent->fresh()->notifications()->where('data->type', 'meeting_reminder')->count());
        $this->assertSame(1, $tu->fresh()->notifications()->where('data->type', 'meeting_reminder')->count());
        $this->api('PATCH', $host, "meetings/{$m['id']}/complete", $tu, ['notes' => 'Extra practice agreed'])->assertStatus(422)->assertJsonPath('error', 'meeting_not_yet');
        $this->travelTo('2026-11-25 18:00:00');
        $done = $this->api('PATCH', $host, "meetings/{$m['id']}/complete", $tu, ['notes' => 'Extra practice agreed'])->assertOk()->json('data');
        $this->assertSame('completed', $done['status']);
        $this->assertStringContainsString('Extra practice agreed', $done['notes']);
        $this->api('PATCH', $host, "meetings/{$m['id']}/cancel", $tu)->assertStatus(409);
        $this->api('PATCH', $host, "meetings/{$am['id']}/cancel", $admin, ['reason' => 'Teacher on leave'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(2, Tenancy::as($i, fn () => ParentMeeting::count()), 'cancelled, never deleted');

        // the parent asks for a meeting with their child's teacher only
        $this->assertSame([$t->id], array_column($this->api('GET', $host, "parent/children/{$rafi->id}/teachers", $parent)->assertOk()->json('data'), 'id'));
        $this->api('POST', $host, 'parent/meetings', $parent, ['student_id' => $rafi->id, 'teacher_id' => $t2->id, 'subject' => 'x', 'proposed_date' => '2026-12-01', 'proposed_time' => '10:00'])->assertStatus(422)->assertJsonValidationErrors('teacher_id');
        $this->api('POST', $host, 'parent/meetings', $parent, ['student_id' => $mitu->id, 'teacher_id' => $t2->id, 'subject' => 'x', 'proposed_date' => '2026-12-01', 'proposed_time' => '10:00'])->assertNotFound();
        $pm = $this->api('POST', $host, 'parent/meetings', $parent, ['student_id' => $rafi->id, 'teacher_id' => $t->id, 'subject' => 'Homework load', 'proposed_date' => '2026-12-01', 'proposed_time' => '10:00'])->assertCreated()->json('data');
        $this->assertSame('parent', $pm['requested_by']);
        $this->assertContains('meeting_parent_requested', $tu->fresh()->notifications()->get()->pluck('data.type')->all());
        $this->api('PATCH', $host, "parent/meetings/{$pm['id']}/cancel", $parent)->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->api('GET', $host, 'meetings', $parent)->assertForbidden();

        $j = $this->makeInstitution('mtg2', 'school');
        $other = $this->makeUser($j, 'admin');
        $this->api('PUT', $this->hostOf($j), "meetings/{$am['id']}", $other, ['subject' => 'x'])->assertNotFound();
    }
}
