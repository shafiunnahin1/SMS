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
        foreach (['one' => '2601010001', 'two' => '2601010002'] as $slug => $sid) {   // D160: 10-digit IDs, unique across institutions
            $i = $this->makeInstitution("uniq{$slug}", 'school');
            $admin = $this->makeUser($i, 'admin');
            $host = $this->hostOf($i);
            $batch = Tenancy::as($i, function () {
                FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
                return Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'A']);
            });
            if ($slug === 'two') $this->api('POST', $host, 'students', $admin, ['name' => 'Z', 'student_id' => '2601010001', 'guardian_phone' => '01711112224'])
                ->assertStatus(422)->assertJsonValidationErrors('student_id');   // D160: another institution's ID is taken everywhere
            $this->api('POST', $host, 'students', $admin, ['name' => 'X', 'student_id' => $sid, 'guardian_phone' => '01711112222', 'batch_id' => $batch->id])->assertCreated();
            $this->api('POST', $host, 'teachers', $admin, ['name' => 'T', 'phone' => '01722223333', 'employee_id' => 'E-1'])->assertCreated();
            $receipt = Tenancy::as($i, function () use ($sid) {
                $fees = app(FeeService::class);
                $s = Student::where('student_id', $sid)->first();
                return $fees->collect($s, [['key' => $fees->dueLines($s)->first()['key']]])->first()->receipt_no;
            });
            $made[] = $receipt;

            $this->api('POST', $host, 'students', $admin, ['name' => 'Y', 'student_id' => $sid, 'guardian_phone' => '01711112223'])
                ->assertStatus(422)->assertJsonValidationErrors('student_id');
            $this->api('POST', $host, 'students', $admin, ['name' => 'W', 'student_id' => 'S-001', 'guardian_phone' => '01711112225'])
                ->assertStatus(422)->assertJsonValidationErrors('student_id');   // D160: letters are refused
            $this->api('POST', $host, 'teachers', $admin, ['name' => 'U', 'phone' => '01722223334', 'employee_id' => 'E-1'])
                ->assertStatus(422)->assertJsonValidationErrors('employee_id');
        }
        $this->assertSame($made[0], $made[1], 'each institution numbers its own receipts from 1');
    }
}
