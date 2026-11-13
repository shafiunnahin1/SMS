<?php

namespace Tests\Feature\Sms;

use App\Jobs\SendSmsJob;
use App\Models\SmsLog;
use App\Services\Sms\SmsEventPolicy;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D208 SMSC.1: one policy for every event SMS - defaults keep the old behaviour; `off` creates nothing, `auto` queues the job with
// its event, `manual` leaves a pending row in the history (no credit, nothing sent); unknown events are refused
class SmsEventPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_off_auto_and_manual(): void
    {
        Queue::fake();
        $i = $this->makeInstitution('smspol');
        $policy = app(SmsEventPolicy::class);
        Tenancy::as($i, function () use ($i, $policy) {
            $this->assertSame('auto', $policy->mode('attendance_absent'));
            $this->assertSame('off', $policy->mode('admission_result'));

            $this->assertSame('queued', $policy->dispatch('attendance_absent', '01711000001', 'Absent today'));
            Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'attendance_absent' && $j->phone === '01711000001');

            $i->forceFill(['settings' => ['sms_events' => ['attendance_absent' => 'manual', 'fee_paid' => 'off', 'result_published' => 'nonsense']]])->save();
            $pending = $policy->dispatch('attendance_absent', '01711000002', 'Absent again', 7);
            $this->assertInstanceOf(SmsLog::class, $pending);
            $this->assertSame(['pending', 'attendance_absent', '01711000002', '0.00'], [$pending->status, $pending->event_key, $pending->to_phone, $pending->fresh()->cost]);
            $this->assertSame('off', $policy->dispatch('fee_paid', '01711000003', 'Paid'));
            $this->assertSame(1, SmsLog::count());                                       // only the pending row; off made nothing
            $this->assertSame('auto', $policy->mode('result_published'));                 // an unknown stored value falls back to the default
            Queue::assertPushed(SendSmsJob::class, 1);
            $this->expectException(\InvalidArgumentException::class);
            $policy->dispatch('nope', '01711000004', 'x');
        });
    }
}
