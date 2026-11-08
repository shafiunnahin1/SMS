<?php

namespace Tests\Feature\Imports;

use App\Models\{Attendance, Exam, FeeCategory, FeePayment, FeeStructure, Result, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D193 MIG.1 (data-migration.md sections 1-3; ImportDryRunNoWriteTest / ImportIdempotentTest / ImportRollbackTest /
// ImportFeeHistoryTest / ImportSuppressionTest): each new kind - dry-run writes nothing, the run creates the good rows, the same file
// again skips them all, a rollback removes teachers / fee structures / attendance but keeps imported money and results (D32, owner
// 2026-11-07); no SMS during an import; fee history gets LEG- receipts that the dues see.
class MigrationKindsTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function flow(array $s, string $kind, string $csv, array $mapping, int $ok, int $error): array
    {
        $host = $s['host'];
        $file = UploadedFile::fake()->createWithContent("{$kind}.csv", "\u{FEFF}" . $csv);
        $id = $this->api('POST', $host, 'imports', $s['admin'], ['kind' => $kind, 'file' => $file])->assertCreated()->json('data.id');
        $this->api('PUT', $host, "imports/{$id}/mapping", $s['admin'], ['mapping' => $mapping])->assertOk();
        $dry = $this->api('POST', $host, "imports/{$id}/dry-run", $s['admin'])->assertOk()->json('data.summary');
        $this->assertSame([$ok, $error], [$dry['ok'], $dry['error']], "$kind dry-run");
        return [$id, $file];
    }

    private function runJob(array $s, int $id): array
    {
        return $this->api('POST', $s['host'], "imports/{$id}/run", $s['admin'])->assertOk()->json('data');
    }

    public function test_teachers_fee_structure_and_attendance_run_rerun_and_roll_back(): void
    {
        Storage::fake('private');
        $s = $this->school('mig');
        Queue::fake([\App\Jobs\SendSmsJob::class]);   // after the fixture (which fakes every job): only the SMS job is held - the import runs
        $code = Tenancy::as($s['i'], fn () => $s['mine']->fresh()->student_id);
        Tenancy::as($s['i'], fn () => FeeCategory::create(['name' => 'Tuition', 'amount' => '500.00', 'frequency' => 'monthly', 'applicable_to' => 'all']));

        // teachers: 2 good, 1 bad phone
        $csv = "Name,Mobile,Employee\nRahim,01712000001,OLD-1\nKarima,01712000002,OLD-2\nBad,123,OLD-3\n";
        $map = ['name' => 'Name', 'phone' => 'Mobile', 'employee_id' => 'Employee'];
        $before = Tenancy::as($s['i'], fn () => Teacher::count());
        [$t] = $this->flow($s, 'teachers', $csv, $map, 2, 1);
        $this->assertSame($before, Tenancy::as($s['i'], fn () => Teacher::count()), 'dry-run writes nothing');
        $this->assertSame(2, $this->runJob($s, $t)['summary']['ok']);
        $this->assertSame($before + 2, Tenancy::as($s['i'], fn () => Teacher::count()));
        $this->assertTrue(Tenancy::as($s['i'], fn () => (bool) User::inTenant()->where('phone', '01712000001')->value('must_change_password')));
        [$t2] = $this->flow($s, 'teachers', $csv, $map, 0, 1);
        $this->assertSame(2, $this->runJob($s, $t2)['summary']['skipped'], 'the same file again: skipped');

        // fee structure: class-level and batch-level amounts, one unknown head
        $csv = "Class,Section,Fee,Amount\nClass 10,,Tuition,800\nClass 10,A,Tuition,850.50\nClass 10,,Library,100\n";
        [$f] = $this->flow($s, 'fee_structure', $csv, ['program' => 'Class', 'batch' => 'Section', 'fee_category' => 'Fee', 'amount' => 'Amount'], 2, 1);
        $this->runJob($s, $f);
        $this->assertSame(['800.00', '850.50'], Tenancy::as($s['i'], fn () => FeeStructure::orderBy('batch_id')->pluck('amount')->map(fn ($a) => (string) $a)->all()));

        // attendance: P / A codes, one future date refused; no absent SMS
        $csv = "Student,Date,Status\n{$code},2026-10-01,P\n{$code},2026-10-02,A\n{$code},2099-01-01,P\n";
        [$a] = $this->flow($s, 'attendance', $csv, ['student_id' => 'Student', 'date' => 'Date', 'status' => 'Status'], 2, 1);
        $this->runJob($s, $a);
        $this->assertSame(['present', 'absent'], Tenancy::as($s['i'], fn () => Attendance::orderBy('date')->pluck('status')->all()));
        Queue::assertNotPushed(\App\Jobs\SendSmsJob::class);

        // rollback: teachers, fee structures and attendance go
        foreach ([$t, $f, $a] as $job) $this->api('POST', $s['host'], "imports/{$job}/rollback", $s['admin'])->assertOk()->assertJsonPath('data.status', 'rolled_back');
        $this->assertSame([$before, 0, 0], Tenancy::as($s['i'], fn () => [Teacher::count(), FeeStructure::count(), Attendance::count()]));
    }

    public function test_fee_history_and_results_are_kept_by_a_rollback(): void
    {
        Storage::fake('private');
        $s = $this->school('mig-money');
        Queue::fake([\App\Jobs\SendSmsJob::class]);   // after the fixture (which fakes every job): only the SMS job is held - the import runs
        [$mine, $other] = Tenancy::as($s['i'], fn () => [$s['mine']->fresh()->student_id, $s['other']->fresh()->student_id]);
        Tenancy::as($s['i'], fn () => FeeCategory::create(['name' => 'Tuition', 'amount' => '500.00', 'frequency' => 'monthly', 'applicable_to' => 'all']));

        // fee history: one old receipt with two lines (the second pays this month), one bad amount
        $now = now()->format('Y-m');
        $dues = fn () => collect($this->api('GET', $s['host'], "fees/dues?student_id={$s['mine']->id}", $s['admin'])->assertOk()->json('data.lines'))->pluck('period')->all();
        $this->assertContains($now, $dues());
        $csv = "Student,Fee,Amount,Date,Receipt,Month\n{$mine},Tuition,500,2026-01-10,R-77,2026-01\n{$mine},Tuition,500.00," . now()->toDateString() . ",R-77,{$now}\n{$other},Tuition,abc,2026-01-11,R-78,2026-01\n";
        $map = ['student_id' => 'Student', 'fee_category' => 'Fee', 'amount' => 'Amount', 'paid_at' => 'Date', 'receipt_no' => 'Receipt', 'month' => 'Month'];
        [$h] = $this->flow($s, 'fee_history', $csv, $map, 2, 1);
        $this->assertSame(0, Tenancy::as($s['i'], fn () => FeePayment::count()), 'dry-run writes nothing');
        $this->runJob($s, $h);
        $lines = Tenancy::as($s['i'], fn () => FeePayment::orderBy('line_no')->get(['receipt_no', 'line_no', 'paid_amount', 'month']));
        $this->assertSame([['LEG-R-77', 1, '500.00', '2026-01'], ['LEG-R-77', 2, '500.00', $now]], $lines->map(fn ($l) => [$l->receipt_no, (int) $l->line_no, (string) $l->paid_amount, $l->month])->all());
        Queue::assertNotPushed(\App\Jobs\SendSmsJob::class);   // no receipt SMS
        $this->assertNotContains($now, $dues(), 'the imported receipt line pays this month (net-based dueLines)');
        [$h2] = $this->flow($s, 'fee_history', $csv, $map, 0, 1);
        $this->assertSame(2, $this->runJob($s, $h2)['summary']['skipped']);

        // results: an old exam, published, graded; one subject unknown
        $csv = "Exam,Year,Student,Subject,Marks\nHalf yearly,2025,{$mine},বাংলা,72\nHalf yearly,2025,{$mine},পদার্থবিজ্ঞান,40\nHalf yearly,2025,{$mine},Chemistry,50\n";
        [$r] = $this->flow($s, 'results', $csv, ['exam_name' => 'Exam', 'academic_year' => 'Year', 'student_id' => 'Student', 'subject' => 'Subject', 'marks' => 'Marks'], 2, 1);
        $this->runJob($s, $r);
        $exam = Tenancy::as($s['i'], fn () => Exam::where('name', '[পুরনো] Half yearly')->first());
        $this->assertSame(['published', 2025], [$exam->status, (int) $exam->academic_year]);
        $this->assertSame(2, Tenancy::as($s['i'], fn () => Result::where('exam_id', $exam->id)->whereNotNull('grade')->count()));

        // rollback keeps money and results (D32) and lists them
        foreach ([$h, $r] as $job) {
            $kept = $this->api('POST', $s['host'], "imports/{$job}/rollback", $s['admin'])->assertOk()->json('data.summary.rollback_kept');
            $this->assertCount(2, $kept);
        }
        $this->assertSame([2, 2], Tenancy::as($s['i'], fn () => [FeePayment::count(), Result::count()]));
    }
}
