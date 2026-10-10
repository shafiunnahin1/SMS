<?php

namespace Tests\Feature\I18n;

use App\Jobs\SendSmsJob;
use App\Models\{SmsCreditTransaction, SmsLog, SubscriptionPlan, User};
use App\Services\SmsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// docs/I18N.md section 7 + 14 "SmsLocaleTest" and the charging half of "SmsSegmentsTest": the SMS is in the recipient's language
// (the parent user's locale, else the institution's sms_locale), one language per message; quota and credit count PARTS.
class SmsLocaleTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_recipient_language_is_the_parents_own_else_the_sms_language(): void
    {
        $i = $this->makeInstitution('smslang');
        $sms = app(SmsService::class);
        $parent = $this->makeUser($i, 'parent');

        $this->assertSame('bn', $sms->localeFor(null, $i), 'no user: sms_locale, which defaults to the default language');
        $parent->forceFill(['locale' => 'en'])->save();
        $this->assertSame('en', $sms->localeFor($parent, $i));
        $i->forceFill(['settings' => ['locales' => ['bn', 'en'], 'default_locale' => 'bn', 'sms_locale' => 'en']])->save();
        $this->assertSame('en', $sms->localeFor(null, $i->fresh()));
        $i->forceFill(['settings' => ['locales' => ['bn'], 'default_locale' => 'bn']])->save();
        $this->assertSame('bn', $sms->localeFor($parent, $i->fresh()), 'a language the institution switched off is never used');
    }

    public function test_the_templates_exist_in_both_languages_and_never_mix_scripts(): void
    {
        foreach (['absent' => ['name' => 'Rahim', 'date' => '07/10/2026', 'batch' => 'A'], 'fee_received' => ['amount' => '500.00', 'receipt' => 'RCP-2026-00001']] as $key => $params) {
            $en = __("sms.{$key}", $params, 'en');
            $bn = __("sms.{$key}", $params, 'bn');
            $this->assertNotSame("sms.{$key}", $en);
            $this->assertSame(0, preg_match('/[\x{0980}-\x{09FF}]/u', $en), "{$key}: the English SMS has no Bengali letter (it would turn Unicode)");
            $this->assertSame(1, preg_match('/[\x{0980}-\x{09FF}]/u', $bn), "{$key}: the Bengali SMS is Bengali");
            $this->assertSame('gsm', \App\Support\SmsSegments::count($en)['encoding']);
        }
    }

    public function test_an_absent_alert_goes_in_the_parents_language(): void
    {
        Queue::fake([SendSmsJob::class]);       // NotifyAbsentParentsJob runs and queues the SMS
        [$i, $student, $batch, $teacher] = $this->attendanceSetup();
        $student->primaryParent()->forceFill(['locale' => 'en'])->save();

        $this->api('POST', $this->hostOf($i), 'attendance', $teacher, ['batch_id' => $batch->id, 'date' => now()->toDateString(),
            'records' => [['student_id' => $student->id, 'status' => 'absent']]])->assertSuccessful();

        Queue::assertPushed(SendSmsJob::class, fn (SendSmsJob $job) => str_starts_with($job->message, 'Dear guardian,'));
    }

    public function test_quota_and_credit_count_parts_and_the_log_keeps_them(): void
    {
        $i = $this->makeInstitution('smsparts');
        $plan = SubscriptionPlan::create(['name' => 'Tiny', 'price' => 1, 'duration_days' => 30, 'max_sms' => 2]);
        $i->forceFill(['subscription_plan_id' => $plan->id, 'sms_balance' => 3, 'sms_sender_id' => 'OWN', 'sms_sender_status' => 'approved'])->save();
        $this->bindTenant($i->fresh());
        $sms = app(SmsService::class);

        $sms->send('01711111111', str_repeat('ক', 100));             // 2 parts: the whole monthly quota
        $this->assertSame([2, 'unicode'], [SmsLog::first()->segments, SmsLog::first()->encoding]);
        $this->assertSame(3, $i->fresh()->sms_balance);

        $sms->send('01711111111', str_repeat('a', 200));             // 2 GSM parts: both from credit
        $this->assertSame([2, 'gsm'], [SmsLog::latest('id')->first()->segments, SmsLog::latest('id')->first()->encoding]);
        $this->assertSame(1, $i->fresh()->sms_balance);
        $this->assertSame(-2, SmsCreditTransaction::first()->quantity);

        try {
            $sms->send('01711111111', str_repeat('ক', 100));         // needs 2, only 1 credit left
            $this->fail('expected sms_quota_exceeded');
        } catch (\App\Exceptions\BusinessException $e) {
            $this->assertSame('sms_quota_exceeded', $e->errorCode);
        }
        $this->assertSame(2, SmsLog::count());
    }

    private function attendanceSetup(): array
    {
        $i = $this->makeInstitution('smsatt', 'coaching');
        $teacher = $this->makeUser($i, 'teacher');
        return $this->asTenant($i, function () use ($i, $teacher) {
            $batch = \App\Models\Batch::create(['program_id' => \App\Models\Program::create(['name' => 'P'])->id, 'name' => 'B1',
                'teacher_id' => \App\Models\Teacher::create(['user_id' => $teacher->id, 'employee_id' => 'T-1'])->id]);    // the teacher's own batch (Step 4.3)
            $student = app(\App\Services\StudentService::class)->create(['name' => 'Rahim', 'guardian_phone' => '01722222222'], $batch);
            return [$i, $student->fresh(), $batch, $teacher];
        });
    }
}
