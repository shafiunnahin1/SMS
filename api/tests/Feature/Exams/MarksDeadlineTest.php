<?php

namespace Tests\Feature\Exams;

use App\Jobs\SendSmsJob;
use App\Models\Exam;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D197 AAD.6 (academics-advanced.md section 6; the D162 submit / lock flow unchanged): the admin sets a marks entry deadline per
// exam subject (kept when a client leaves it out); past it a draft shows `overdue` but the teacher is not blocked; a submission
// after it is `late`; `exams:remind-entry` tells the subject's teacher two days before and on the day while the marks are a
// draft, never after submit, never for a published exam, and institution by institution (Tenancy::each).
class MarksDeadlineTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function subjects(array $s, int $exam, ?string $deadline, bool $send = true): void
    {
        $bn = ['subject_id' => $s['bangla']->id, 'full_marks' => 100, 'pass_marks' => 33] + ($send ? ['entry_deadline' => $deadline] : []);
        $this->api('PUT', $s['host'], "exams/{$exam}/subjects", $s['admin'], ['subjects' => [$bn, ['subject_id' => $s['physics']->id, 'full_marks' => 100, 'pass_marks' => 33]]])->assertOk();
    }

    public function test_deadline_state_and_daily_reminder(): void
    {
        Queue::fake([SendSmsJob::class]);
        $this->travelTo('2026-11-09 08:00:00');
        $s = $this->school('mdl');
        $o = $this->school('mdl2');
        $exam = $this->exam($s);
        $theirs = $this->exam($o);
        $h = $s['host'];
        $entry = fn () => $this->api('GET', $h, "exams/{$exam}/subjects/{$s['bangla']->id}/entry", $s['karimUser'])->assertOk()->json('data.submission');

        $this->api('PUT', $h, "exams/{$exam}/subjects", $s['admin'], ['subjects' => [['subject_id' => $s['bangla']->id, 'full_marks' => 100, 'pass_marks' => 33, 'entry_deadline' => '11/11/2026']]])->assertStatus(422);
        $this->subjects($s, $exam, '2026-11-11 17:00');
        $this->subjects($s, $exam, null, false);                                                     // left out: kept
        $this->assertSame(['2026-11-11 17:00', false, false], [$entry()['entry_deadline'], $entry()['overdue'], $entry()['late']]);
        $this->assertSame('2026-11-11 17:00', collect($this->api('GET', $h, "exams/{$exam}/subjects", $s['admin'])->json('data'))->firstWhere('subject_id', $s['bangla']->id)['entry_deadline']);
        $this->subjects($o, $theirs, '2026-11-11 17:00');

        // two days before: the bangla teacher of each institution once; physics (no deadline) nobody
        $this->artisan('exams:remind-entry')->assertSuccessful();
        $this->assertSame(1, $s['karimUser']->fresh()->notifications()->where('data->type', 'marks_reminder')->count());
        $this->assertSame(1, $o['karimUser']->fresh()->notifications()->where('data->type', 'marks_reminder')->count());
        $this->assertSame(0, $s['otherUser']->fresh()->notifications()->count());
        // tomorrow: nothing (neither 2 days before nor the day)
        $this->travelTo('2026-11-10 08:00:00');
        $this->artisan('exams:remind-entry')->assertSuccessful();
        $this->assertSame(1, $s['karimUser']->fresh()->notifications()->where('data->type', 'marks_reminder')->count());

        // the other institution submits / publishes; on the day only ours is reminded
        Tenancy::as($o['i'], fn () => Exam::whereKey($theirs)->update(['status' => 'published']));
        $this->travelTo('2026-11-11 08:00:00');
        $this->artisan('exams:remind-entry')->assertSuccessful();
        $this->assertSame(2, $s['karimUser']->fresh()->notifications()->where('data->type', 'marks_reminder')->count());
        $this->assertSame(1, $o['karimUser']->fresh()->notifications()->where('data->type', 'marks_reminder')->count());

        // past the deadline: overdue, still saveable; a submission now is late; no reminder after submit
        $this->travelTo('2026-11-11 18:00:00');
        $this->assertTrue($entry()['overdue']);
        $this->api('POST', $h, 'results/bulk', $s['karimUser'], ['exam_id' => $exam, 'subject_id' => $s['bangla']->id, 'rows' => [
            ['student_id' => $s['mine']->id, 'marks_obtained' => 70], ['student_id' => $s['sister']->id, 'marks_obtained' => 60], ['student_id' => $s['other']->id, 'is_absent' => true]]])->assertOk();
        $this->api('POST', $h, "exams/{$exam}/subjects/{$s['bangla']->id}/submission", $s['karimUser'], ['action' => 'submit'])->assertOk()
            ->assertJsonPath('data.late', true)->assertJsonPath('data.overdue', false);
        $this->subjects($s, $exam, '2026-11-13 17:00');
        $this->artisan('exams:remind-entry')->assertSuccessful();
        $this->assertSame(2, $s['karimUser']->fresh()->notifications()->where('data->type', 'marks_reminder')->count());
    }
}
