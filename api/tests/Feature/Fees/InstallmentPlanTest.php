<?php

namespace Tests\Feature\Fees;

use App\Models\{AuditLog, Batch, FeeCategory, FeeInstallment, Program, Student};
use App\Services\EnrollmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D211 INST.1: a plan splits one due line into equal installments in paisa (the last takes the rounding), monthly from the given
// first date (no overflow past a short month), one open plan per due line, only an unpaid installment's date changes; the admin
// and the accountant, not a teacher.
class InstallmentPlanTest extends TestCase
{
    use RefreshDatabase;

    public function test_plan_amounts_dates_and_rules(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $i = $this->makeInstitution('inst1', 'coaching');
        $student = Tenancy::as($i, function () {
            FeeCategory::create(['name' => 'ভর্তি ফি', 'amount' => 1000, 'frequency' => 'once']);
            $b = Batch::create(['program_id' => Program::create(['name' => 'HSC'])->id, 'name' => 'Physics', 'monthly_fee' => 0]);
            $s = Student::create(['student_id' => 'C-1', 'guardian_phone' => '01711111111']);
            app(EnrollmentService::class)->enroll($s, $b, ['enrolled_at' => '2026-11-01']);
            return $s;
        });
        $h = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');
        $acct = $this->makeUser($i, 'accountant');
        $line = collect($this->api('GET', $h, "fees/dues?student_id={$student->id}", $acct)->assertOk()->json('data.lines'))->firstWhere('period', 'once');
        $this->assertSame('1000.00', $line['amount']);

        $body = ['student_id' => $student->id, 'due_key' => $line['key'], 'installments' => 3, 'first_due_date' => '2027-01-31'];
        $this->api('POST', $h, 'fees/installments/plan', $acct, ['first_due_date' => '2026-01-01'] + $body)->assertStatus(422);   // not in the past
        $this->api('POST', $h, 'fees/installments/plan', $acct, ['due_key' => '9:9:once'] + $body)->assertStatus(422)->assertJsonPath('error', 'due_not_found');
        $r = $this->api('POST', $h, 'fees/installments/plan', $acct, $body)->assertCreated();
        $this->assertSame(['333.33', '333.33', '333.34'], array_column($r->json('data.items'), 'amount'));
        $this->assertSame(['2027-01-31', '2027-02-28', '2027-03-31'], array_column($r->json('data.items'), 'due_date'));   // no overflow into March
        $this->assertSame(['pending', 'pending', 'pending'], array_column($r->json('data.items'), 'status'));
        $this->api('POST', $h, 'fees/installments/plan', $admin, $body)->assertStatus(422)->assertJsonPath('error', 'plan_exists');

        // the due date of an unpaid installment changes; a paid one does not
        $items = $r->json('data.items');
        $this->api('PUT', $h, "fees/installments/{$items[1]['id']}", $admin, ['due_date' => '2027-03-05'])->assertOk()->assertJsonPath('data.due_date', '2027-03-05');
        Tenancy::as($i, fn () => FeeInstallment::whereKey($items[0]['id'])->update(['status' => 'paid', 'paid_at' => now()]));
        $this->api('PUT', $h, "fees/installments/{$items[0]['id']}", $admin, ['due_date' => '2027-02-01'])->assertStatus(422)->assertJsonPath('error', 'installment_paid');

        $plan = $this->api('GET', $h, 'fees/installments/' . $r->json('data.id'), $admin)->assertOk();
        $this->assertSame('1000.00', $plan->json('data.total_amount'));
        $this->assertCount(1, $this->api('GET', $h, "fees/installments?student_id={$student->id}", $acct)->json('data'));
        Tenancy::as($i, function () {
            $this->assertSame(['installment_plan.created', 'installment.due_changed'], AuditLog::where('action', 'like', 'installment%')->orderBy('id')->pluck('action')->all());
            try { FeeInstallment::first()->delete(); $this->fail('an installment was deleted'); } catch (\LogicException) {}
        });
        $this->api('GET', $h, 'fees/installments', $this->makeUser($i, 'teacher'))->assertForbidden();
    }

    public function test_a_due_too_small_to_split(): void
    {
        $i = $this->makeInstitution('inst2', 'coaching');
        $student = Tenancy::as($i, function () {
            FeeCategory::create(['name' => 'ফর্ম', 'amount' => '0.02', 'frequency' => 'once']);
            $b = Batch::create(['program_id' => Program::create(['name' => 'HSC'])->id, 'name' => 'P', 'monthly_fee' => 0]);
            $s = Student::create(['student_id' => 'C-2', 'guardian_phone' => '01711111112']);
            app(EnrollmentService::class)->enroll($s, $b, ['enrolled_at' => now()->toDateString()]);
            return $s;
        });
        $admin = $this->makeUser($i, 'admin');
        $key = collect($this->api('GET', $this->hostOf($i), "fees/dues?student_id={$student->id}", $admin)->json('data.lines'))->firstWhere('period', 'once')['key'];
        $this->api('POST', $this->hostOf($i), 'fees/installments/plan', $admin, ['student_id' => $student->id, 'due_key' => $key, 'installments' => 3, 'first_due_date' => now()->addDay()->toDateString()])
            ->assertStatus(422)->assertJsonPath('error', 'due_too_small');
    }
}
