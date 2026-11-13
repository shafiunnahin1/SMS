<?php

namespace Tests\Feature\Sms;

use App\Jobs\SendSmsJob;
use App\Models\{Exam, SmsLog};
use App\Services\AttendanceService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D208 SMSC.2: the existing senders follow the institution's choice per event - auto as before, manual leaves a pending row and
// sends nothing, off makes nothing; the result SMS run is refused while its event is off
class SmsEventSendersTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function modes(array $s, array $modes): void
    {
        $s['i']->forceFill(['settings' => array_replace($s['i']->fresh()->settings ?? [], ['sms_events' => $modes])])->save();
    }

    public function test_attendance_and_public_alert_follow_the_choice(): void
    {
        $s = $this->school('smssend');
        $s['i']->forceFill(['phone' => '01700000009', 'settings' => ['public_site' => ['enabled' => true, 'alert_sms' => true]]])->save();
        $absent = fn () => Tenancy::as($s['i'], fn () => app(AttendanceService::class)->notifyAbsentParents([$s['mine']->id], '2030-01-05', $s['a']));
        $apply = fn (string $phone) => $this->postJson("http://{$s['host']}/api/v1/public/admission", ['name' => 'Rafi', 'phone' => $phone, 'consent' => true])->assertCreated();

        // auto (default): queued as before, carrying the event
        $absent();
        $apply('01811000001');
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'attendance_absent');
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'admission_new_lead' && $j->phone === '01700000009');

        // manual: a pending row in the history, nothing queued
        Queue::fake();
        $this->modes($s, ['attendance_absent' => 'manual', 'admission_new_lead' => 'manual']);
        $absent();
        $apply('01811000002');
        Queue::assertNotPushed(SendSmsJob::class);
        $this->assertEqualsCanonicalizing(['attendance_absent', 'admission_new_lead'],
            Tenancy::as($s['i'], fn () => SmsLog::where('status', 'pending')->pluck('event_key')->all()));

        // off: nothing at all
        $this->modes($s, ['attendance_absent' => 'off', 'admission_new_lead' => 'off']);
        $absent();
        $apply('01811000003');
        Queue::assertNotPushed(SendSmsJob::class);
        $this->assertSame(2, Tenancy::as($s['i'], fn () => SmsLog::count()));
    }

    public function test_the_result_sms_run_is_refused_while_its_event_is_off(): void
    {
        $s = $this->school('smsres');
        $exam = $this->exam($s);
        Tenancy::as($s['i'], fn () => Exam::whereKey($exam)->update(['status' => 'published']));
        $this->modes($s, ['result_published' => 'off']);
        $this->api('POST', $s['host'], "exams/{$exam}/result-sms", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'sms_event_off');
        $this->modes($s, ['result_published' => 'auto']);
        $this->api('POST', $s['host'], "exams/{$exam}/result-sms", $s['admin'])->assertOk();
    }
}
