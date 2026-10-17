<?php

namespace Tests\Feature\CashBook;

use App\Models\{Batch, FeeCategory, FeePayment, Program, Student};
use App\Services\EnrollmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

abstract class CashBookTestCase extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-15 12:00:00');
        Queue::fake();
    }
    protected function tenant(string $slug = 'cashbook', string $type = 'school'): array
    {
        $i = $this->makeInstitution($slug, $type);
        return [$i, $this->makeUser($i, 'admin')];
    }
    protected function fee($i, string $amount, string $method = 'cash', string $date = '2026-10-14'): FeePayment
    {
        return Tenancy::as($i, function () use ($amount, $method, $date) {
            $student = Student::first() ?? Student::create(['student_id' => 'CB-1', 'guardian_phone' => '01711111111']);
            $category = FeeCategory::first() ?? FeeCategory::create(['name' => 'Tuition', 'amount' => '100.00', 'frequency' => 'monthly']);
            return FeePayment::create(['student_id' => $student->id, 'fee_category_id' => $category->id,
                'amount' => $amount, 'paid_amount' => $amount, 'receipt_no' => 'CB-' . (FeePayment::count() + 1),
                'payment_method' => $method, 'paid_at' => $date . ' 10:00:00']);
        });
    }
    protected function expense(array $changes = []): array
    {
        return array_replace(['category' => 'office', 'title' => 'Supplies', 'amount' => '10.10', 'expense_date' => '2026-10-14'], $changes);
    }
    protected function studentWithDues($i): Student
    {
        return Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Course']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'Batch', 'monthly_fee' => '100.00']);
            FeeCategory::create(['name' => 'Tuition', 'amount' => '100.00', 'frequency' => 'monthly']);
            $s = Student::create(['student_id' => 'DUE-1', 'guardian_phone' => '01711111111']);
            app(EnrollmentService::class)->enroll($s, $b, ['enrolled_at' => '2026-10-01']);
            return $s;
        });
    }
}
