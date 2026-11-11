<?php

namespace Tests\Feature\Substitution;

use App\Exceptions\BusinessException;
use App\Jobs\SendSubstitutionSmsJob;
use App\Models\{LeaveType, Routine, Teacher, User};
use App\Services\SmsService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D201 SUBM.2: every cover notice is also an SMS to the same recipient - when they have a phone and did not switch SMS (or this
// kind of notice) off. The intent is the notice row's `sms` state; the job claims it once, so a second run, the sweep or a replay
// never sends again; a refused send is `failed` and not retried; the sweep re-queues only notices left pending for five minutes.
class SubstitutionSmsTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function notice(User $u, string $status)
    {
        return $u->fresh()->notifications()->where('data->type', 'leave_substitution')->where('data->data->status', $status)->latest()->first();
    }

    public function test_notices_go_by_sms_once_and_respect_preferences(): void
    {
        $this->travelTo('2030-01-01 08:00:00');
        $s = $this->school('sms');
        $h = $s['host'];
        [$free, $freeUser, $type, $r1] = Tenancy::as($s['i'], function () use ($s) {
            $fu = User::create(['institution_id' => $s['i']->id, 'name' => 'Free teacher', 'email' => 'free@example.test', 'phone' => '01811111111', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            $karim = Teacher::where('user_id', $s['karimUser']->id)->first();
            return [Teacher::create(['user_id' => $fu->id, 'employee_id' => 'T-F']), $fu, LeaveType::create(['name' => 'Casual', 'max_days_per_year' => 20, 'is_paid' => true]),
                Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim->id, 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45'])];
        });
        $s['karimUser']->forceFill(['phone' => '01822222222'])->save();
        $s['admin']->forceFill(['phone' => '01833333333', 'notification_preferences' => ['sms' => false]])->save();
        $sent = []; $answer = true;
        $this->partialMock(SmsService::class, function ($m) use (&$sent, &$answer) {
            $m->shouldReceive('send')->andReturnUsing(function (...$a) use (&$sent, &$answer) {
                $sent[] = $a;
                if ($answer instanceof \Throwable) throw $answer;
                return $answer;
            });
        });
        // the leave's own SMS (requested / approved, D85) is transactional; a cover SMS never is - count only those
        $cover = function () use (&$sent) { return array_values(array_filter($sent, fn ($a) => $a[3] === false)); };
        $run = fn (SendSubstitutionSmsJob $j) => Tenancy::as($s['i'], fn () => $j->handle(app(SmsService::class)));
        Queue::fake([SendSubstitutionSmsJob::class]);

        // the approval offers Free: one notice with sms = pending and one queued job for it
        $leave = $this->api('POST', $h, 'hr/leaves', $s['admin'], ['user_id' => $s['karimUser']->id, 'leave_type_id' => $type->id, 'from_date' => '2030-01-06', 'to_date' => '2030-01-06', 'reason' => 'SECRET-REASON'])->assertCreated()->json('data.id');
        $approve = function () use ($h, $leave, $s, $r1, $free) {
            $this->withHeader('Idempotency-Key', 'approve-1');
            try { return $this->api('PATCH', $h, "hr/leaves/{$leave}/approve", $s['admin'], ['cover_choices' => [['routine_id' => $r1->id, 'occurrence_date' => '2030-01-06', 'substitute_teacher_id' => $free->id]]]); }
            finally { $this->flushHeaders(); }
        };
        $approve()->assertOk();
        $offer = $this->notice($freeUser, 'offered');
        $this->assertSame('pending', $offer->data['data']['sms']);
        Queue::assertPushed(SendSubstitutionSmsJob::class, 1);
        $job = new SendSubstitutionSmsJob($freeUser->id, (string) $offer->id, $s['i']->id);
        Queue::assertPushed(SendSubstitutionSmsJob::class, fn ($j) => $j->userId === $freeUser->id && $j->notificationId === (string) $offer->id);

        // the job sends it once - the same text as the notice, never the reason, as an ordinary (not transactional) SMS
        $run($job); $run($job);
        $this->assertCount(1, $cover());
        $this->assertSame(['01811111111', $offer->data['body']], [$cover()[0][0], $cover()[0][1]]);
        $this->assertStringNotContainsString('SECRET-REASON', $cover()[0][1]);
        $this->assertSame('sent', $this->notice($freeUser, 'offered')->data['data']['sms']);
        $approve()->assertOk();                                                        // a replay queues nothing more
        Queue::assertPushed(SendSubstitutionSmsJob::class, 1);

        // Free accepts: the applicant (phone, default preferences) gets an SMS intent; the admin switched SMS off -> skipped, no job
        $slot = $this->api('GET', $h, 'teacher/substitution-offers', $freeUser)->assertOk()->json('data.0');
        $this->withHeader('Idempotency-Key', 'accept-1');
        $this->api('PATCH', $h, "hr/leaves/{$leave}/substitution-slots/{$slot['id']}/accept", $freeUser, ['expected_versions' => ['slot' => $slot['version'], 'source' => $slot['source']]])->assertOk();
        $this->flushHeaders();
        $toApplicant = $this->notice($s['karimUser'], 'confirmed');
        $this->assertSame(['pending', 'skipped'], [$toApplicant->data['data']['sms'], $this->notice($s['admin'], 'confirmed')->data['data']['sms']]);
        Queue::assertPushed(SendSubstitutionSmsJob::class, 2);

        // the sweep: nothing while the intent is fresh; after five minutes the pending one is queued again (sent / skipped ones never)
        $this->artisan('substitution:sms-sweep')->assertSuccessful();
        Queue::assertPushed(SendSubstitutionSmsJob::class, 2);
        $this->travel(6)->minutes();
        $this->artisan('substitution:sms-sweep')->assertSuccessful();
        Queue::assertPushed(SendSubstitutionSmsJob::class, 3);
        Queue::assertPushed(SendSubstitutionSmsJob::class, fn ($j) => $j->notificationId === (string) $toApplicant->id && $j->userId === $s['karimUser']->id);

        // a refused send (SMS switched off for the institution) is recorded as failed and never tried again
        $answer = new BusinessException('off', 'sms_disabled', 409);
        $late = new SendSubstitutionSmsJob($s['karimUser']->id, (string) $toApplicant->id, $s['i']->id);
        $run($late); $run($late);
        $this->assertCount(2, $cover());
        $this->assertSame('failed', $this->notice($s['karimUser'], 'confirmed')->data['data']['sms']);
        $this->artisan('substitution:sms-sweep')->assertSuccessful();
        Queue::assertPushed(SendSubstitutionSmsJob::class, 3);

        // a recipient who switched this kind of notice off, or has no phone, gets the in-app notice only
        $freeUser->forceFill(['notification_preferences' => ['leave_substitution' => false]])->save();
        $this->api('PATCH', $h, "hr/leaves/{$leave}/cancel", $s['admin'], ['reason' => 'Plans changed'])->assertOk();
        $this->assertSame('skipped', $this->notice($freeUser, 'cancelled')->data['data']['sms']);
        Queue::assertPushed(SendSubstitutionSmsJob::class, 4);                         // only the applicant's cancellation notice
    }
}
