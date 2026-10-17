<?php

namespace Tests\Feature\I18n;

use App\Jobs\SendSmsJob;
use App\Models\{SmsCreditTransaction, SmsLog, User};
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

    // D56 (owner, 2026-10-10): the wallet is in taka; the PRICE counts 150 GSM / 70-67 Unicode characters per part, the log keeps
    // the gateway's own part count (160/153 GSM). No plan quota any more (D55).
    public function test_quota_and_credit_count_parts_and_the_log_keeps_them(): void
    {
        $i = $this->makeInstitution('smsparts');
        // the universal route (charged) with no suffix: a blank short name is not possible, so the texts below count the
        // institution suffix " -Smsparts" (10 chars) - D59 removed the approved-sender shortcut this test used before
        $i->forceFill(['sms_balance' => '2.00'])->save();
        $this->bindTenant($i->fresh());
        $sms = app(SmsService::class);

        $sms->send('01711111111', str_repeat('ক', 100));             // Unicode: 110 chars = 2 parts = 0.80
        $this->assertSame([2, 'unicode', '0.80'], [SmsLog::first()->segments, SmsLog::first()->encoding, SmsLog::first()->cost]);
        $this->assertSame('1.20', $i->fresh()->sms_balance);

        $sms->send('01711111111', str_repeat('a', 145));             // GSM: 145 + 10 = 155 - 1 gateway part (<=160) but 2 billable parts (150 each) = 0.80
        $this->assertSame([1, 'gsm', '0.80'], [SmsLog::latest('id')->first()->segments, SmsLog::latest('id')->first()->encoding, SmsLog::latest('id')->first()->cost]);
        $this->assertSame('0.40', $i->fresh()->sms_balance);
        $this->assertSame([-2, '-0.80'], [SmsCreditTransaction::first()->quantity, SmsCreditTransaction::first()->amount]);

        try {
            $sms->send('01711111111', str_repeat('ক', 100));         // needs 0.80, only 0.40 left
            $this->fail('expected sms_quota_exceeded');
        } catch (\App\Exceptions\BusinessException $e) {
            $this->assertSame(['sms_quota_exceeded', 402], [$e->errorCode, $e->status]);
        }
        $this->assertSame(2, SmsLog::count());
        $this->assertTrue($sms->send('01711111111', 'hi'), 'one short GSM part (0.40) still fits');
        $this->assertSame('0.00', $i->fresh()->sms_balance);
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
