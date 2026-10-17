<?php

namespace Tests\Feature\Services;

use App\Models\{AcademicYear, Batch, Enrollment, FeeCategory, FeePayment, FeeStructure, Institution, Program, Student};
use App\Services\{EnrollmentService, FeeService};
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "FeeResolutionTest": fee_override > batches.monthly_fee > batch fee_structures > program fee_structures > category;
// a student in two batches has two dues; half_after_15 proration; (R10) the enrollment's academic year wins over the year-less row.
class FeeResolutionTest extends TestCase
{
    use RefreshDatabase;

    private FeeService $fees;
    private Institution $inst;
    private Program $program;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fees = app(FeeService::class);
        $this->inst = $this->makeInstitution('coach', 'coaching');
        $this->bindTenant($this->inst);
        $this->program = Program::create(['name' => 'Physics']);
    }

    private function enroll(Batch $b, array $data = [], ?Student $s = null): Enrollment
    {
        $s ??= Student::create(['student_id' => 'S' . uniqid(), 'guardian_phone' => '01700000000']);
        return app(EnrollmentService::class)->enroll($s, $b, $data);
    }

    public function test_the_five_level_order_for_monthly_tuition(): void
    {
        $tuition = FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 500, 'frequency' => 'monthly']);
        $plain = Batch::create(['program_id' => $this->program->id, 'name' => 'plain']);
        $this->assertSame('500.00', $this->fees->resolveAmount($this->enroll($plain), $tuition), 'category amount');

        FeeStructure::create(['program_id' => $this->program->id, 'batch_id' => 0, 'fee_category_id' => $tuition->id, 'amount' => 600]);
        $this->assertSame('600.00', $this->fees->resolveAmount($this->enroll($plain), $tuition), 'program structure beats category');

        FeeStructure::create(['program_id' => $this->program->id, 'batch_id' => $plain->id, 'fee_category_id' => $tuition->id, 'amount' => 700]);
        $this->assertSame('700.00', $this->fees->resolveAmount($this->enroll($plain), $tuition), 'batch structure beats program');

        $priced = Batch::create(['program_id' => $this->program->id, 'name' => 'priced', 'monthly_fee' => '800.00']);
        FeeStructure::create(['program_id' => $this->program->id, 'batch_id' => $priced->id, 'fee_category_id' => $tuition->id, 'amount' => 750]);
        $this->assertSame('800.00', $this->fees->resolveAmount($this->enroll($priced), $tuition), 'batch monthly_fee beats structures');

        $this->assertSame('650.50', $this->fees->resolveAmount($this->enroll($priced, ['fee_override' => '650.50']), $tuition), 'override wins');
        $this->assertSame('650.50', $this->fees->resolveMonthlyAmount(Enrollment::latest('id')->first()));
    }

    public function test_override_and_batch_fee_apply_to_monthly_tuition_only(): void
    {
        $admission = FeeCategory::create(['name' => 'ভর্তি ফি', 'amount' => 300, 'frequency' => 'once']);
        $priced = Batch::create(['program_id' => $this->program->id, 'name' => 'priced', 'monthly_fee' => 900]);

        $this->assertSame('300.00', $this->fees->resolveAmount($this->enroll($priced, ['fee_override' => 100]), $admission));
    }

    public function test_program_specific_categories_need_a_structure_row_and_zero_means_not_due(): void
    {
        $lab = FeeCategory::create(['name' => 'ল্যাব ফি', 'amount' => 200, 'frequency' => 'once', 'applicable_to' => 'program_specific']);
        $free = FeeCategory::create(['name' => 'ফ্রি', 'amount' => 0, 'frequency' => 'once']);
        $b = Batch::create(['program_id' => $this->program->id, 'name' => 'b']);
        $e = $this->enroll($b);

        $this->assertNull($this->fees->resolveAmount($e, $lab));
        $this->assertNull($this->fees->resolveAmount($e, $free));
        FeeStructure::create(['program_id' => $this->program->id, 'batch_id' => 0, 'fee_category_id' => $lab->id, 'amount' => 250]);
        $this->assertSame('250.00', $this->fees->resolveAmount($e, $lab));
    }

    public function test_the_enrollments_academic_year_row_beats_the_year_less_row_and_a_new_year_does_not_change_old_fees(): void
    {
        $tuition = FeeCategory::create(['name' => 'বেতন', 'amount' => 100, 'frequency' => 'monthly']);
        $y25 = AcademicYear::create(['name' => '2025', 'start_date' => '2025-01-01', 'end_date' => '2025-12-31']);
        $y26 = AcademicYear::create(['name' => '2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31']);
        $b = Batch::create(['program_id' => $this->program->id, 'name' => 'b']);
        FeeStructure::create(['program_id' => $this->program->id, 'batch_id' => 0, 'fee_category_id' => $tuition->id, 'amount' => 400, 'academic_year_id' => 0]);
        FeeStructure::create(['program_id' => $this->program->id, 'batch_id' => 0, 'fee_category_id' => $tuition->id, 'amount' => 450, 'academic_year_id' => $y25->id]);
        $old = $this->enroll($b, ['academic_year_id' => $y25->id]);

        $this->assertSame('450.00', $this->fees->resolveAmount($old, $tuition));
        FeeStructure::create(['program_id' => $this->program->id, 'batch_id' => 0, 'fee_category_id' => $tuition->id, 'amount' => 500, 'academic_year_id' => $y26->id]);
        $this->assertSame('450.00', $this->fees->resolveAmount($old->fresh(), $tuition), 'adding 2026 must not change a 2025 enrollment');
        $this->assertSame('500.00', $this->fees->resolveAmount($this->enroll($b, ['academic_year_id' => $y26->id]), $tuition));
        $this->assertSame('400.00', $this->fees->resolveAmount($this->enroll($b), $tuition), 'no year -> the year-less row');
    }

    public function test_a_student_in_two_batches_has_a_due_per_batch(): void
    {
        $this->travelTo('2026-10-20');
        FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 1000, 'frequency' => 'monthly']);
        $p = Batch::create(['program_id' => $this->program->id, 'name' => 'physics', 'monthly_fee' => 1000]);
        $m = Batch::create(['program_id' => $this->program->id, 'name' => 'math', 'monthly_fee' => 1200]);
        $e1 = $this->enroll($p, ['enrolled_at' => '2026-10-01']);
        $this->enroll($m, ['enrolled_at' => '2026-10-01'], $e1->student);

        $lines = $this->fees->dueLines($e1->student);
        $this->assertSame([['1000.00', '2026-10'], ['1200.00', '2026-10']], $lines->map(fn ($l) => [$l['amount'], $l['period']])->all());
        $this->assertSame(2, $lines->pluck('batch_id')->unique()->count());
    }

    public function test_monthly_dues_run_from_the_enrollment_month_and_net_payments_settle_them(): void
    {
        $this->travelTo('2026-10-20');
        $tuition = FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 500, 'frequency' => 'monthly']);
        $b = Batch::create(['program_id' => $this->program->id, 'name' => 'b']);
        $e = $this->enroll($b, ['enrolled_at' => '2026-08-05']);

        $this->assertSame(['2026-08', '2026-09', '2026-10'], $this->fees->dueLines($e->student)->pluck('period')->all());

        FeePayment::create(['student_id' => $e->student_id, 'enrollment_id' => $e->id, 'batch_id' => $b->id, 'fee_category_id' => $tuition->id,
            'amount' => 500, 'paid_amount' => 200, 'month' => '2026-08', 'receipt_no' => 'R1', 'status' => 'partial']);
        $this->assertSame('300.00', $this->fees->dueLines($e->student)->firstWhere('period', '2026-08')['amount'], 'partial payment leaves the rest');

        FeePayment::create(['student_id' => $e->student_id, 'enrollment_id' => $e->id, 'batch_id' => $b->id, 'fee_category_id' => $tuition->id,
            'amount' => 500, 'paid_amount' => 300, 'month' => '2026-08', 'receipt_no' => 'R2', 'status' => 'paid']);
        $this->assertNull($this->fees->dueLines($e->student)->firstWhere('period', '2026-08'));

        FeePayment::create(['student_id' => $e->student_id, 'enrollment_id' => $e->id, 'batch_id' => $b->id, 'fee_category_id' => $tuition->id,
            'amount' => 500, 'paid_amount' => -300, 'month' => '2026-08', 'receipt_no' => 'R3', 'status' => 'reversed']);
        $this->assertSame('300.00', $this->fees->dueLines($e->student)->firstWhere('period', '2026-08')['amount'], 'a reversal makes it due again (D32)');
    }

    public function test_half_after_15_prorates_only_the_first_month_of_a_late_enrollment(): void
    {
        $this->travelTo('2026-10-20');
        $this->inst->forceFill(['settings' => ['fee_proration' => 'half_after_15']])->save();
        $this->bindTenant($this->inst->fresh());
        FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => '999.99', 'frequency' => 'monthly']);
        $b = Batch::create(['program_id' => $this->program->id, 'name' => 'b']);

        $late = $this->fees->dueLines($this->enroll($b, ['enrolled_at' => '2026-09-16'])->student);
        $this->assertSame(['500.00', '999.99'], $late->pluck('amount')->all(), 'half of 999.99 rounds half-up to 500.00');

        $early = $this->fees->dueLines($this->enroll($b, ['enrolled_at' => '2026-09-15'])->student);
        $this->assertSame(['999.99', '999.99'], $early->pluck('amount')->all());
    }

    public function test_collect_writes_one_receipt_with_numbered_lines_and_money_stays_exact(): void
    {
        $this->travelTo('2026-10-20');
        FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => '0.10', 'frequency' => 'monthly']);
        FeeCategory::create(['name' => 'অন্য', 'amount' => '0.20', 'frequency' => 'once']);
        $b = Batch::create(['program_id' => $this->program->id, 'name' => 'b']);
        $s = $this->enroll($b, ['enrolled_at' => '2026-10-01'])->student;

        $rows = $this->fees->collect($s, $this->fees->dueLines($s)->map(fn ($l) => ['key' => $l['key']])->all());

        $this->assertSame([1, 2], $rows->pluck('line_no')->all());
        $this->assertCount(1, $rows->pluck('receipt_no')->unique());
        $this->assertSame('0.30', Money::format(FeePayment::all()->sum(fn ($p) => Money::toPaisa($p->paid_amount))));
        $this->assertSame('RCP-' . date('Y') . '-00002', \Illuminate\Support\Facades\DB::transaction(fn () => $this->fees->nextReceiptNo()));
        $this->assertTrue($this->fees->dueLines($s)->isEmpty());
    }

    public function test_money_helper_is_exact_and_rounds_half_up(): void
    {
        $this->assertSame(30, Money::toPaisa('0.1') + Money::toPaisa('0.2'));
        $this->assertSame('0.30', Money::format(Money::toPaisa('0.1') + Money::toPaisa('0.2')));
        $this->assertSame(1235, Money::toPaisa('12.345'));
        $this->assertSame(-1050, Money::toPaisa('-10.50'));
        $this->assertSame('-10.50', Money::format(-1050));
        $this->assertSame(50000, Money::ratio(99999, 1, 2));
        $this->expectException(\InvalidArgumentException::class);
        Money::toPaisa('12,50');
    }
}
