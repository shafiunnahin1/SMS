<?php

namespace Tests\Feature;

use App\Models\{Batch, FeeCategory, FeePayment, Institution, Program, Student, User};
use App\Services\{DepartmentService, EnrollmentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D169 STW.4: fee collection by staff with the keys of the SELECTED department (D91): find the student (staff.student.index), the
// server's dues (staff.fee.dues), collect (staff.fee.collect), the receipt (staff.fee.receipt). Amounts are always the server's;
// the key held only in another department, no header, refunds and fee setup stay closed.
class StaffFeeCollectTest extends TestCase
{
    use RefreshDatabase;

    private function asStaff(Institution $i, User $staff, $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $staff->createToken('stw4')->plainTextToken];
        if ($department !== null) $headers['X-Department-Id'] = (string) $department;
        return $this->json($method, 'http://' . $this->hostOf($i) . '/api/v1/' . $path, $body, $headers);
    }

    public function test_staff_collect_fees_with_the_selected_departments_keys(): void
    {
        Queue::fake();
        $this->travelTo('2026-10-20 10:00:00');
        $i = $this->makeInstitution('stwfees', 'coaching');
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $admin = $this->makeUser($i, 'admin');
        $staff = $this->makeUser($i, 'institution_staff');
        [$cash, $office, $student] = Tenancy::as($i, function () use ($admin, $staff) {
            $s = app(DepartmentService::class);
            $cash = $s->create($admin, ['name' => 'Cash counter']);
            $m = $s->addMember($admin, $cash->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $cash->id, ['code' => 'FEE', 'name' => 'Fees', 'permission_keys' => ['staff.student.index', 'staff.fee.dues', 'staff.fee.collect', 'staff.fee.receipt']]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
            $office = $s->create($admin, ['name' => 'Office']);
            $s->addMember($admin, $office->id, ['user_id' => $staff->id]);
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 1000, 'frequency' => 'monthly']);
            $p = Program::create(['name' => 'HSC']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'Physics', 'monthly_fee' => 1000]);
            $st = Student::create(['student_id' => 'C-1', 'guardian_phone' => '01711111111']);
            app(EnrollmentService::class)->enroll($st, $b, ['enrolled_at' => '2026-10-01']);
            return [$cash, $office, $st];
        });

        $found = $this->asStaff($i, $staff, $cash->id, 'GET', 'students?q=C-1')->assertOk()->json('data');
        $this->assertSame([$student->id], array_column($found, 'id'));
        $dues = $this->asStaff($i, $staff, $cash->id, 'GET', "fees/dues?student_id={$student->id}")->assertOk()->json('data');
        $this->assertSame('1000.00', $dues['total']);
        // the client names the dues only; a sent amount is never trusted
        $receipt = $this->asStaff($i, $staff, $cash->id, 'POST', 'fees/collect', ['student_id' => $student->id, 'payment_method' => 'cash',
            'lines' => array_map(fn ($l) => ['key' => $l['key'], 'amount' => '1.00'], $dues['lines'])])->assertCreated()->json('data');
        $this->assertSame('1000.00', $receipt['total']);
        $this->assertSame(['1000.00'], Tenancy::as($i, fn () => FeePayment::where('receipt_no', $receipt['receipt_no'])->pluck('amount')->map(fn ($a) => (string) $a)->all()), 'the stored amount is the server\'s');
        $this->asStaff($i, $staff, $cash->id, 'GET', "fees/receipt/{$receipt['id']}")->assertOk();

        // another department (a member, without the keys), no header
        $this->asStaff($i, $staff, $office->id, 'GET', "fees/dues?student_id={$student->id}")->assertForbidden();
        $this->asStaff($i, $staff, $office->id, 'POST', 'fees/collect', ['student_id' => $student->id, 'payment_method' => 'cash', 'lines' => []])->assertForbidden();
        $this->asStaff($i, $staff, null, 'GET', "fees/dues?student_id={$student->id}")->assertForbidden();
        // refunds and fee setup stay closed even with the collection keys
        $this->asStaff($i, $staff, $cash->id, 'GET', 'fee-refunds')->assertForbidden();
        $this->assertContains($this->asStaff($i, $staff, $cash->id, 'POST', 'fee-categories', ['name' => 'x', 'amount' => 1, 'frequency' => 'monthly'])->status(), [403, 404]);
    }
}
