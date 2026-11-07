<?php

namespace Tests\Feature\Routines;

use App\Models\{Routine, Student, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D193 RTN.1 (routine.md + its D96 rules): the admin builds the week; the same teacher, the same class (a whole-program slot clashes
// with every batch) and the same room at overlapping times are refused (422 routine_conflict); back-to-back periods are allowed;
// an edit is not in conflict with itself; a teacher reads their own week and today; a student reads only their own class.
class RoutineTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_conflicts_edits_and_who_reads_what(): void
    {
        $s = $this->school('rtn');
        $karim = Tenancy::as($s['i'], fn () => Teacher::where('user_id', $s['karimUser']->id)->value('id'));
        $other = Tenancy::as($s['i'], fn () => Teacher::where('user_id', $s['otherUser']->id)->value('id'));
        $slot = fn (array $f) => $f + ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim, 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45', 'room_no' => '101'];
        $post = fn (array $f) => $this->api('POST', $s['host'], 'routines', $s['admin'], $slot($f));

        $first = $post([])->assertCreated()->json('data.id');
        $post(['batch_id' => $s['b']->id, 'room_no' => '102', 'start_time' => '09:30', 'end_time' => '10:15'])->assertStatus(422)->assertJsonPath('error', 'routine_conflict');   // teacher
        $post(['teacher_id' => $other, 'room_no' => '102', 'subject_id' => $s['physics']->id])->assertStatus(422);                                                                    // class
        $post(['teacher_id' => $other, 'batch_id' => $s['b']->id, 'subject_id' => $s['physics']->id])->assertStatus(422);                                                            // room
        $post(['teacher_id' => $other, 'batch_id' => null, 'room_no' => '103', 'subject_id' => $s['physics']->id])->assertStatus(422);                                                // whole program vs batch A
        $post(['start_time' => '09:45', 'end_time' => '10:30'])->assertCreated();                                                                                                       // back to back
        $post(['teacher_id' => $other, 'batch_id' => $s['b']->id, 'room_no' => '102', 'subject_id' => $s['physics']->id, 'day_of_week' => 'mon'])->assertCreated();
        $post(['end_time' => '08:00'])->assertStatus(422);                                                                                                                               // end before start
        $this->api('PUT', $s['host'], "routines/{$first}", $s['admin'], $slot(['end_time' => '09:40']))->assertOk()->assertJsonPath('data.end_time', '09:40');                   // not in conflict with itself

        // readers
        $this->assertCount(3, $this->api('GET', $s['host'], "routines?program_id={$s['p']->id}", $s['admin'])->assertOk()->json('data'));
        $this->assertCount(2, $this->api('GET', $s['host'], "routines?program_id={$s['p']->id}&batch_id={$s['a']->id}", $s['admin'])->json('data'));
        $this->assertCount(2, $this->api('GET', $s['host'], 'routines/teacher', $s['karimUser'])->assertOk()->json('data'));
        $this->travelTo(now()->next('Sunday')->setTime(8, 0));
        $this->assertCount(2, $this->api('GET', $s['host'], 'routines/today', $s['karimUser'])->assertOk()->json('data'));
        $this->travelTo(now()->next('Friday'));
        $this->assertCount(0, $this->api('GET', $s['host'], 'routines/today', $s['karimUser'])->json('data'));

        $su = Tenancy::as($s['i'], function () use ($s) {
            $u = User::create(['institution_id' => $s['i']->id, 'name' => 'Sister', 'username' => 'RTN-S1', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
            Student::whereKey($s['sister']->id)->update(['user_id' => $u->id]);
            return $u;
        });
        $mine = $this->api('GET', $s['host'], "routines?batch_id={$s['a']->id}", $su)->assertOk()->json('data');   // the filter is ignored: batch B only
        $this->assertSame(['mon'], array_column($mine, 'day_of_week'));

        $this->api('DELETE', $s['host'], "routines/{$first}", $s['admin'])->assertOk();
        $this->assertSame(2, Tenancy::as($s['i'], fn () => Routine::count()));
        $this->api('POST', $s['host'], 'routines', $s['karimUser'], $slot(['day_of_week' => 'tue']))->assertForbidden();
        $this->api('POST', $s['host'], 'routines', $su, $slot(['day_of_week' => 'tue']))->assertForbidden();
    }

    public function test_validation_and_the_printed_routine(): void
    {
        $s = $this->school('rtnpdf');
        $o = $this->school('rtnpdf-other');
        $karim = Tenancy::as($s['i'], fn () => Teacher::where('user_id', $s['karimUser']->id)->value('id'));
        $theirTeacher = Tenancy::as($o['i'], fn () => Teacher::where('user_id', $o['karimUser']->id)->value('id'));
        $base = ['program_id' => $s['p']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim, 'day_of_week' => 'sat', 'start_time' => '10:00', 'end_time' => '10:45'];
        $this->api('POST', $s['host'], 'routines', $s['admin'], ['teacher_id' => $theirTeacher] + $base)->assertStatus(422)->assertJsonValidationErrors('teacher_id');
        $this->api('POST', $s['host'], 'routines', $s['admin'], ['subject_id' => $o['bangla']->id] + $base)->assertStatus(422)->assertJsonValidationErrors('subject_id');
        $this->api('POST', $s['host'], 'routines', $s['admin'], ['day_of_week' => 'fri'] + $base)->assertStatus(422)->assertJsonValidationErrors('day_of_week');
        $this->api('POST', $s['host'], 'routines', $s['admin'], $base + ['room_no' => 'Lab'])->assertCreated();

        $html = null;
        $this->mock(\App\Services\PdfService::class)->shouldReceive('render')->once()->andReturnUsing(function ($view, $data, $paper, $orientation) use (&$html) {
            $this->assertSame(['a4', 'landscape'], [$paper, $orientation]);
            $html = view($view, $data + ['institution' => Tenancy::current(), 'theme' => ['primary_color' => '#000000'], 'locale' => 'bn', 'dir' => 'ltr', 'logo' => null])->render();
            return '%PDF-routine';
        });
        $this->api('GET', $s['host'], "routines/{$s['p']->id}/print", $s['admin'])->assertOk()->assertHeader('Content-Type', 'application/pdf');
        foreach (['ক্লাস-রুটিন', 'Class 10', 'শনিবার', '10:00–10:45', 'বাংলা', 'Lab'] as $t) $this->assertStringContainsString($t, $html);
        $this->api('GET', $s['host'], "routines/{$o['p']->id}/print", $s['admin'])->assertNotFound();
    }
}
