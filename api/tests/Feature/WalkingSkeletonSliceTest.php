<?php

namespace Tests\Feature;

use App\Models\{Batch, FeeCategory, FeePayment, Institution, ParentStudent, Program, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// Spike S4 + S6 (docs/spike/walking-skeleton.md): admission -> enrollment -> dues -> cash collection (several lines, one receipt)
// -> receipt PDF -> the parent sees their own child's dues and receipts (another child is 403), on school, coaching and private_batch.
class WalkingSkeletonSliceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();   // the receipt SMS is a queued job; SMS itself is covered by SharedServicesTest
    }

    /** @return array{0: Institution, 1: User, 2: Batch, 3: Batch} */
    private function tenant(string $slug, string $type, array $settings = []): array
    {
        $inst = $this->makeInstitution($slug, $type);
        if ($settings) $inst->forceFill(['settings' => $settings])->save();
        $admin = $this->makeUser($inst, 'admin');
        [$a, $b] = Tenancy::as($inst, function () {
            FeeCategory::create(['name' => 'মাসিক বেতন', 'amount' => 500, 'frequency' => 'monthly']);
            $p = Program::create(['name' => 'Class 9']);
            return [Batch::create(['program_id' => $p->id, 'name' => 'A', 'monthly_fee' => 1200]), Batch::create(['program_id' => $p->id, 'name' => 'B'])];
        });
        return [$inst, $admin, $a, $b];
    }

    private function admit(Institution $inst, User $admin, Batch $batch, string $name, string $phone = '01711111111'): array
    {
        return $this->api('POST', $this->hostOf($inst), 'students', $admin, ['name' => $name, 'guardian_phone' => $phone, 'father_name' => "বাবা {$name}", 'batch_id' => $batch->id])
            ->assertCreated()->json('data');
    }

    public function test_school_admission_generates_the_id_creates_the_parent_and_refuses_a_second_batch(): void
    {
        [$inst, $admin, $a, $b] = $this->tenant('dhanmondi', 'school');
        $host = $this->hostOf($inst);

        $s = $this->admit($inst, $admin, $a, 'রাহিম');
        $this->assertSame('DHA-' . date('Y') . '-0001', $s['student_id']);
        $this->assertSame(['A', 'রাহিম'], [$s['batch']['name'], $s['name']]);
        $this->assertSame('DHA-' . date('Y') . '-0002', $this->admit($inst, $admin, $a, 'করিম', '01711111111')['student_id']);
        $this->assertSame(1, Tenancy::as($inst, fn () => User::inTenant()->where('role', 'parent')->count()), 'siblings share one parent account');
        $this->assertSame(2, Tenancy::as($inst, fn () => ParentStudent::count()));

        $this->api('POST', $host, 'enrollments', $admin, ['student_id' => $s['id'], 'batch_id' => $b->id])->assertStatus(422);
        $this->api('GET', $host, 'students?q=রাহিম', $admin)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.student_id', $s['student_id']);
        $this->api('POST', $host, 'students', $admin, ['name' => 'x', 'guardian_phone' => '123'])->assertStatus(422);
    }

    public function test_coaching_student_in_two_batches_pays_two_dues_on_one_receipt_and_gets_a_pdf(): void
    {
        [$inst, $admin, $a, $b] = $this->tenant('alokito', 'coaching');
        $host = $this->hostOf($inst);
        $s = $this->admit($inst, $admin, $a, 'সুমি');
        $this->api('POST', $host, 'enrollments', $admin, ['student_id' => $s['id'], 'batch_id' => $b->id, 'fee_override' => 800])->assertCreated()->assertJsonPath('data.is_primary', false);

        $dues = $this->api('GET', $host, "fees/dues?student_id={$s['id']}", $admin)->assertOk()->json('data');
        $this->assertSame(['1200.00', '800.00'], array_column($dues['lines'], 'amount'), 'batch monthly_fee, then the enrollment override');
        $this->assertSame('2000.00', $dues['total']);

        $accountant = $this->makeUser($inst, 'accountant');
        $receipt = $this->api('POST', $host, 'fees/collect', $accountant, ['student_id' => $s['id'], 'payment_method' => 'cash',
            'lines' => [['key' => $dues['lines'][0]['key']], ['key' => $dues['lines'][1]['key'], 'paid_amount' => 500]]])
            ->assertCreated()->json('data');
        $this->assertSame([1, 2], array_column($receipt['lines'], 'line_no'));
        $this->assertSame(['paid', 'partial'], array_column($receipt['lines'], 'status'));
        $this->assertSame('1700.00', $receipt['total']);
        $this->assertSame(1, Tenancy::as($inst, fn () => FeePayment::distinct()->count('receipt_no')), 'one receipt for both batches');
        $this->assertSame('300.00', $this->api('GET', $host, "fees/dues?student_id={$s['id']}", $admin)->json('data.total'));

        $pdf = $this->api('GET', $host, "fees/receipt/{$receipt['id']}", $admin)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        $this->api('GET', $host, "fees/receipt/{$receipt['id']}?format=json", $accountant)->assertJsonPath('data.receipt_no', $receipt['receipt_no']);

        $this->api('POST', $host, 'fees/collect', $accountant, ['student_id' => $s['id'], 'payment_method' => 'cash', 'lines' => [['key' => $dues['lines'][0]['key']]]])
            ->assertStatus(422);   // already paid: the server's dues decide, not the client
        $this->api('GET', $host, "fees/dues?student_id={$s['id']}", $this->makeUser($inst, 'teacher'))->assertForbidden();
    }

    public function test_a_parent_sees_only_their_own_childs_dues_and_receipts(): void
    {
        [$inst, $admin, $a] = $this->tenant('rahim-sir', 'private_batch', ['student_portal' => true]);
        $host = $this->hostOf($inst);
        $mine = $this->admit($inst, $admin, $a, 'নাদিয়া', '01722222222');
        $other = $this->admit($inst, $admin, $a, 'তানিয়া', '01733333333');
        $dues = $this->api('GET', $host, "fees/dues?student_id={$mine['id']}", $admin)->json('data.lines');
        $this->api('POST', $host, 'fees/collect', $admin, ['student_id' => $mine['id'], 'payment_method' => 'cash', 'lines' => [['key' => $dues[0]['key']]]])->assertCreated();
        $parent = Tenancy::as($inst, fn () => User::inTenant()->where('role', 'parent')->where('phone', '01722222222')->firstOrFail());
        $this->api('GET', $host, 'parent/children', $parent)->assertForbidden()->assertJsonPath('error', 'must_change_password');   // random first password: set via reset
        $parent->forceFill(['must_change_password' => false])->save();

        $this->api('GET', $host, 'parent/children', $parent)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'নাদিয়া');
        $this->api('GET', $host, "parent/fees?student_id={$mine['id']}", $parent)->assertOk()->assertJsonPath('data.total', '0.00');
        $this->api('GET', $host, "fees/payments/student/{$mine['id']}", $parent)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.total', '1200.00');

        $this->api('GET', $host, "parent/fees?student_id={$other['id']}", $parent)->assertForbidden();
        $this->api('GET', $host, "fees/payments/student/{$other['id']}", $parent)->assertForbidden();
        $this->api('GET', $host, "fees/receipt/1", $parent)->assertForbidden();
        $this->api('GET', $host, 'students', $parent)->assertForbidden();
    }

    public function test_a_private_batch_without_the_portal_creates_no_parent_account(): void
    {
        [$inst, $admin, $a] = $this->tenant('tutor', 'private_batch');
        $this->admit($inst, $admin, $a, 'রিয়া');
        $this->assertSame(0, Tenancy::as($inst, fn () => User::inTenant()->where('role', 'parent')->count()));
    }
}
