<?php

namespace Tests\Feature\Attendance;

use App\Exceptions\BusinessException;
use App\Models\{Attendance, Batch, Program, Student};
use App\Services\{AttendanceService, EnrollmentService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// docs/TESTING.md "BatchAttendanceTest": the same student on the same day has a separate status in each of two batches (coaching);
// a student without an enrollment is a 422; the same (student, batch, date) twice updates, never duplicates.
class BatchAttendanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_two_batches_one_day_separate_statuses_and_no_duplicates(): void
    {
        Queue::fake();
        $this->bindTenant($this->makeInstitution('batchatt', 'coaching'));
        $p = Program::create(['name' => 'HSC']);
        [$physics, $chemistry] = [Batch::create(['program_id' => $p->id, 'name' => 'Physics']), Batch::create(['program_id' => $p->id, 'name' => 'Chemistry'])];
        $s = Student::create(['student_id' => 'C1', 'guardian_phone' => '01711111111']);
        app(EnrollmentService::class)->enroll($s, $physics);
        app(EnrollmentService::class)->enroll($s, $chemistry);
        $svc = app(AttendanceService::class);
        $day = '2026-03-01';

        $svc->saveBulk(['batch_id' => $physics->id, 'date' => $day, 'records' => [['student_id' => $s->id, 'status' => 'present']]]);
        $svc->saveBulk(['batch_id' => $chemistry->id, 'date' => $day, 'records' => [['student_id' => $s->id, 'status' => 'absent']]]);
        $this->assertSame(['present', 'absent'], [
            Attendance::where('batch_id', $physics->id)->value('status'), Attendance::where('batch_id', $chemistry->id)->value('status')]);

        $svc->saveBulk(['batch_id' => $chemistry->id, 'date' => $day, 'records' => [['student_id' => $s->id, 'status' => 'late']]]);
        $this->assertSame(2, Attendance::count(), 'the same student, batch and date again updates the row');
        $this->assertSame('late', Attendance::where('batch_id', $chemistry->id)->value('status'));

        $loner = Batch::create(['program_id' => $p->id, 'name' => 'Math']);
        $this->expectException(BusinessException::class);
        $svc->saveBulk(['batch_id' => $loner->id, 'date' => $day, 'records' => [['student_id' => $s->id, 'status' => 'present']]]);
    }
}
