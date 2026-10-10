<?php

namespace Tests\Feature\Fees;

use App\Exceptions\BusinessException;
use App\Models\{Batch, FeeCategory, FeePayment, Institution, Program, Student};
use App\Services\{EnrollmentService, FeeService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// Step 4.4 FeeService: categories (frequency fixed once collected), receipt numbers per institution and year, receipts list
// grouped per receipt, the month report (program / category filters, exact decimal sums).
class FeeServiceTest extends TestCase
{
    use RefreshDatabase;

    private FeeService $fees;
    private Institution $inst;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        $this->travelTo('2026-10-20 09:00:00');
        $this->fees = app(FeeService::class);
        $this->inst = $this->makeInstitution('fsvc');
        $this->bindTenant($this->inst);
    }

    private function studentIn(Batch $b, string $code): Student
    {
        $s = Student::create(['student_id' => $code, 'guardian_phone' => '01700000000']);
        app(EnrollmentService::class)->enroll($s, $b, ['enrolled_at' => '2026-10-01']);
        return $s;
    }

    public function test_a_category_keeps_its_frequency_once_money_was_collected(): void
    {
        $c = $this->fees->saveCategory(['name' => 'Tuition', 'amount' => '700', 'frequency' => 'monthly']);
        $this->assertSame('all', $c->applicable_to);
        $this->assertSame('yearly', $this->fees->saveCategory(['name' => 'Tuition', 'amount' => '700', 'frequency' => 'yearly'], $c)->frequency, 'no money yet: free to change');
        $c = $this->fees->saveCategory(['name' => 'Tuition', 'amount' => '700', 'frequency' => 'monthly'], $c);

        $s = $this->studentIn(Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']), 'S1');
        $this->fees->collect($s, [['key' => $this->fees->dueLines($s)->first()['key']]]);
        try {
            $this->fees->saveCategory(['name' => 'Tuition', 'amount' => '700', 'frequency' => 'once'], $c);
            $this->fail('expected in_use');
        } catch (BusinessException $e) {
            $this->assertSame(['in_use', 422], [$e->errorCode, $e->status]);
        }
        $this->assertSame('800.00', (string) $this->fees->saveCategory(['name' => 'Tuition', 'amount' => '800', 'frequency' => 'monthly'], $c)->fresh()->amount);
    }

    public function test_receipt_numbers_run_per_institution_and_the_list_groups_lines_per_receipt(): void
    {
        FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
        FeeCategory::create(['name' => 'Admission', 'amount' => 1000, 'frequency' => 'once']);
        $b = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']);
        $s = $this->studentIn($b, 'S1');
        $first = $this->fees->collect($s, $this->fees->dueLines($s)->map(fn ($l) => ['key' => $l['key']])->all());
        $this->assertSame(['RCP-2026-00001', 2], [$first->first()->receipt_no, $first->count()]);

        $other = $this->makeInstitution('fsvc2');
        $otherNo = Tenancy::as($other, function () {
            FeeCategory::create(['name' => 'Tuition', 'amount' => 300, 'frequency' => 'monthly']);
            $s = $this->studentIn(Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']), 'X1');
            return app(FeeService::class)->collect($s, [['key' => app(FeeService::class)->dueLines($s)->first()['key']]])->first()->receipt_no;
        });
        $this->assertSame('RCP-2026-00001', $otherNo, 'numbering is per institution');

        $this->travelTo('2026-11-02 09:00:00');
        $this->assertSame('RCP-2026-00002', $this->fees->collect($s, [['key' => $this->fees->dueLines($s)->first()['key']]])->first()->receipt_no);

        $page = $this->fees->receipts([]);
        $this->assertSame(2, $page->total(), 'one row per receipt, only this institution');
        $this->assertSame(['RCP-2026-00002', 'RCP-2026-00001'], collect($page->items())->pluck('receipt_no')->all());
        $this->assertSame(['500.00', '1500.00'], collect($page->items())->map(fn ($r) => \App\Support\Money::format(\App\Support\Money::toPaisa((string) $r->total)))->all());
    }

    public function test_the_month_report_sums_exactly_and_filters_by_program_and_category(): void
    {
        $tuition = FeeCategory::create(['name' => 'Tuition', 'amount' => '333.33', 'frequency' => 'monthly']);
        FeeCategory::create(['name' => 'Exam', 'amount' => '0.10', 'frequency' => 'once']);
        $six = Program::create(['name' => 'Six']);
        $seven = Program::create(['name' => 'Seven']);
        $a = $this->studentIn(Batch::create(['program_id' => $six->id, 'name' => 'A']), 'A1');
        $b = $this->studentIn(Batch::create(['program_id' => $seven->id, 'name' => 'A']), 'B1');
        foreach ([$a, $b] as $s) $this->fees->collect($s, $this->fees->dueLines($s)->map(fn ($l) => ['key' => $l['key']])->all(), 'cash');

        $r = $this->fees->monthlyReport('2026-10');
        $this->assertSame(['666.86', 2], [$r['total'], $r['receipts']], '2 x (333.33 + 0.10) without float drift');
        $this->assertSame([['id' => $tuition->id, 'name' => 'Tuition', 'total' => '666.66']], $r['by_category']->take(1)->all());
        $this->assertSame('333.43', $this->fees->monthlyReport('2026-10', $six->id)['total']);
        $this->assertSame('333.33', $this->fees->monthlyReport('2026-10', $seven->id, $tuition->id)['total']);
        $this->assertSame(['0.00', 0], [$this->fees->monthlyReport('2026-11')['total'], $this->fees->monthlyReport('2026-11')['receipts']]);
        $this->assertSame(4, FeePayment::count());
    }
}
