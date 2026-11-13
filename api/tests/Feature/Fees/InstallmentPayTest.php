<?php

namespace Tests\Feature\Fees;

use App\Jobs\SendSmsJob;
use App\Models\{Batch, FeeCategory, FeeInstallment, FeePayment, Program, Student};
use App\Services\EnrollmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D211 INST.2: an installment is paid through the normal collection (one RCP- receipt for its own amount, the due line goes down),
// never twice; the daily job marks overdue and sends the fee_due_reminder SMS once 3 days before and once after - never twice;
// the overdue list; when the reminder event is off nothing is sent (and nothing is marked, so it can go later).
class InstallmentPayTest extends TestCase
{
    use RefreshDatabase;

    public function test_pay_daily_reminders_and_overdue(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-13 10:00:00');
        $i = $this->makeInstitution('inst3', 'coaching');
        $student = Tenancy::as($i, function () {
            FeeCategory::create(['name' => 'ভর্তি ফি', 'amount' => 900, 'frequency' => 'once']);
            $b = Batch::create(['program_id' => Program::create(['name' => 'HSC'])->id, 'name' => 'P', 'monthly_fee' => 0]);
            $s = Student::create(['student_id' => 'C-3', 'guardian_phone' => '01711333333']);
            app(EnrollmentService::class)->enroll($s, $b, ['enrolled_at' => '2026-11-01']);
            return $s;
        });
        $h = $this->hostOf($i);
        $acct = $this->makeUser($i, 'accountant');
        $key = collect($this->api('GET', $h, "fees/dues?student_id={$student->id}", $acct)->json('data.lines'))->firstWhere('period', 'once')['key'];
        $items = $this->api('POST', $h, 'fees/installments/plan', $acct, ['student_id' => $student->id, 'due_key' => $key, 'installments' => 3, 'first_due_date' => '2026-11-15'])
            ->assertCreated()->json('data.items');   // 300 each: 15 Nov, 15 Dec, 15 Jan

        // pay the first: a normal receipt for 300, the due line now owes 600
        $r = $this->api('POST', $h, "fees/installments/{$items[0]['id']}/pay", $acct, ['payment_method' => 'cash'])->assertCreated();
        $this->assertMatchesRegularExpression('/^RCP-2026-\d{5}$/', $r->json('data.receipt_no'));
        $this->assertSame('paid', $r->json('data.status'));
        $this->api('POST', $h, "fees/installments/{$items[0]['id']}/pay", $acct)->assertStatus(409)->assertJsonPath('error', 'installment_paid');
        $this->assertSame('600.00', collect($this->api('GET', $h, "fees/dues?student_id={$student->id}", $acct)->json('data.lines'))->firstWhere('key', $key)['amount']);
        Tenancy::as($i, fn () => $this->assertSame(['300.00'], FeePayment::pluck('paid_amount')->all()));
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'fee_paid');   // the receipt SMS as at the counter

        // the event off: the daily job marks overdue but sends and marks no reminder
        $i->forceFill(['settings' => array_replace($i->settings ?? [], ['sms_events' => ['fee_due_reminder' => 'off']])])->save();
        $this->travelTo('2026-12-13 09:00:00');
        $this->artisan('installments:daily')->assertSuccessful();
        Tenancy::as($i, fn () => $this->assertNull(FeeInstallment::find($items[1]['id'])->reminded_before_at));
        Queue::assertNotPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'fee_due_reminder');

        // on (auto): 2 days before the second -> one reminder; the next day nothing more
        $i->forceFill(['settings' => array_replace($i->settings ?? [], ['sms_events' => ['fee_due_reminder' => 'auto']])])->save();
        $this->artisan('installments:daily')->assertSuccessful();
        $this->travelTo('2026-12-14 09:00:00');
        $this->artisan('installments:daily')->assertSuccessful();
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'fee_due_reminder' && str_contains($j->message, '15/12/2026'));
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'fee_due_reminder' && $j->phone === '01711333333', 1);

        // missed: overdue on the 16th, one overdue reminder, never again; the overdue list shows it
        $this->travelTo('2026-12-16 09:00:00');
        $this->artisan('installments:daily')->assertSuccessful();
        $this->travelTo('2026-12-17 09:00:00');
        $this->artisan('installments:daily')->assertSuccessful();
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'fee_due_reminder', 2);
        $over = $this->api('GET', $h, 'fees/installments/overdue', $acct)->assertOk()->json('data');
        $this->assertSame([[$items[1]['id'], 'overdue', '300.00']], array_map(fn ($o) => [$o['id'], $o['status'], $o['amount']], $over));
        $this->assertSame('ভর্তি ফি', $over[0]['category']);

        // an overdue installment can still be paid; then it leaves the list
        $this->api('POST', $h, "fees/installments/{$items[1]['id']}/pay", $acct)->assertCreated();
        $this->assertSame([], $this->api('GET', $h, 'fees/installments/overdue', $acct)->json('data'));
        $this->api('GET', $h, 'fees/installments/overdue', $this->makeUser($i, 'teacher'))->assertForbidden();
    }
}
