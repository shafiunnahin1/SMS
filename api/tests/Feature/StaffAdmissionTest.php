<?php

namespace Tests\Feature;

use App\Models\{Batch, Consent, Institution, Program, Student, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D169 STW.3: staff admit a student only with staff.student.store in the SELECTED department (D91, checked before validation);
// the admission records no guardian consent (it stays not recorded, the head records it later) and a fee override is refused
// (only the head / admin may set one); the key held only in another department, no header or another tenant all fail.
class StaffAdmissionTest extends TestCase
{
    use RefreshDatabase;

    private function setUpStaff(): array
    {
        $i = $this->makeInstitution('stwadmit', 'school');
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $admin = $this->makeUser($i, 'admin');
        $staff = $this->makeUser($i, 'institution_staff');
        [$office, $accounts, $batch] = Tenancy::as($i, function () use ($admin, $staff) {
            $s = app(DepartmentService::class);
            $office = $s->create($admin, ['name' => 'Office']);
            $m = $s->addMember($admin, $office->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $office->id, ['code' => 'ADM', 'name' => 'Admission', 'permission_keys' => ['staff.student.store', 'staff.batch.index']]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
            $accounts = $s->create($admin, ['name' => 'Accounts']);
            $s->addMember($admin, $accounts->id, ['user_id' => $staff->id]);
            $p = Program::create(['name' => 'Class 8']);
            return [$office, $accounts, Batch::create(['program_id' => $p->id, 'name' => 'A', 'status' => 'running'])];
        });
        return [$i, $admin, $staff, $office, $accounts, $batch];
    }

    private function asStaff(Institution $i, User $staff, $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer ' . $staff->createToken('stw3')->plainTextToken];
        if ($department !== null) $headers['X-Department-Id'] = (string) $department;
        return $this->json($method, 'http://' . $this->hostOf($i) . '/api/v1/' . $path, $body, $headers);
    }

    public function test_staff_admit_directly_without_consent_or_fee_override(): void
    {
        [$i, , $staff, $office, , $batch] = $this->setUpStaff();
        $body = ['name' => 'Rahim', 'guardian_phone' => '01711000001', 'batch_id' => $batch->id, 'roll_no' => 7, 'consent_data' => true, 'consent_sms' => true];
        $created = $this->asStaff($i, $staff, $office->id, 'POST', 'students', $body)->assertCreated()->json('data');
        $this->assertSame('Rahim', $created['name']);
        $this->assertStringNotContainsString('fee_override', json_encode($created));
        Tenancy::as($i, function () use ($created) {
            $student = Student::findOrFail($created['id']);
            $this->assertSame(0, Consent::where('student_id', $student->id)->count(), 'D169 (2): consent stays not recorded');
            $this->assertSame('A', $student->batch?->name);
        });

        // a fee override is refused and creates nothing
        $count = Tenancy::as($i, fn () => Student::count());
        $this->asStaff($i, $staff, $office->id, 'POST', 'students', ['name' => 'Karim', 'guardian_phone' => '01711000002', 'batch_id' => $batch->id, 'fee_override' => '500.00'])->assertForbidden();
        $this->assertSame($count, Tenancy::as($i, fn () => Student::count()));
    }

    public function test_the_key_must_be_in_the_selected_department_and_is_checked_before_validation(): void
    {
        [$i, , $staff, $office, $accounts] = $this->setUpStaff();
        // an empty body: without the key the answer is 403, never a 422 that would reveal the form's rules
        $this->asStaff($i, $staff, $accounts->id, 'POST', 'students', [])->assertForbidden();
        $this->asStaff($i, $staff, null, 'POST', 'students', [])->assertForbidden();
        $this->asStaff($i, $staff, $office->id, 'POST', 'students', [])->assertStatus(422);   // with the key, normal validation
        $other = $this->makeInstitution('stwadmit2', 'school');
        $foreignDept = Tenancy::as($other, fn () => app(DepartmentService::class)->create($this->makeUser($other, 'admin'), ['name' => 'Foreign']));
        $this->asStaff($i, $staff, $foreignDept->id, 'POST', 'students', [])->assertForbidden();
    }

    public function test_the_head_still_records_consent_and_a_fee_override(): void
    {
        [$i, $admin, , , , $batch] = $this->setUpStaff();
        $created = $this->api('POST', $this->hostOf($i), 'students', $admin, ['name' => 'Head', 'guardian_phone' => '01711000003', 'batch_id' => $batch->id,
            'fee_override' => '500.00', 'consent_data' => true])->assertCreated()->json('data');
        $this->assertSame('500.00', $created['enrollments'][0]['fee_override']);
        $this->assertSame(1, Tenancy::as($i, fn () => Consent::where('student_id', $created['id'])->count()));
    }
}
