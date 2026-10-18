<?php

namespace Tests\Feature\Sms;

use App\Exceptions\SmsGatewayException;
use App\Jobs\SendSmsJob;
use App\Models\SmsLog;
use App\Services\Sms\SmsGateway;
use App\Services\SmsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "SmsSenderResolutionTest", restated for D59 (owner, 2026-10-10 - the institution's own API replaces the
// sender-ID approval flow): the own route switched on (key + sender) -> that sid, no suffix; otherwise - whatever the old
// approval status says - the platform sid + the institution suffix; the own ID failing -> one retry with the platform sender
// and fallback_used, the stored settings untouched. Plus the Step 4.6 retry: a refused message is retried by the queue.
class SmsSenderResolutionTest extends TestCase
{
    use RefreshDatabase;

    private function gateway(array $refuse = []): FakeGateway
    {
        $g = new FakeGateway($refuse);
        $this->app->instance(SmsGateway::class, $g);
        $this->app->forgetInstance(SmsService::class);
        return $g;
    }

    private function institution(string $status, ?string $sid = 'DHANMONDI')
    {
        $i = $this->makeInstitution('snd' . $status);
        $i->forceFill(['sms_sender_id' => $sid, 'sms_sender_status' => $status === 'own' ? 'none' : $status, 'sms_balance' => 100, 'settings' => ['sms_short_name' => 'Dhanmondi'],
            'sms_own_enabled' => $status === 'own', 'sms_api_key' => $status === 'own' ? 'own-key-1' : null])->save();
        $this->bindTenant($i->fresh());
        return $i;
    }

    public function test_the_own_route_uses_its_own_id_without_the_suffix_anything_else_the_platform_sender_with_it(): void
    {
        $platform = (string) config('services.ssl_wireless.sid');
        $this->gateway();
        $this->institution('own');
        app(SmsService::class)->send('01711111111', 'hello');
        $this->assertSame(['DHANMONDI', 'hello', false], [SmsLog::first()->sender_id, SmsLog::first()->message, (bool) SmsLog::first()->fallback_used]);

        foreach (['approved', 'pending', 'rejected', 'none'] as $status) {      // D59: the old approval status no longer picks the sender
            $this->gateway();
            $this->institution($status, $status === 'none' ? null : 'DHANMONDI');
            app(SmsService::class)->send('01711111111', 'hello');
            $log = SmsLog::latest('id')->first();
            $this->assertSame([$platform, 'hello -Dhanmondi'], [$log->sender_id, $log->message], $status);
        }
    }

    public function test_the_own_id_failing_falls_back_once_and_keeps_its_status(): void
    {
        $g = $this->gateway(['DHANMONDI']);
        $i = $this->institution('own');
        $this->assertTrue(app(SmsService::class)->send('01711111111', 'hello'));
        $this->assertSame(['DHANMONDI', (string) config('services.ssl_wireless.sid')], array_column($g->sent, 'senderId'), 'exactly one retry');
        $log = SmsLog::first();
        $this->assertSame(['sent', true, 'hello -Dhanmondi'], [$log->status, (bool) $log->fallback_used, $log->message]);
        $this->assertSame([true, 'DHANMONDI'], [$i->fresh()->sms_own_enabled, $i->fresh()->sms_sender_id], 'a failure never switches the own route off');
    }

    public function test_a_refused_message_is_retried_by_the_queue_and_only_the_last_attempt_is_logged(): void
    {
        $g = $this->gateway(['*']);
        $i = $this->institution('none', null);
        $job = new SendSmsJob('01711111111', 'hello', $i->id);
        $this->assertSame(3, $job->tries);
        $this->assertSame([30, 120], $job->backoff);

        try {
            app(SmsService::class)->send('01711111111', 'hello', finalAttempt: false);
            $this->fail('expected a retry');
        } catch (SmsGatewayException) {
        }
        $this->assertSame(0, SmsLog::count(), 'nothing logged or charged for an attempt that will be retried');

        $this->assertFalse(app(SmsService::class)->send('01711111111', 'hello', finalAttempt: true));
        $this->assertSame(['failed', 'gateway_error'], [SmsLog::first()->status, SmsLog::first()->error]);
        $this->assertSame('100.00', $i->fresh()->sms_balance, 'a failed SMS costs nothing');
        $this->assertCount(2, $g->sent);

        // the job itself: attempt 1 of 3 throws (the queue retries), attempt 3 logs the failure
        $first = (new SendSmsJob('01722222222', 'again', $i->id))->withFakeQueueInteractions();
        $this->expectException(SmsGatewayException::class);
        try {
            $first->handle(app(SmsService::class));
        } finally {
            $this->assertSame(1, SmsLog::count(), 'attempt 1: nothing logged');
            $last = (new SendSmsJob('01722222222', 'again', $i->id))->withFakeQueueInteractions();
            $last->job->attempts = 3;
            $last->handle(app(SmsService::class));
            $this->assertSame(2, SmsLog::where('status', 'failed')->count(), 'the last attempt logs the failure');
        }
    }
}
