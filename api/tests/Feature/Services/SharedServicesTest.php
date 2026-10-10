<?php

namespace Tests\Feature\Services;

use App\Exceptions\BusinessException;
use App\Jobs\SendSmsJob;
use App\Models\{Attendance, Batch, Exam, ExamSubject, Holiday, Institution, Program, Result, SmsCreditTransaction, SmsLog, Student, Subject, SubscriptionPlan, User};
use App\Services\{AttendanceService, EnrollmentService, FeeService, NotificationService, PdfService, ResultService, SmsService, StudentService};
use App\Services\Sms\{LogSmsGateway, SmsGateway};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// Step 2.6 Done When: every shared service exists and resolves - plus the core behaviour each one owns in Release 1
class SharedServicesTest extends TestCase
{
    use RefreshDatabase;

    private Institution $inst;

    protected function setUp(): void
    {
        parent::setUp();
        $this->inst = $this->makeInstitution('dhanmondi');
        $this->bindTenant($this->inst);
    }

    public function test_every_shared_service_resolves_and_the_sms_gateway_is_the_log_driver_in_tests(): void
    {
        foreach ([StudentService::class, AttendanceService::class, ResultService::class, FeeService::class, NotificationService::class, SmsService::class, PdfService::class] as $class) {
            $this->assertInstanceOf($class, app($class));
        }
        $this->assertSame(app(SmsService::class), app(SmsService::class), 'singleton');
        $this->assertInstanceOf(LogSmsGateway::class, app(SmsGateway::class));
    }

    public function test_student_service_creates_the_login_and_enrolls_without_touching_the_cache_directly(): void
    {
        $batch = Batch::create(['program_id' => Program::create(['name' => 'Class 6'])->id, 'name' => 'A']);

        $s = app(StudentService::class)->create(['name' => 'রাহিম', 'student_id' => 'DHA-1', 'guardian_phone' => '01711111111'], $batch, ['roll_no' => 7]);

        $this->assertSame([$batch->id, 7], [$s->batch_id, $s->roll_no]);
        $this->assertSame(['student', 'DHA-1', true], [$s->user->role, $s->user->username, (bool) $s->user->must_change_password]);
    }

    public function test_attendance_upserts_per_batch_and_date_and_alerts_absent_parents(): void
    {
        Queue::fake([SendSmsJob::class]);       // the absence job (NotifyAbsentParentsJob) runs; only the SMS it queues is faked
        $batch = Batch::create(['program_id' => Program::create(['name' => 'Class 6'])->id, 'name' => 'A']);
        $svc = app(EnrollmentService::class);
        $a = Student::create(['student_id' => 'A', 'guardian_phone' => '01711111111']);
        $b = Student::create(['student_id' => 'B', 'guardian_phone' => '01722222222']);
        $outsider = Student::create(['student_id' => 'C', 'guardian_phone' => '01733333333']);
        $svc->enroll($a, $batch); $svc->enroll($b, $batch);
        $att = app(AttendanceService::class);

        $res = $att->saveBulk(['batch_id' => $batch->id, 'date' => '2026-10-01', 'records' => [['student_id' => $a->id, 'status' => 'present'], ['student_id' => $b->id, 'status' => 'absent']]]);
        $this->assertSame(['saved' => 2, 'absent_count' => 1], $res);
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->phone === '01722222222' && $j->institutionId === $this->inst->id);

        $att->saveBulk(['batch_id' => $batch->id, 'date' => '2026-10-01', 'records' => [['student_id' => $b->id, 'status' => 'late']]]);
        $this->assertSame(2, Attendance::count(), 'saving again updates, it does not duplicate');
        $this->assertSame('late', Attendance::where('student_id', $b->id)->value('status'));
        $this->assertSame(50.0, (float) $att->getStudentSummary($a->id, '2026-10')['percentage'] * 0.5);

        try {
            $att->saveBulk(['batch_id' => $batch->id, 'date' => '2026-10-02', 'records' => [['student_id' => $outsider->id, 'status' => 'present']]]);
            $this->fail('expected not_enrolled');
        } catch (BusinessException $e) {
            $this->assertSame('not_enrolled', $e->errorCode);
        }
        $this->assertSame(2, Attendance::count(), 'a refused batch writes nothing');
    }

    public function test_a_school_cannot_take_attendance_on_a_holiday(): void
    {
        $batch = Batch::create(['program_id' => Program::create(['name' => 'Class 6'])->id, 'name' => 'A']);
        Holiday::create(['title' => 'বিজয় দিবস', 'date' => '2026-12-16']);

        try {
            app(AttendanceService::class)->saveBulk(['batch_id' => $batch->id, 'date' => '2026-12-16', 'records' => []]);
            $this->fail('expected holiday_date');
        } catch (BusinessException $e) {
            $this->assertSame(['holiday_date', 422], [$e->errorCode, $e->status]);
        }
    }

    public function test_results_are_graded_from_the_percentage_of_the_exam_subjects_full_marks(): void
    {
        $p = Program::create(['name' => 'Class 10']);
        $exam = Exam::create(['name' => 'Weekly', 'program_id' => $p->id, 'academic_year' => 2026]);
        $math = Subject::create(['program_id' => $p->id, 'name' => 'গণিত']);
        $phy = Subject::create(['program_id' => $p->id, 'name' => 'পদার্থ']);
        $es = ExamSubject::create(['exam_id' => $exam->id, 'subject_id' => $math->id, 'full_marks' => 25, 'pass_marks' => 9]);
        $parts = ExamSubject::create(['exam_id' => $exam->id, 'subject_id' => $phy->id, 'full_marks' => 100, 'pass_marks' => 33,
            'components' => [['key' => 'written', 'label' => 'লিখিত', 'full' => 70, 'pass' => 23], ['key' => 'mcq', 'label' => 'MCQ', 'full' => 30, 'pass' => 10]]]);
        $svc = app(ResultService::class);

        $top = $svc->score($es, 20, null, false);
        $this->assertSame(['A+', 5.0, 80.0, true], [$top['grade'], $top['grade_point'], $top['percentage'], $top['is_pass']]);
        $this->assertSame('F', $svc->score($es, 8, null, false)['grade']);
        $failMcq = $svc->score($parts, null, ['written' => 65, 'mcq' => 9], false);
        $this->assertSame([74.0, false, 'F'], [$failMcq['marks_obtained'], $failMcq['is_pass'], $failMcq['grade']], 'one failed component fails the subject');
        $this->assertSame(['F', true, null], [$svc->score($es, null, null, true)['grade'], $svc->score($es, null, null, true)['is_absent'], $svc->score($es, null, null, true)['marks_obtained']]);

        $s = Student::create(['student_id' => 'S', 'guardian_phone' => '01700000000']);
        $svc->bulkSaveMarks($exam, $math->id, [['student_id' => $s->id, 'marks_obtained' => 20]]);
        $svc->bulkSaveMarks($exam, $math->id, [['student_id' => $s->id, 'marks_obtained' => 18]]);   // 72% -> A
        $this->assertSame(1, Result::count());
        $this->assertSame('A', Result::first()->grade);
        $this->assertSame(4.0, $svc->gpa(Result::all()));

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $svc->score($es, 26, null, false);
    }

    // D56 (owner, 2026-10-10): no plan quota; each sent part costs the platform rate from the wallet (taka), then 402
    public function test_sms_uses_the_monthly_quota_then_prepaid_credit_then_refuses(): void
    {
        $plan = SubscriptionPlan::create(['name' => 'Tiny', 'price' => 1, 'duration_days' => 30, 'max_sms' => 100]);
        $this->inst->forceFill(['subscription_plan_id' => $plan->id, 'sms_balance' => '0.80'])->save();
        $this->bindTenant($this->inst->fresh());
        $sms = app(SmsService::class);

        $this->assertTrue($sms->send('01711111111', 'one'));                       // a plan's max_sms no longer pays (D55)
        $this->assertSame('0.40', $this->inst->fresh()->sms_balance);
        $this->assertTrue($sms->send('01711111111', 'two'));
        $this->assertSame('0.00', $this->inst->fresh()->sms_balance);
        $this->assertSame(['-0.40', '0.00'], [SmsCreditTransaction::latest('id')->first()->amount, SmsCreditTransaction::latest('id')->first()->balance_after]);

        try {
            $sms->send('01711111111', 'three');
            $this->fail('expected sms_quota_exceeded');
        } catch (BusinessException $e) {
            $this->assertSame(['sms_quota_exceeded', 402], [$e->errorCode, $e->status]);
        }
        $this->assertSame(2, SmsLog::count());
        $this->assertStringEndsWith(' -Dhanmondi', SmsLog::first()->message, 'platform sender adds the institution suffix');

        SendSmsJob::dispatchSync('01711111111', 'automatic', $this->inst->id);    // a job never fails on an empty wallet
        $this->assertSame(2, SmsLog::count());
    }

    public function test_an_approved_masking_id_is_used_without_the_suffix(): void
    {
        $this->inst->forceFill(['sms_sender_id' => 'DHANMONDI', 'sms_sender_status' => 'approved', 'sms_balance' => 5])->save();
        $this->bindTenant($this->inst->fresh());

        app(SmsService::class)->send('01711111111', 'hello');

        $this->assertSame(['DHANMONDI', 'hello'], [SmsLog::first()->sender_id, SmsLog::first()->message]);
    }

    public function test_notifications_go_in_app_and_by_sms_unless_the_user_opted_out(): void
    {
        Queue::fake();
        $parent = User::create(['institution_id' => $this->inst->id, 'name' => 'P', 'phone' => '01799999999', 'password' => 'x', 'role' => 'parent']);
        $quiet = User::create(['institution_id' => $this->inst->id, 'name' => 'Q', 'phone' => '01788888888', 'password' => 'x', 'role' => 'parent',
            'notification_preferences' => ['sms' => false]]);

        app(NotificationService::class)->notify($parent, 'fee_due', 'Fee due', 'Please pay');
        app(NotificationService::class)->notify($quiet, 'fee_due', 'Fee due', 'Please pay');

        $this->assertSame(1, $parent->notifications()->count());
        $this->assertSame(1, $quiet->notifications()->count());
        Queue::assertPushed(SendSmsJob::class, 1);
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->phone === '01799999999');
    }

    public function test_pdf_service_renders_with_the_institution_brand_and_stores_under_the_institution(): void
    {
        Storage::fake('private');
        $pdf = app(PdfService::class);

        $bytes = $pdf->render('pdf.layout', ['body' => 'Hello']);
        $this->assertStringStartsWith('%PDF', $bytes);

        $path = $pdf->storeTemporary($bytes);
        $this->assertStringStartsWith("institutions/{$this->inst->id}/tmp/", $path);
        Storage::disk('private')->assertExists($path);
    }
}
