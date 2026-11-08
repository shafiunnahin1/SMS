<?php

namespace Tests\Feature\Attendance;

use App\Jobs\NotifyAbsentParentsJob;
use App\Models\{Attendance, PeriodAttendance, Routine, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D197 AAD.4 (academics-advanced.md section 8 PeriodAttendanceTest): UNIQUE per student / period / date; only the period's teacher
// (or the admin) takes it; daily_from_periods off by default; first_period / majority / any; a hand-taken daily row wins; no SMS.
class PeriodAttendanceTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_periods_today_save_derive_and_report(): void
    {
        $this->travelTo('2026-11-08 12:00:00');                              // a Sunday
        $s = $this->school('pa');
        $h = $s['host'];
        $date = '2026-11-08';
        [$r1, $r2, $r3] = Tenancy::as($s['i'], function () use ($s) {
            $karim = Teacher::where('user_id', $s['karimUser']->id)->value('id');
            $other = Teacher::where('user_id', $s['otherUser']->id)->value('id');
            $mk = fn ($subject, $batch, $teacher, $start, $end) => Routine::create(['program_id' => $s['p']->id, 'batch_id' => $batch, 'subject_id' => $subject, 'teacher_id' => $teacher,
                'day_of_week' => 'sun', 'start_time' => $start, 'end_time' => $end])->id;
            return [$mk($s['bangla']->id, $s['a']->id, $karim, '09:00', '09:45'), $mk($s['physics']->id, $s['a']->id, $other, '10:00', '10:45'), $mk($s['bangla']->id, null, $karim, '11:00', '11:45')];
        });
        $save = fn ($u, $routine, $records, $d = null) => $this->api('POST', $h, 'period-attendance', $u, ['routine_id' => $routine, 'date' => $d ?? $date,
            'records' => array_map(fn ($k, $st) => ['student_id' => $s[$k]->id, 'status' => $st], array_keys($records), $records)]);

        // the teacher's periods of today with their class lists (a whole-program period lists every batch)
        $today = $this->api('GET', $h, 'teacher/periods/today', $s['karimUser'])->assertOk()->json('data');
        $this->assertSame([$r1, $r3], array_column($today['periods'], 'routine_id'));
        $this->assertSame([2, 3], array_map(fn ($p) => count($p['students']), $today['periods']));
        $this->assertFalse($today['daily_from_periods']);

        Queue::fake([NotifyAbsentParentsJob::class]);
        $save($s['karimUser'], $r2, ['mine' => 'present'])->assertForbidden();                   // another teacher's period
        $save($s['karimUser'], $r1, ['mine' => 'present'], '2026-11-07')->assertStatus(422)->assertJsonPath('error', 'period_wrong_day');
        $save($s['karimUser'], $r1, ['sister' => 'present'])->assertStatus(422)->assertJsonPath('error', 'not_enrolled');
        $save($s['karimUser'], $r1, ['mine' => 'absent', 'other' => 'absent'])->assertCreated()->assertJsonPath('data.derived', 0);
        $save($s['karimUser'], $r1, ['mine' => 'present', 'other' => 'absent'])->assertCreated();        // UNIQUE: updated, not doubled
        $this->assertSame(2, Tenancy::as($s['i'], fn () => PeriodAttendance::where('routine_id', $r1)->count()));
        $this->assertSame(0, Tenancy::as($s['i'], fn () => Attendance::count()));                      // off by default: no daily row

        // on, first_period: mine present first -> present; other absent first -> absent (physics later present)
        $set = function (string $rule) use ($s) { $s['i']->forceFill(['settings' => array_replace($s['i']->fresh()->settings ?? [], ['attendance' => ['daily_from_periods' => true, 'daily_rule' => $rule]])])->save(); };
        $set('first_period');
        $save($s['otherUser'], $r2, ['mine' => 'absent', 'other' => 'present'])->assertCreated()->assertJsonPath('data.derived', 2);
        $daily = fn () => Tenancy::as($s['i'], fn () => Attendance::whereDate('date', $date)->pluck('status', 'student_id')->all());
        $this->assertSame(['present', 'absent'], [$daily()[$s['mine']->id], $daily()[$s['other']->id]]);
        $this->assertNull(Tenancy::as($s['i'], fn () => Attendance::where('student_id', $s['mine']->id)->value('taken_by')));
        // any: other was present in one period -> present; majority of (absent, present, absent) -> absent
        $set('any');
        $save($s['karimUser'], $r3, ['mine' => 'absent', 'other' => 'absent', 'sister' => 'present'])->assertCreated();
        $this->assertSame('present', $daily()[$s['other']->id]);
        $set('majority');
        $save($s['karimUser'], $r3, ['mine' => 'absent', 'other' => 'absent', 'sister' => 'present'])->assertCreated();
        $this->assertSame(['absent', 'absent', 'present'], [$daily()[$s['mine']->id], $daily()[$s['other']->id], $daily()[$s['sister']->id]]);

        // a daily row taken by hand wins over the periods
        $this->api('POST', $h, 'attendance', $s['admin'], ['batch_id' => $s['a']->id, 'date' => $date, 'records' => [['student_id' => $s['mine']->id, 'status' => 'late']]])->assertCreated();
        Queue::fake([NotifyAbsentParentsJob::class]);
        $save($s['karimUser'], $r1, ['mine' => 'absent', 'other' => 'absent'])->assertCreated();
        $this->assertSame('late', $daily()[$s['mine']->id]);
        Queue::assertNothingPushed();                                                               // no absent SMS from periods

        // the report: bangla in batch A this month (both bangla periods count; percentage of present + late)
        $rep = collect($this->api('GET', $h, "period-attendance/report?batch_id={$s['a']->id}&subject_id={$s['bangla']->id}&month=2026-11", $s['admin'])->assertOk()->json('data'))->keyBy('student_id');
        $this->assertSame([2, 0, 0.0], [$rep[$s['mine']->id]['periods'], $rep[$s['mine']->id]['present'], (float) $rep[$s['mine']->id]['percentage']]);
        $this->api('GET', $h, "period-attendance/report?batch_id={$s['b']->id}&subject_id={$s['physics']->id}&month=2026-11", $s['karimUser'])->assertForbidden();
    }
}
