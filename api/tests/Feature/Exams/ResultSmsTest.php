<?php

namespace Tests\Feature\Exams;

use App\Exceptions\BusinessException;
use App\Jobs\SendExamResultSmsJob;
use App\Models\{Exam, ExamResultSms, Result};
use App\Services\{ConsentService, SmsService};
use App\Services\Sms\SmsGateway;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Sms\FakeGateway;
use Tests\TestCase;

// D161 (2)(3): result SMS after publishing - only with the guardian's opt-in (else skipped); an empty wallet leaves the rest pending and
// never goes below zero; "Send SMS" again sends only what is not yet sent; an admin's correction of a published mark sends one
// correction SMS with the old and new result; a teacher cannot change a published mark; staff never override a guardian's own opt-out.
class ResultSmsTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_pending_on_an_empty_wallet_then_only_the_rest_after_a_recharge(): void
    {
        $s = $this->school('ressms');
        $gateway = new FakeGateway();
        $this->app->instance(SmsGateway::class, $gateway);
        $exam = $this->exam($s);
        Tenancy::as($s['i'], function () use ($s, $exam) {
            foreach (['mine' => 80, 'sister' => 60, 'other' => 70] as $k => $m) Result::create(['exam_id' => $exam, 'student_id' => $s[$k]->id, 'subject_id' => $s['bangla']->id, 'marks_obtained' => $m, 'grade' => 'A']);
            foreach (['mine', 'other'] as $k) app(ConsentService::class)->record($s[$k], 'sms', 'portal', [], null);   // sister's guardian never opted in
        });
        $url = "exams/{$exam}/result-sms";
        $this->api('POST', $s['host'], $url, $s['admin'])->assertStatus(422)->assertJsonPath('error', 'exam_not_published');
        Tenancy::as($s['i'], fn () => Exam::whereKey($exam)->update(['status' => 'published']));
        $s['i']->forceFill(['sms_balance' => '0.00'])->save();

        $send = function () use ($s, $exam) {
            $this->api('POST', $s['host'], "exams/{$exam}/result-sms", $s['admin'])->assertOk();
            Tenancy::as($s['i']->fresh(), fn () => (new SendExamResultSmsJob($exam, $s['admin']->id, $s['i']->id))->handle(app(\App\Services\Exams\ResultSmsService::class)));
            return $this->api('GET', $s['host'], "exams/{$exam}/result-sms", $s['admin'])->assertOk()->json('data.result');
        };
        $this->assertSame(['total' => 3, 'sent' => 0, 'pending' => 2, 'failed' => 0, 'skipped' => 1], $send(), 'no money: all pending; no opt-in: skipped');

        // money for exactly one message
        $one = Tenancy::as($s['i']->fresh(), function () {
            $m = ExamResultSms::where('status', 'pending')->orderBy('id')->first();
            $sms = app(SmsService::class);
            return $sms->costOf($sms->compose($m->message, $sms->universalRoute(), \App\Support\Tenancy::current()));
        });
        $s['i']->forceFill(['sms_balance' => \App\Support\Money::format($one)])->save();
        $this->assertSame(['total' => 3, 'sent' => 1, 'pending' => 1, 'failed' => 0, 'skipped' => 1], $send(), '1 of 2 went, the other waits');
        $this->assertSame('0.00', $s['i']->fresh()->sms_balance, 'never below zero');

        $s['i']->forceFill(['sms_balance' => '100.00'])->save();
        $this->assertSame(['total' => 3, 'sent' => 2, 'pending' => 0, 'failed' => 0, 'skipped' => 1], $send(), 'after a recharge only the pending one');
        $this->assertCount(2, $gateway->sent, 'nothing sent twice');
        $this->assertStringContainsString('মেধাক্রম', $gateway->sent[0]['text']);

        // D161 (3): a teacher cannot change a published mark; the admin can, and the guardian gets one correction SMS
        $result = Tenancy::as($s['i'], fn () => Result::where('student_id', $s['mine']->id)->first());
        $this->api('PUT', $s['host'], "results/{$result->id}", $s['karimUser'], ['marks_obtained' => 90])->assertStatus(422)->assertJsonPath('error', 'exam_published');
        $this->api('PUT', $s['host'], "results/{$result->id}", $s['admin'], ['marks_obtained' => 90])->assertOk();
        Tenancy::as($s['i']->fresh(), fn () => (new SendExamResultSmsJob($exam, $s['admin']->id, $s['i']->id))->handle(app(\App\Services\Exams\ResultSmsService::class)));
        $c = Tenancy::as($s['i'], fn () => ExamResultSms::where('kind', 'correction')->sole());
        $this->assertSame('sent', $c->status);
        $this->assertStringContainsString('80', $c->message);
        $this->assertStringContainsString('90', $c->message);
        $this->assertStringContainsString('দুঃখিত', $c->message);
        $this->assertCount(3, $gateway->sent);
        $this->api('POST', $s['host'], $url, $s['karimUser'])->assertForbidden();
    }

    public function test_staff_never_switch_on_sms_a_guardian_switched_off(): void
    {
        $s = $this->school('ressmsconsent');
        $this->actingAs($s['admin']);                                  // consent changes are audited with an actor
        Tenancy::as($s['i'], function () use ($s) {
            $consents = app(ConsentService::class);
            $consents->record($s['other'], 'sms', 'paper', [], $s['admin']->id);          // a guardian without an account: recorded consent
            $consents->revoke($s['other'], 'sms', 'portal');                            // the guardian switches it off themself
            try {
                $consents->record($s['other'], 'sms', 'paper', [], $s['admin']->id);
                $this->fail('staff must not override the guardian\'s own opt-out');
            } catch (BusinessException $e) {
                $this->assertSame('consent_guardian_revoked', $e->errorCode);
            }
            $this->assertSame('granted', $consents->record($s['other'], 'sms', 'portal', [])->status, 'the guardian may switch it on again');
        });
    }
}
