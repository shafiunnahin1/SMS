<?php

namespace Tests\Feature\Attendance;

use App\Exceptions\BusinessException;
use App\Models\{Attendance, Batch, Holiday, Program, Student};
use App\Services\{AttendanceService, EnrollmentService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// docs/TESTING.md "AttendanceServiceTest": a school cannot take attendance on a holiday (a coaching can); the student must be enrolled
// in the batch; the month percentage.
class AttendanceServiceTest extends TestCase
{
    use RefreshDatabase;

    private function batch(string $type): array
    {
        Queue::fake();
        $i = $this->makeInstitution("att{$type}", $type);
        $this->bindTenant($i);
        $batch = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']);
        $s = Student::create(['student_id' => 'S1', 'guardian_phone' => '01711111111']);
        app(EnrollmentService::class)->enroll($s, $batch);
        return [$batch, $s];
    }

    public function test_cannot_take_attendance_on_a_holiday_in_a_school_but_a_coaching_can(): void
    {
        [$batch, $s] = $this->batch('school');
        Holiday::create(['date' => '2025-12-16', 'title' => 'Victory Day', 'type' => 'public']);
        try {
            app(AttendanceService::class)->saveBulk(['batch_id' => $batch->id, 'date' => '2025-12-16', 'records' => [['student_id' => $s->id, 'status' => 'present']]]);
            $this->fail('holiday_date expected');
        } catch (BusinessException $e) {
            $this->assertSame(['holiday_date', 422], [$e->errorCode, $e->status]);
        }
        $this->assertSame(0, Attendance::count());

        [$cBatch, $cs] = $this->batch('coaching');
        Holiday::create(['date' => '2025-12-16', 'title' => 'Victory Day', 'type' => 'public']);
        app(AttendanceService::class)->saveBulk(['batch_id' => $cBatch->id, 'date' => '2025-12-16', 'records' => [['student_id' => $cs->id, 'status' => 'present']]]);
        $this->assertSame(1, Attendance::count(), 'a coaching batch may meet on a public holiday');
    }

    public function test_the_student_must_be_enrolled_in_the_batch(): void
    {
        [$batch] = $this->batch('school');
        $stranger = Student::create(['student_id' => 'S2', 'guardian_phone' => '01722222222']);
        $this->expectException(BusinessException::class);
        app(AttendanceService::class)->saveBulk(['batch_id' => $batch->id, 'date' => '2025-02-01', 'records' => [['student_id' => $stranger->id, 'status' => 'present']]]);
    }

    public function test_the_month_percentage(): void
    {
        [$batch, $s] = $this->batch('school');
        $svc = app(AttendanceService::class);
        foreach (['2025-01-05' => 'present', '2025-01-06' => 'present', '2025-01-07' => 'absent', '2025-01-08' => 'late'] as $date => $status) {
            $svc->saveBulk(['batch_id' => $batch->id, 'date' => $date, 'records' => [['student_id' => $s->id, 'status' => $status]]]);
        }
        $sum = $svc->getStudentSummary($s->id, '2025-01');
        $this->assertSame([4, 2, 1, 1, 50.0], [$sum['total_days'], $sum['present'], $sum['absent'], $sum['late'], (float) $sum['percentage']]);
        $this->assertSame(0, $svc->getStudentSummary($s->id, '2025-02')['total_days'], 'another month is separate');
    }
}
