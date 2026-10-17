<?php

namespace Tests\Feature;

use App\Models\{Batch, FeeCategory, Program, Student, Teacher};
use App\Services\{FeeService, StudentService, TeacherService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// docs/TESTING.md "PerInstitutionUniqueTest": the same student_id, receipt_no and employee_id can exist in two institutions; inside one
// institution a duplicate is a 422.
class PerInstitutionUniqueTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_same_codes_live_in_two_institutions_but_not_twice_in_one(): void
    {
        Queue::fake();
        $made = [];
        foreach (['one', 'two'] as $slug) {
            $i = $this->makeInstitution("uniq{$slug}", 'school');
            $admin = $this->makeUser($i, 'admin');
            $host = $this->hostOf($i);
            $batch = Tenancy::as($i, function () {
                FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
                return Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']);
            });
            $this->api('POST', $host, 'students', $admin, ['name' => 'X', 'student_id' => 'S-001', 'guardian_phone' => '01711112222', 'batch_id' => $batch->id])->assertCreated();
            $this->api('POST', $host, 'teachers', $admin, ['name' => 'T', 'phone' => '01722223333', 'employee_id' => 'E-1'])->assertCreated();
            $receipt = Tenancy::as($i, function () {
                $fees = app(FeeService::class);
                $s = Student::where('student_id', 'S-001')->first();
                return $fees->collect($s, [['key' => $fees->dueLines($s)->first()['key']]])->first()->receipt_no;
            });
            $made[] = $receipt;

            $this->api('POST', $host, 'students', $admin, ['name' => 'Y', 'student_id' => 'S-001', 'guardian_phone' => '01711112223'])
                ->assertStatus(422)->assertJsonValidationErrors('student_id');
            $this->api('POST', $host, 'teachers', $admin, ['name' => 'U', 'phone' => '01722223334', 'employee_id' => 'E-1'])
                ->assertStatus(422)->assertJsonValidationErrors('employee_id');
        }
        $this->assertSame($made[0], $made[1], 'each institution numbers its own receipts from 1');
    }
}
