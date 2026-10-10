<?php

namespace Tests\Feature\Sms;

use App\Exceptions\BusinessException;
use App\Models\{SmsCreditTransaction, SmsLog, SubscriptionPlan};
use App\Services\SmsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "SmsCreditTest": within the monthly quota the balance does not move; past it the balance drops with a ledger
// row; with both used up -> 402. Counted in SMS PARTS: a long Bengali text costs several (docs/I18N.md section 7).
class SmsCreditTest extends TestCase
{
    use RefreshDatabase;

    public function test_quota_first_then_credit_per_part_then_402(): void
    {
        $plan = SubscriptionPlan::create(['name' => 'Two', 'price' => 1, 'duration_days' => 30, 'max_sms' => 2]);
        $i = $this->makeInstitution('credit');
        $i->forceFill(['subscription_plan_id' => $plan->id, 'sms_balance' => 3, 'settings' => ['sms_short_name' => 'Credit']])->save();
        $this->bindTenant($i->fresh());
        $sms = app(SmsService::class);

        $this->assertTrue($sms->send('01711111111', 'ok'));
        $this->assertSame([3, 0], [$i->fresh()->sms_balance, SmsCreditTransaction::count()], 'inside the quota: no credit used');

        $bengali = str_repeat('আপনার সন্তান আজ অনুপস্থিত। ', 4);          // > 70 Unicode units -> 2 parts (67 each)
        $this->assertTrue($sms->send('01711111111', $bengali));
        $log = SmsLog::latest('id')->first();
        $this->assertSame(['unicode', 2], [$log->encoding, $log->segments]);
        // quota 2: part 1 used it up before (1) + this message (2) = 3 -> one part over -> 1 credit
        $this->assertSame([2, -1, 2], [$i->fresh()->sms_balance, SmsCreditTransaction::first()->quantity, SmsCreditTransaction::first()->balance_after]);
        $this->assertSame("sms_log:{$log->id}", SmsCreditTransaction::first()->reference);

        $this->assertTrue($sms->send('01711111111', 'ab'));
        $this->assertTrue($sms->send('01711111111', 'cd'));
        $this->assertSame(0, $i->fresh()->sms_balance);
        try {
            $sms->send('01711111111', 'no more');
            $this->fail('expected 402');
        } catch (BusinessException $e) {
            $this->assertSame(['sms_quota_exceeded', 402], [$e->errorCode, $e->status]);
        }
        $this->assertSame(4, SmsLog::count(), 'a refused message is not logged as sent');
        $this->assertSame([-1, -1, -1], SmsCreditTransaction::orderBy('id')->pluck('quantity')->all());
    }
}
