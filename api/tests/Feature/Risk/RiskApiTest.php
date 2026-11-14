<?php

namespace Tests\Feature\Risk;

use App\Jobs\SendSmsJob;
use App\Models\{Attendance, AuditLog, BatchTeacher, RiskFlag, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D216 RISK.2 (docs/modules/risk-alerts.md sections 3-5): RiskVisibility (student / parent / accountant 403; a teacher only their
// batches), the list with its "why", acknowledge / resolve (a hand-closed flag stays closed while nothing changes), the admin's
// thresholds change the result, a new high flag notifies the class teacher and the admins, the parent SMS only when both switches are on.
class RiskApiTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function attend(array $s, int $studentId, int $batchId, int $days, array $absent): void
    {
        Tenancy::as($s['i'], function () use ($s, $studentId, $batchId, $days, $absent) {
            for ($d = $days - 1; $d >= 0; $d--) {
                Attendance::create(['student_id' => $studentId, 'program_id' => $s['p']->id, 'batch_id' => $batchId, 'date' => now()->subDays($d)->toDateString(), 'status' => in_array($d, $absent, true) ? 'absent' : 'present']);
            }
        });
    }

    public function test_list_why_visibility_acknowledge_resolve_settings_and_notices(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('riska');   // Mine + Other in batch A, Sister in B; Karim will teach batch A
        $h = $s['host'];
        $admin = $s['admin'];
        $karim = $s['karimUser'];
        Tenancy::as($s['i'], function () use ($s, $karim) {
            $t = Teacher::where('user_id', $karim->id)->first();
            $s['a']->update(['teacher_id' => $t->id]);   // class teacher of A
        });
        $this->attend($s, $s['mine']->id, $s['a']->id, 20, [18, 15, 12, 9, 6, 3]);          // 70%: watch
        $this->attend($s, $s['sister']->id, $s['b']->id, 20, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);   // 50% and absent in a row: high

        // visibility
        foreach ([$this->makeUser($s['i'], 'accountant'), $s['parent'], tap(Tenancy::as($s['i'], fn () => $s['mine']->user), fn ($u) => $u->forceFill(['must_change_password' => false])->save())] as $u) {
            $this->api('GET', $h, 'risk/flags', $u)->assertForbidden();
        }
        $this->api('GET', $h, 'risk/settings', $karim)->assertForbidden();
        $this->api('POST', $h, 'risk/evaluate', $karim)->assertForbidden();

        // evaluate now: Sister's new high flag tells the admins (her batch B has no class teacher); no parent SMS by default
        $this->api('POST', $h, 'risk/evaluate', $admin)->assertOk()->assertJsonPath('data.written', 4);
        $this->assertSame(1, $admin->notifications()->where('data->type', 'risk_high')->count());
        $this->assertSame(0, $karim->notifications()->where('data->type', 'risk_high')->count());
        Queue::assertNotPushed(SendSmsJob::class);

        // the admin sees both, high first, each with its why; the teacher only batch A
        $list = $this->api('GET', $h, 'risk/flags', $admin)->assertOk()->json('data');
        $this->assertSame([[$s['sister']->id, 'high'], [$s['mine']->id, 'watch']], array_map(fn ($r) => [$r['student']['id'], $r['level']], $list));
        $this->assertSame(['attendance', 'watch', 70], [$list[1]['reasons'][0]['kind'], $list[1]['reasons'][0]['level'], $list[1]['reasons'][0]['details']['attendance_pct']]);
        $this->assertSame(10, $list[0]['reasons'][0]['details']['consecutive_absent']);
        $mineFlag = $list[1]['id'];
        $sisterFlag = $list[0]['id'];
        $this->assertSame([$s['mine']->id], array_column(array_column($this->api('GET', $h, 'risk/flags', $karim)->assertOk()->json('data'), 'student'), 'id'));
        $this->assertSame([$s['sister']->id], array_column(array_column($this->api('GET', $h, 'risk/flags?level=high', $admin)->json('data'), 'student'), 'id'));
        $this->api('GET', $h, "risk/students/{$s['mine']->id}", $karim)->assertOk()->assertJsonCount(2, 'data.flags');
        $this->api('GET', $h, "risk/students/{$s['sister']->id}", $karim)->assertNotFound();
        $this->api('POST', $h, "risk/flags/{$sisterFlag}/acknowledge", $karim, ['note' => 'x'])->assertNotFound();

        // acknowledge with a note
        $this->api('POST', $h, "risk/flags/{$mineFlag}/acknowledge", $karim, ['note' => 'অভিভাবকের সাথে কথা হয়েছে'])->assertOk()->assertJsonPath('data.status', 'acknowledged');
        $this->assertSame([$mineFlag], array_column($this->api('GET', $h, 'risk/flags?status=acknowledged', $admin)->json('data'), 'id'));
        // an acknowledged flag is still the current one: the next run writes nothing for it
        $this->travelTo('2026-11-15 10:00:00');
        $this->api('POST', $h, 'risk/evaluate', $admin)->assertOk()->assertJsonPath('data.written', 0);

        // resolve by hand: closed with its reasons, and it stays closed while nothing changes
        $this->api('POST', $h, "risk/flags/{$mineFlag}/resolve", $karim, ['note' => 'সমাধান'])->assertOk()->assertJsonPath('data.status', 'resolved');
        $this->api('POST', $h, "risk/flags/{$mineFlag}/resolve", $karim)->assertStatus(422)->assertJsonPath('error', 'risk_already_resolved');
        $this->assertSame(0, Tenancy::as($s['i'], fn () => RiskFlag::where('student_id', $s['mine']->id)->where('status', '!=', 'resolved')->count()));
        $this->travelTo('2026-11-16 10:00:00');
        $this->api('POST', $h, 'risk/evaluate', $admin)->assertOk()->assertJsonPath('data.written', 0);
        $this->assertSame([], array_column($this->api('GET', $h, 'risk/flags', $karim)->json('data'), 'id'));

        // thresholds: stricter attendance turns Mine's 70% into high -> a new row, the class teacher and the admins are told;
        // parents: notify_parents alone is not enough, the SMS event must be switched on too
        $set = fn (array $o) => $this->api('PUT', $h, 'risk/settings', $admin, $o + ['window_days' => 30, 'attendance_watch' => 75, 'attendance_high' => 60, 'consecutive_absent_high' => 3,
            'marks_drop_watch' => 15, 'marks_drop_high' => 25, 'dues_watch' => 2, 'dues_high' => 3, 'notify_parents' => false]);
        $set(['attendance_high' => 80])->assertStatus(422);                       // high must be below watch
        $set(['attendance_watch' => 90, 'attendance_high' => 80, 'notify_parents' => true])->assertOk()->assertJsonPath('data.attendance_high', 80);
        $this->api('POST', $h, 'risk/evaluate', $admin)->assertOk();
        $this->assertSame('high', Tenancy::as($s['i'], fn () => RiskFlag::where('student_id', $s['mine']->id)->where('kind', 'combined')->where('status', 'open')->value('level')));
        $this->assertSame(1, $karim->notifications()->where('data->type', 'risk_high')->count());
        $this->assertSame(2, $admin->notifications()->where('data->type', 'risk_high')->count());
        Queue::assertNotPushed(SendSmsJob::class);   // the event is off

        $s['i']->refresh()->forceFill(['settings' => array_replace($s['i']->settings ?? [], ['sms_events' => ['risk_parent_notice' => 'auto']])])->save();
        Tenancy::as($s['i'], fn () => RiskFlag::where('student_id', $s['mine']->id)->delete());
        $this->api('POST', $h, 'risk/evaluate', $admin)->assertOk();
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'risk_parent_notice' && $j->phone === '01711000001' && !preg_match('/\d/', $j->message));
        Queue::assertPushed(SendSmsJob::class, 1);

        Tenancy::as($s['i'], fn () => $this->assertSame(['risk.acknowledged', 'risk.resolved'], AuditLog::whereIn('action', ['risk.acknowledged', 'risk.resolved'])->orderBy('id')->pluck('action')->all()));
    }
}
