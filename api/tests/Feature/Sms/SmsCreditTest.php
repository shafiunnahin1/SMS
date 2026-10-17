<?php

namespace Tests\Feature\Sms;

use App\Exceptions\BusinessException;
use App\Models\{SmsCreditTransaction, SmsLog, SubscriptionPlan};
use App\Services\SmsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "SmsCreditTest", as D56 (owner, 2026-10-10) restates it: no plan quota - every sent part is paid from the
// wallet (taka) with a ledger row; not enough money -> 402. Counted in billable parts: a long Bengali text costs several.
class SmsCreditTest extends TestCase
{
    use RefreshDatabase;

    public function test_quota_first_then_credit_per_part_then_402(): void
    {
        $plan = SubscriptionPlan::create(['name' => 'Two', 'price' => 1, 'duration_days' => 30, 'max_sms' => 2]);
        $i = $this->makeInstitution('credit');
        $i->forceFill(['subscription_plan_id' => $plan->id, 'sms_balance' => '1.60', 'settings' => ['sms_short_name' => 'Credit']])->save();
        $this->bindTenant($i->fresh());
        $sms = app(SmsService::class);

        $this->assertTrue($sms->send('01711111111', 'ok'));
        $this->assertSame(['1.20', 1], [$i->fresh()->sms_balance, SmsCreditTransaction::count()], 'max_sms no longer pays: 0.40 taken');

        $bengali = str_repeat('আপনার সন্তান আজ অনুপস্থিত। ', 4);          // > 70 Unicode units -> 2 parts (67 each)
        $this->assertTrue($sms->send('01711111111', $bengali));
        $log = SmsLog::latest('id')->first();
        $this->assertSame(['unicode', 2, '0.80'], [$log->encoding, $log->segments, $log->cost]);
        $row = SmsCreditTransaction::latest('id')->first();
        $this->assertSame(['0.40', '-0.80', -2], [$i->fresh()->sms_balance, $row->amount, $row->quantity]);
        $this->assertSame("sms_log:{$log->id}", $row->reference);

        $this->assertTrue($sms->send('01711111111', 'ab'));
        $this->assertSame('0.00', $i->fresh()->sms_balance);
        try {
            $sms->send('01711111111', 'no more');
            $this->fail('expected 402');
        } catch (BusinessException $e) {
            $this->assertSame(['sms_quota_exceeded', 402], [$e->errorCode, $e->status]);
        }
        $this->assertSame(3, SmsLog::count(), 'a refused message is not logged as sent');
        $this->assertSame(['-0.40', '-0.80', '-0.40'], SmsCreditTransaction::orderBy('id')->pluck('amount')->all());
    }
}
