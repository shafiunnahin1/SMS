<?php

namespace Tests\Feature\Sms;

use App\Models\{PlatformSetting, SmsCreditTransaction, SmsLog};
use App\Services\Sms\SmsGateway;
use App\Services\SmsService;
use App\Support\{Money, SmsSegments};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "SmsWalletTest" (D56): the wallet is in taka; each sent SMS part costs the platform rate (0.40; 150 GSM /
// 70 Unicode chars, 67 when split); a ledger row per charge; not enough money -> 402 and nothing sent; a failed send costs nothing.
class SmsWalletTest extends TestCase
{
    use RefreshDatabase;

    public function test_billable_parts_follow_the_owners_rule(): void
    {
        $this->assertSame([0, 1, 1, 2, 2], [SmsSegments::billable(''), SmsSegments::billable(str_repeat('a', 150)), SmsSegments::billable(str_repeat('ক', 70)),
            SmsSegments::billable(str_repeat('a', 151)), SmsSegments::billable(str_repeat('ক', 71))]);
        $this->assertSame([3, 1], [SmsSegments::billable(str_repeat('ক', 135)), SmsSegments::count(str_repeat('a', 155))['segments']],
            '135 Unicode = 3 parts of 67; the gateway still sends 155 GSM chars as one part');
    }

    public function test_the_rate_is_the_platform_setting_and_the_ledger_adds_up(): void
    {
        $i = $this->makeInstitution('wallet');
        $i->forceFill(['sms_balance' => '5.00', 'settings' => ['sms_short_name' => 'W']])->save();
        $this->bindTenant($i->fresh());
        $sms = app(SmsService::class);
        $this->assertSame('0.40', $sms->rate(), 'default rate');

        PlatformSetting::write('sms_rate', '0.35');
        $this->assertSame('0.35', $sms->rate());
        $sms->send('01711111111', 'one part');
        $sms->send('01711111111', str_repeat('ক', 100));                         // 2 parts at 0.35
        $this->assertSame('3.95', $i->fresh()->sms_balance);
        $this->assertSame(Money::toPaisa('5.00') - Money::toPaisa('3.95'), -SmsCreditTransaction::get()->sum(fn ($t) => Money::toPaisa((string) $t->amount)));
        $this->assertSame(['0.35', '0.70'], SmsLog::orderBy('id')->pluck('cost')->all());
        $this->assertSame(['balance' => '3.95', 'rate' => '0.35', 'sent_this_month' => 2, 'spent_this_month' => '1.05'], $sms->usage($i));
    }

    public function test_a_failed_send_costs_nothing_and_an_empty_wallet_sends_nothing(): void
    {
        $this->app->instance(SmsGateway::class, new FakeGateway(['*']));
        $this->app->forgetInstance(SmsService::class);
        $i = $this->makeInstitution('wallet2');
        $i->forceFill(['sms_balance' => '1.00', 'settings' => ['sms_short_name' => 'W']])->save();
        $this->bindTenant($i->fresh());

        $this->assertFalse(app(SmsService::class)->send('01711111111', 'refused'));
        $this->assertSame(['1.00', 0, '0.00'], [$i->fresh()->sms_balance, SmsCreditTransaction::count(), SmsLog::first()->cost]);

        $i->forceFill(['sms_balance' => '0.20'])->save();
        $this->expectException(\App\Exceptions\BusinessException::class);
        try {
            app(SmsService::class)->send('01711111111', 'too poor');
        } finally {
            $this->assertSame(1, SmsLog::count(), 'nothing was attempted');
        }
    }
}
