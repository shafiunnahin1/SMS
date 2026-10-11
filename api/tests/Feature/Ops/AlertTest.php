<?php

namespace Tests\Feature\Ops;

use App\Exceptions\BusinessException;
use App\Services\Ops\AlertService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Events\QueueBusy;
use Illuminate\Support\Facades\{Event, Http};
use Tests\TestCase;

// Step 9.1 Done When "alerts fire on a forced error" (D64: locally) + queue alerts. No message text leaves the server (G9).
class AlertTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['monitoring.webhook_url' => 'https://alerts.test/hook', 'monitoring.emails' => []]);
        Http::fake(['alerts.test/*' => Http::response(['ok' => true])]);
    }

    public function test_a_forced_error_alerts_once_without_its_message(): void
    {
        $this->artisan('ops:alert-test')->assertSuccessful();
        Http::assertSent(fn ($r) => $r->url() === 'https://alerts.test/hook' && str_contains($r['text'], 'Unexpected error: RuntimeException')
            && str_contains($r['text'], 'where: ') && !str_contains($r['text'], 'forced error'));
        $this->artisan('ops:alert-test')->assertSuccessful();          // the same error again inside the window: not sent twice
        Http::assertSentCount(1);
    }

    public function test_an_unexpected_exception_in_a_request_alerts_and_an_expected_one_does_not(): void
    {
        report(new BusinessException('rule', 'some_rule'));
        report(new \Illuminate\Validation\ValidationException(validator([], [])));
        Http::assertNothingSent();
        report(new \LogicException('01711000000 paid 500.00'));          // a message with a phone and an amount
        Http::assertSent(fn ($r) => str_contains($r['text'], 'LogicException') && !str_contains($r['text'], '01711000000') && !str_contains($r['text'], '500.00'));
    }

    public function test_a_queue_backlog_alerts(): void
    {
        Event::dispatch(new QueueBusy('redis', 'sms', 1500));
        Http::assertSent(fn ($r) => str_contains($r['text'], 'Queue backlog') && str_contains($r['text'], 'redis:sms') && str_contains($r['text'], '1500'));
    }

    public function test_nothing_is_sent_when_no_target_is_set_and_a_dead_webhook_never_throws(): void
    {
        config(['monitoring.webhook_url' => null]);
        $this->artisan('ops:alert-test')->assertFailed();
        report(new \LogicException('x'));
        Http::assertNothingSent();

        config(['monitoring.webhook_url' => 'https://down.test/hook']);
        Http::fake(['down.test/*' => Http::response('', 500)]);
        $this->assertFalse(app(AlertService::class)->send('t', [], 'k-down'));
    }

    public function test_the_backlog_check_is_scheduled_every_five_minutes(): void
    {
        $events = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events());
        $monitor = $events->first(fn ($e) => str_contains($e->command ?? '', 'queue:monitor'));
        $this->assertNotNull($monitor);
        $this->assertStringContainsString('redis:default,redis:sms,redis:notifications --max=1000', $monitor->command);
        $this->assertSame('*/5 * * * *', $monitor->expression);
    }

    public function test_an_alert_is_still_sent_when_the_cache_is_down(): void
    {
        $broken = \Mockery::mock(\Illuminate\Contracts\Cache\Repository::class);
        $broken->shouldReceive('add')->andThrow(new \RuntimeException('Connection refused'));
        \Illuminate\Support\Facades\Cache::swap($broken);
        $this->assertTrue(app(AlertService::class)->send('Redis down', ['x' => 1], 'k-cache'));
        Http::assertSentCount(1);
    }

    public function test_telegram_and_email_get_the_alert(): void
    {
        config(['mail.default' => 'array']);
        config(['monitoring.webhook_url' => null, 'monitoring.telegram_bot_token' => '123:abc', 'monitoring.telegram_chat_id' => '-100777',
            'monitoring.emails' => ['owner@example.test']]);
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
        $this->artisan('ops:alert-test')->assertSuccessful();
        Http::assertSent(fn ($r) => $r->url() === 'https://api.telegram.org/bot123:abc/sendMessage' && $r['chat_id'] === '-100777'
            && str_contains($r['text'], 'Unexpected error: RuntimeException'));
        $sent = app('mail.manager')->mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $sent);
        $this->assertSame('owner@example.test', $sent->first()->getEnvelope()->getRecipients()[0]->getAddress());
        $this->assertStringContainsString('RuntimeException', $sent->first()->getOriginalMessage()->getTextBody());
    }
}
