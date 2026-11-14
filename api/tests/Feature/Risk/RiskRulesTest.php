<?php

namespace Tests\Feature\Risk;

use App\Models\{Attendance, Exam, FeeCategory, FeePayment, Result, RiskFlag, StudentLeaveRequest};
use App\Services\Risk\{RiskEvaluator, RiskRules};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D216 RISK.1 (docs/modules/risk-alerts.md section 5): RiskRules (the four verified examples, the borders, absent in a row),
// RiskChangeOnly, RiskExcusedAbsence, RiskNoAutoAction, RiskTenancy (the command walks tenants; rows stay in their institution).
class RiskRulesTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function m(array $o = []): array
    {
        return $o + ['present' => 0, 'working' => 0, 'consecutive_absent' => 0, 'previous_avg' => null, 'latest' => null, 'months_due' => 0];
    }

    public function test_the_four_verified_examples_the_borders_and_absent_in_a_row(): void
    {
        $r = new RiskRules();
        $t = RiskRules::DEFAULTS;
        $levels = fn (array $m) => array_map(fn ($f) => $f['level'], $r->evaluate($this->m($m), $t));

        // attendance 70% + marks 72 -> 50: two watches make the combined flag high
        $this->assertSame(['attendance' => 'watch', 'marks_drop' => 'watch', 'combined' => 'high'], $levels(['present' => 21, 'working' => 30, 'previous_avg' => 72, 'latest' => 50]));
        // only two months of dues: watch
        $this->assertSame(['dues' => 'watch', 'combined' => 'watch'], $levels(['present' => 30, 'working' => 30, 'months_due' => 2]));
        // attendance 55% alone: high
        $this->assertSame(['attendance' => 'high', 'combined' => 'high'], $levels(['present' => 11, 'working' => 20]));
        // healthy (92%, 70 -> 74, no dues): nothing
        $this->assertSame([], $levels(['present' => 23, 'working' => 25, 'previous_avg' => 70, 'latest' => 74]));

        // borders: exactly 75 is not watch, 74.99 is; exactly 60 is watch, 59.99 high; drop 15 / 25; dues 3
        $this->assertSame([], $levels(['present' => 75, 'working' => 100]));
        $this->assertSame('watch', $levels(['present' => 7499, 'working' => 10000])['attendance']);
        $this->assertSame('watch', $levels(['present' => 60, 'working' => 100])['attendance']);
        $this->assertSame('high', $levels(['present' => 5999, 'working' => 10000])['attendance']);
        $this->assertSame([], $levels(['previous_avg' => 70, 'latest' => 55.01]));
        $this->assertSame('watch', $levels(['previous_avg' => 70, 'latest' => 55])['marks_drop']);
        $this->assertSame('high', $levels(['previous_avg' => 70, 'latest' => 45])['marks_drop']);
        $this->assertSame('high', $levels(['months_due' => 3])['dues']);
        $this->assertSame([], $levels(['months_due' => 1]));
        // no attendance taken at all is not a flag
        $this->assertSame([], $levels(['present' => 0, 'working' => 0]));

        // absent 3 working days in a row: high, with the count in the details (even at a good percentage)
        $f = $r->evaluate($this->m(['present' => 27, 'working' => 30, 'consecutive_absent' => 3]), $t);
        $this->assertSame(['high', 3], [$f['attendance']['level'], $f['attendance']['details']['consecutive_absent']]);
        $this->assertArrayNotHasKey('attendance', $r->evaluate($this->m(['present' => 28, 'working' => 30, 'consecutive_absent' => 2]), $t));
        // the "why" is always there
        $why = $r->evaluate($this->m(['present' => 21, 'working' => 30]), $t)['attendance']['details'];
        $this->assertSame([70.0, 30, 21, 30], [$why['attendance_pct'], $why['window_days'], $why['present'], $why['working']]);
        // changed thresholds change the result
        $this->assertSame('high', $r->evaluate($this->m(['present' => 21, 'working' => 30]), ['attendance_high' => 72] + $t)['attendance']['level']);
    }

    /** attendance rows for the last $days days: the last $absent of them absent */
    private function attend(array $s, int $studentId, int $days, array $absentDays): void
    {
        Tenancy::as($s['i'], function () use ($s, $studentId, $days, $absentDays) {
            for ($d = $days - 1; $d >= 0; $d--) {
                Attendance::create(['student_id' => $studentId, 'program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'date' => now()->subDays($d)->toDateString(),
                    'status' => in_array($d, $absentDays, true) ? 'absent' : 'present']);
            }
        });
    }

    public function test_change_only_excused_absence_no_auto_action_and_tenancy(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('risk');
        $other = $this->school('risk2');
        $mine = $s['mine']->id;
        // 20 days, 6 absent (not in a row): 70% -> watch
        $this->attend($s, $mine, 20, [18, 15, 12, 9, 6, 3]);
        $before = Tenancy::as($s['i'], fn () => [Exam::count(), Result::count(), FeePayment::count(), FeeCategory::count()]);

        $this->artisan('risk:evaluate')->assertSuccessful();
        $flags = fn () => Tenancy::as($s['i'], fn () => RiskFlag::where('student_id', $mine)->orderBy('id')->get(['kind', 'level', 'status', 'computed_on'])->map(fn ($f) => [$f->kind, $f->level, $f->status])->all());
        $this->assertSame([['attendance', 'watch', 'open'], ['combined', 'watch', 'open']], $flags());
        $this->assertSame(0, Tenancy::as($other['i'], fn () => RiskFlag::count()), 'the other institution has no attendance and gets no rows');

        // unchanged the next day: no new row
        $this->travelTo('2026-11-15 10:00:00');
        $this->artisan('risk:evaluate')->assertSuccessful();
        $this->assertCount(2, $flags());

        // worse (absent three days in a row): a new row per changed kind, the old one closed
        $this->travelTo('2026-11-18 10:00:00');
        $this->attend($s, $mine, 3, [0, 1, 2]);
        $this->artisan('risk:evaluate')->assertSuccessful();
        $this->assertSame([['attendance', 'watch', 'resolved'], ['combined', 'watch', 'resolved'], ['attendance', 'high', 'open'], ['combined', 'high', 'open']], $flags());
        $high = Tenancy::as($s['i'], fn () => RiskFlag::where('kind', 'attendance')->where('level', 'high')->first());
        $this->assertSame(3, $high->details['consecutive_absent']);
        $this->assertSame($s['a']->id, $high->batch_id);

        // an approved leave covers those days: they no longer count as absent -> back to watch
        Tenancy::as($s['i'], fn () => StudentLeaveRequest::create(['student_id' => $mine, 'from_date' => '2026-11-16', 'to_date' => '2026-11-18', 'total_days' => 3, 'reason' => 'অসুস্থ', 'method' => 'parent', 'status' => 'approved']));
        $this->travelTo('2026-11-19 10:00:00');
        $this->artisan('risk:evaluate')->assertSuccessful();
        $this->assertSame([['attendance', 'watch', 'open'], ['combined', 'watch', 'open']], array_slice($flags(), -2));

        // the condition is gone (a full month present): resolved, no new row
        $this->travelTo('2026-12-25 10:00:00');
        $this->attend($s, $mine, 30, []);
        $this->artisan('risk:evaluate')->assertSuccessful();
        $this->assertSame(0, Tenancy::as($s['i'], fn () => RiskFlag::where('status', '!=', 'resolved')->count()));
        $rows = count($flags());

        // no automatic action: exams, results, payments and fee rules are untouched; nothing was queued or sent
        $this->assertSame($before, Tenancy::as($s['i'], fn () => [Exam::count(), Result::count(), FeePayment::count(), FeeCategory::count()]));
        Queue::assertNothingPushed();

        // retention: resolved rows older than 90 days go
        $this->travelTo('2027-04-01 10:00:00');
        $this->artisan('risk:prune')->assertSuccessful();
        $this->assertSame(0, Tenancy::as($s['i'], fn () => RiskFlag::count()));
        $this->assertGreaterThan(0, $rows);
    }

    public function test_marks_drop_and_dues_are_measured_from_published_exams_and_unpaid_months(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('riskm');
        $mine = $s['mine'];
        $t = RiskRules::DEFAULTS;
        $score = function (string $name, int $marks, string $date, string $status = 'published') use ($s, $mine) {
            Tenancy::as($s['i'], function () use ($s, $mine, $name, $marks, $date, $status) {
                $e = Exam::create(['name' => $name, 'program_id' => $s['p']->id, 'exam_type' => 'term', 'academic_year' => 2026, 'start_date' => $date, 'status' => $status]);
                Result::create(['exam_id' => $e->id, 'student_id' => $mine->id, 'subject_id' => $s['bangla']->id, 'marks_obtained' => $marks, 'percentage' => $marks, 'grade' => 'A', 'grade_point' => 4, 'is_absent' => false, 'is_pass' => true]);
            });
        };
        $measure = fn () => Tenancy::as($s['i'], fn () => app(RiskEvaluator::class)->measure($mine->fresh(), $t));
        $score('First', 70, '2026-03-01');
        $score('Second', 74, '2026-06-01');
        $this->assertNull($measure()['latest'], 'two exams are not enough to compare');
        $score('Third', 50, '2026-09-01');
        $score('Draft', 10, '2026-10-01', 'completed');   // not published: ignored
        $m = $measure();
        $this->assertSame([72.0, 50.0], [$m['previous_avg'], $m['latest']]);

        // dues: unpaid months of the monthly fee since enrollment
        $this->assertSame(0, $m['months_due']);
        Tenancy::as($s['i'], function () use ($mine) {
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 500, 'frequency' => 'monthly']);
            $mine->enrollments()->update(['enrolled_at' => '2026-09-05']);
        });
        $this->assertSame(3, $measure()['months_due']);   // 2026-09, 10, 11
    }
}
