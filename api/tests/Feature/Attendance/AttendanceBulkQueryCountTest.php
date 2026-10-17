<?php

namespace Tests\Feature\Attendance;

use App\Jobs\NotifyAbsentParentsJob;
use App\Models\{Attendance, Batch, Program, Student};
use App\Services\{AttendanceService, EnrollmentService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue};
use Tests\TestCase;

// docs/TESTING.md "AttendanceBulkQueryCountTest" (Step 4.3 Done When: 40 students <= 6 queries; TESTING.md: 50): saving a whole sheet
// is a fixed number of queries; saving the same data again adds no rows; an update keeps created_at; absent alerts are one queued job.
class AttendanceBulkQueryCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_fifty_students_in_at_most_six_queries_and_a_resave_changes_nothing(): void
    {
        Queue::fake([NotifyAbsentParentsJob::class]);
        $this->bindTenant($this->makeInstitution('qcount', 'school'));
        $batch = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A', 'max_capacity' => 100]);
        $records = [];
        foreach (range(1, 50) as $n) {
            $s = Student::create(['student_id' => "Q{$n}", 'guardian_phone' => '0171' . str_pad((string) $n, 7, '0', STR_PAD_LEFT)]);
            app(EnrollmentService::class)->enroll($s, $batch);
            $records[] = ['student_id' => $s->id, 'status' => $n % 10 === 0 ? 'absent' : 'present'];
        }
        $svc = app(AttendanceService::class);
        $day = '2026-04-02';

        $queries = 0;
        DB::listen(function () use (&$queries) { $queries++; });
        $svc->saveBulk(['batch_id' => $batch->id, 'date' => $day, 'records' => $records]);
        $this->assertLessThanOrEqual(6, $queries, "saving 50 students took {$queries} queries");
        Queue::assertPushed(NotifyAbsentParentsJob::class, fn ($j) => count($j->studentIds) === 5);

        $created = Attendance::orderBy('id')->value('created_at');
        $this->travel(5)->minutes();
        $svc->saveBulk(['batch_id' => $batch->id, 'date' => $day, 'records' => $records]);
        $this->assertSame(50, Attendance::count(), 'saving again adds no rows');
        $this->assertEquals($created, Attendance::orderBy('id')->value('created_at'), 'an update keeps the first save time');
    }
}
