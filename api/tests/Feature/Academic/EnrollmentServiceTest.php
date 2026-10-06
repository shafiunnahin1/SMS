<?php

namespace Tests\Feature\Academic;

use App\Models\{Batch, Enrollment, Institution, Program, Student};
use App\Services\EnrollmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

// docs/TESTING.md "EnrollmentServiceTest" + docs/modules/academic-structure.md "The Five Rules"
class EnrollmentServiceTest extends TestCase
{
    use RefreshDatabase;

    private EnrollmentService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = app(EnrollmentService::class);
    }

    private function setupTenant(string $type, int $capacity = 40): array
    {
        $i = $this->makeInstitution($type, $type);
        $this->bindTenant($i);
        $p = Program::create(['name' => 'P1']);
        return [$i, Batch::create(['program_id' => $p->id, 'name' => 'B1', 'max_capacity' => $capacity]), Batch::create(['program_id' => $p->id, 'name' => 'B2', 'max_capacity' => $capacity])];
    }

    private function student(string $code): Student
    {
        return Student::create(['student_id' => $code, 'guardian_phone' => '01700000000']);
    }

    private function assertRejected(callable $fn, string $field = 'batch_id'): void
    {
        try { $fn(); $this->fail('expected a validation error'); }
        catch (ValidationException $e) { $this->assertArrayHasKey($field, $e->errors()); }
    }

    public function test_a_school_student_cannot_hold_a_second_active_enrollment(): void
    {
        [, $a, $b] = $this->setupTenant('school');
        $s = $this->student('S1');
        $this->svc->enroll($s, $a);

        $this->assertRejected(fn () => $this->svc->enroll($s, $b));
        $this->assertSame(1, Enrollment::count());
    }

    public function test_college_follows_the_school_rule(): void
    {
        [, $a, $b] = $this->setupTenant('college');
        $s = $this->student('C1');
        $this->svc->enroll($s, $a);
        $this->assertRejected(fn () => $this->svc->enroll($s, $b));
    }

    public function test_coaching_and_private_batch_allow_several_with_exactly_one_primary(): void
    {
        foreach (['coaching', 'private_batch'] as $type) {
            [, $a, $b] = $this->setupTenant($type);
            $s = $this->student("{$type}-1");
            $first = $this->svc->enroll($s, $a);
            $second = $this->svc->enroll($s, $b);

            $this->assertTrue($first->is_primary);
            $this->assertFalse($second->is_primary);
            $this->assertSame(1, $s->activeEnrollments()->where('is_primary', true)->count());
        }
    }

    public function test_the_same_batch_twice_is_rejected(): void
    {
        [, $a] = $this->setupTenant('coaching');
        $s = $this->student('X1');
        $this->svc->enroll($s, $a);
        $this->assertRejected(fn () => $this->svc->enroll($s, $a));
    }

    public function test_a_full_batch_is_rejected_and_ended_enrollments_free_a_seat(): void
    {
        [, $a] = $this->setupTenant('coaching', 2);
        $e1 = $this->svc->enroll($this->student('A1'), $a);
        $this->svc->enroll($this->student('A2'), $a);

        $this->assertRejected(fn () => $this->svc->enroll($this->student('A3'), $a));
        $this->svc->end($e1, 'dropped');
        $this->svc->enroll($this->student('A4'), $a);
        $this->assertSame(2, Enrollment::where('batch_id', $a->id)->where('status', 'active')->count());
    }

    public function test_roll_numbers_default_to_the_next_seat_and_can_be_given(): void
    {
        [, $a] = $this->setupTenant('school');
        $this->assertSame(1, $this->svc->enroll($this->student('R1'), $a)->roll_no);
        $this->assertSame(2, $this->svc->enroll($this->student('R2'), $a)->roll_no);
        $this->assertSame(17, $this->svc->enroll($this->student('R3'), $a, ['roll_no' => 17])->roll_no);
    }

    public function test_ending_keeps_the_row_as_history_and_rejects_unknown_statuses(): void
    {
        [, $a] = $this->setupTenant('school');
        $e = $this->svc->enroll($this->student('H1'), $a);

        $this->svc->end($e, 'completed', 'year over');
        $e->refresh();
        $this->assertSame(['completed', false, 'year over'], [$e->status, $e->is_primary, $e->note]);
        $this->assertNotNull($e->left_at);
        $this->assertSame(1, Enrollment::count());
        $this->assertRejected(fn () => $this->svc->end($e, 'deleted'), 'status');
    }

    public function test_after_ending_a_school_student_can_be_enrolled_again_and_transfer_moves_with_the_fee_override(): void
    {
        [, $a, $b] = $this->setupTenant('school');
        $s = $this->student('T1');
        $e = $this->svc->enroll($s, $a, ['fee_override' => 750]);

        $moved = $this->svc->transfer($e, $b);

        $this->assertSame('transferred', $e->fresh()->status);
        $this->assertSame([$b->id, '750.00', true], [$moved->batch_id, (string) $moved->fee_override, $moved->is_primary]);
    }

    public function test_enrollments_stay_inside_their_institution(): void
    {
        [$alpha, $a] = $this->setupTenant('coaching');
        $this->svc->enroll($this->student('I1'), $a);
        $beta = $this->makeInstitution('beta', 'coaching');

        $this->assertSame(0, $this->asTenant($beta, fn () => Enrollment::count()));
        $this->assertSame($alpha->id, Enrollment::first()->institution_id);
    }
}
