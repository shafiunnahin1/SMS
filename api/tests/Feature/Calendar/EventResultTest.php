<?php

namespace Tests\Feature\Calendar;

use App\Models\{AuditLog, EventRegistration, EventResult, Program, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D242 EVT.1: attendance and results on or after the event date; with registration only attended students win; one result per
// student; corrections / removals audited; one notice to the winner's parents; awards for the student and parent; points per class;
// an event with results cannot be deleted; staff keys; coaching without the module; another institution 404.
class EventResultTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_attendance_results_points_and_awards(): void
    {
        $this->travelTo('2026-11-21 10:00:00');
        $s = $this->school('evr');
        [$h, $admin] = [$s['host'], $s['admin']];
        $race = $this->api('POST', $h, 'events', $admin, ['title' => 'Race', 'type' => 'sports', 'event_date' => '2026-11-25', 'target_audience' => 'students',
            'registration_required' => true, 'registration_deadline' => '2026-11-24'])->assertCreated()->json('data.id');
        $quiz = $this->api('POST', $h, 'events', $admin, ['title' => 'Quiz bee', 'type' => 'academic', 'event_date' => '2026-11-25', 'target_audience' => 'all'])->assertCreated()->json('data.id');
        foreach (['mine', 'other'] as $k) {
            $u = Tenancy::as($s['i'], fn () => $s[$k]->user);
            $u->forceFill(['must_change_password' => false])->save();
            $this->api('POST', $h, "events/{$race}/register", $u)->assertCreated();
        }
        $this->api('POST', $h, "events/{$race}/results", $admin, ['student_id' => $s['mine']->id, 'position' => 1])->assertStatus(422)->assertJsonValidationErrors('event');
        $this->api('PATCH', $h, "events/{$race}/attendance", $admin, ['status' => 'attended'])->assertStatus(422);

        $this->travelTo('2026-11-25 15:00:00');
        $this->assertSame(2, $this->api('PATCH', $h, "events/{$race}/attendance", $admin, ['status' => 'attended'])->assertOk()->json('data.updated'));
        $this->api('PATCH', $h, "events/{$race}/attendance/{$s['other']->id}", $admin, ['status' => 'absent'])->assertOk();
        $this->api('PATCH', $h, "events/{$race}/attendance/{$s['sister']->id}", $admin, ['status' => 'absent'])->assertNotFound();
        $this->api('POST', $h, "events/{$race}/results", $admin, ['student_id' => $s['other']->id, 'position' => 2])->assertStatus(422)->assertJsonValidationErrors('student_id');
        $win = $this->api('POST', $h, "events/{$race}/results", $admin, ['student_id' => $s['mine']->id, 'position' => 1, 'award' => 'Gold', 'points' => 10])->assertCreated()->json('data');
        $this->api('POST', $h, "events/{$race}/results", $admin, ['student_id' => $s['mine']->id, 'position' => 2])->assertStatus(422);
        // no registration needed: any student
        $this->api('POST', $h, "events/{$quiz}/results", $admin, ['student_id' => $s['sister']->id, 'position' => 1, 'points' => 6])->assertCreated();
        $third = $this->api('POST', $h, "events/{$quiz}/results", $admin, ['student_id' => $s['other']->id, 'position' => 3, 'points' => 2])->assertCreated()->json('data.id');

        $c = $this->api('GET', $h, "events/{$race}/competition", $admin)->assertOk()->json('data');
        $this->assertSame(['attended', 'absent'], array_column($c['registrations'], 'status'));
        $this->assertSame([1], array_column($c['results'], 'position'));
        $this->api('PUT', $h, "event-results/{$win['id']}", $admin, ['points' => 12, 'certificate_issued' => true])->assertOk()->assertJsonPath('data.points', 12);
        $this->api('DELETE', $h, "event-results/{$third}", $admin)->assertOk();
        $this->assertSame(10, Tenancy::as($s['i'], fn () => AuditLog::where('action', 'event.result_corrected')->sole()->new_data['was']['points']));
        $this->assertSame(3, Tenancy::as($s['i'], fn () => AuditLog::where('action', 'event.result_removed')->sole()->new_data['was']['position']));

        // the parent of Mine and Sister: one notice per result added (the removed one was another family's)
        $this->assertSame(2, $s['parent']->notifications()->where('data->type', 'event_result')->count());
        $awards = $this->api('GET', $h, "parent/children/{$s['mine']->id}/awards", $s['parent'])->assertOk()->json('data');
        $this->assertSame(['Race', 1, 'Gold', 12, true], [$awards[0]['event']['title'], $awards[0]['position'], $awards[0]['award'], $awards[0]['points'], $awards[0]['certificate_issued']]);
        $this->api('GET', $h, "parent/children/{$s['other']->id}/awards", $s['parent'])->assertNotFound();
        $mineUser = Tenancy::as($s['i'], fn () => $s['mine']->user);
        $this->assertSame(['Race'], array_column(array_column($this->api('GET', $h, 'student/awards', $mineUser)->assertOk()->json('data'), 'event'), 'title'));

        // points per class: Class 10 has 12 + 6
        Tenancy::as($s['i'], fn () => Program::create(['name' => 'Class 9']));   // a class with no results is not listed
        $pts = $this->api('GET', $h, 'events/points', $admin, ['from' => '2026-11-01', 'to' => '2026-11-30'])->assertOk()->json('data.classes');
        $this->assertSame([['program' => ['id' => $s['p']->id, 'name' => 'Class 10'], 'points' => 18, 'firsts' => 2, 'results' => 2]], $pts);

        // an event with results is kept
        $this->api('DELETE', $h, "events/{$race}", $admin)->assertStatus(422)->assertJsonPath('error', 'event_has_results');
        $this->assertSame(2, Tenancy::as($s['i'], fn () => EventResult::count()));

        // staff keys
        $s['i']->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = function (string $name, array $keys) use ($s, $admin) {
            $u = User::create(['institution_id' => $s['i']->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
            $u->forceFill(['must_change_password' => false])->save();
            $dep = Tenancy::as($s['i'], function () use ($u, $name, $keys, $admin) {
                $svc = app(\App\Services\DepartmentService::class);
                $dep = $svc->create($admin, ['name' => "Dept {$name}"]);
                $m = $svc->addMember($admin, $dep->id, ['user_id' => $u->id]);
                $svc->assignDuties($admin, $m->id, ['duty_ids' => [$svc->createDuty($admin, $dep->id, ['code' => strtoupper($name), 'name' => $name, 'permission_keys' => $keys])->id]]);
                return $dep->id;
            });
            return [$u, $dep];
        };
        $as = function (User $u, int $dep, string $method, string $path, array $body = []) use ($h) {
            $this->app['auth']->forgetGuards();
            return $this->json($method, "http://{$h}/api/v1/{$path}", $body, ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken, 'X-Department-Id' => (string) $dep]);
        };
        [$reader, $rd] = $staff('EvtReader', ['staff.event.read']);
        [$keeper, $kd] = $staff('EvtKeeper', ['staff.event.manage']);
        $as($reader, $rd, 'GET', "events/{$quiz}/competition")->assertOk();
        $as($reader, $rd, 'POST', "events/{$quiz}/results", ['student_id' => $s['other']->id])->assertForbidden();
        $as($keeper, $kd, 'POST', "events/{$quiz}/results", ['student_id' => $s['other']->id, 'position' => 2])->assertCreated();

        // another institution; coaching has the D213 events but not the competition part
        $j = $this->makeInstitution('evr2', 'school');
        $this->api('PUT', $this->hostOf($j), "event-results/{$win['id']}", $this->makeUser($j, 'admin'), ['points' => 1])->assertNotFound();
        $c2 = $this->makeInstitution('evrc', 'coaching');
        $this->api('GET', $this->hostOf($c2), 'events/points', $this->makeUser($c2, 'admin'), ['from' => '2026-11-01', 'to' => '2026-11-30'])->assertForbidden();
        $this->assertSame(2, Tenancy::as($s['i'], fn () => EventRegistration::where('event_id', $race)->count()));
    }
}
