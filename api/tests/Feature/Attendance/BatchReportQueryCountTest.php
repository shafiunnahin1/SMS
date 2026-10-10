<?php

namespace Tests\Feature\Attendance;

use App\Models\{Batch, Program, Student, User};
use App\Services\{AttendanceService, EnrollmentService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue};
use Tests\TestCase;

// docs/TESTING.md "BatchReportQueryCountTest": getBatchReport for 40 students in <= 4 queries; the result equals the per-student summaries
class BatchReportQueryCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_forty_students_in_at_most_four_queries_with_the_same_numbers(): void
    {
        Queue::fake();
        $i = $this->makeInstitution('rcount', 'school');
        $this->bindTenant($i);
        $batch = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']);
        $svc = app(AttendanceService::class);
        $ids = [];
        foreach (range(1, 40) as $n) {
            $u = User::create(['institution_id' => $i->id, 'name' => "S{$n}", 'username' => "R{$n}", 'password' => 'x', 'role' => 'student']);
            $s = Student::create(['user_id' => $u->id, 'student_id' => "R{$n}", 'guardian_phone' => '01711111111']);
            app(EnrollmentService::class)->enroll($s, $batch);
            $ids[] = $s->id;
        }
        foreach (['2026-05-03', '2026-05-04', '2026-05-05'] as $k => $day) {
            $svc->saveBulk(['batch_id' => $batch->id, 'date' => $day, 'records' => array_map(fn ($id, $n) => ['student_id' => $id,
                'status' => ['present', 'absent', 'late'][($n + $k) % 3]], $ids, array_keys($ids))]);
        }

        $queries = 0;
        DB::listen(function () use (&$queries) { $queries++; });
        $report = $svc->getBatchReport($batch->id, '2026-05');
        $this->assertLessThanOrEqual(4, $queries, "the report took {$queries} queries");
        $this->assertCount(40, $report);
        foreach ($report as $row) {
            $one = $svc->getStudentSummary($row['student']->id, '2026-05');
            $this->assertSame([$one['total_days'], $one['present'], $one['absent'], $one['late']],
                [$row['summary']['total_days'], $row['summary']['present'], $row['summary']['absent'], $row['summary']['late']]);
        }
    }
}
