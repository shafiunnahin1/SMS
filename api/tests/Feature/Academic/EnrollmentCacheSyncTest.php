<?php

namespace Tests\Feature\Academic;

use App\Models\{Batch, Program, Student};
use App\Services\EnrollmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "EnrollmentCacheSyncTest": after enroll / end / transfer, students.program_id, batch_id, roll_no
// equal the primary active enrollment; NULL when no enrollment is active
class EnrollmentCacheSyncTest extends TestCase
{
    use RefreshDatabase;

    private EnrollmentService $svc;
    private array $batches;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = app(EnrollmentService::class);
        $this->bindTenant($this->makeInstitution('coach', 'coaching'));
        $p1 = Program::create(['name' => 'Physics']);
        $p2 = Program::create(['name' => 'Math']);
        $this->batches = [
            Batch::create(['program_id' => $p1->id, 'name' => 'P-A']),
            Batch::create(['program_id' => $p2->id, 'name' => 'M-A']),
            Batch::create(['program_id' => $p2->id, 'name' => 'M-B']),
        ];
    }

    private function assertCacheMatchesPrimary(Student $s): void
    {
        $s->refresh();
        $primary = $s->primaryEnrollment()->first();
        $this->assertSame([$primary?->program_id, $primary?->batch_id, $primary?->roll_no], [$s->program_id, $s->batch_id, $s->roll_no]);
        $this->assertLessThanOrEqual(1, $s->activeEnrollments()->where('is_primary', true)->count());
    }

    public function test_the_cache_follows_every_enroll_end_and_transfer(): void
    {
        [$pa, $ma, $mb] = $this->batches;
        $s = Student::create(['student_id' => 'S1', 'guardian_phone' => '01700000000']);
        $this->assertNull($s->batch_id);

        $first = $this->svc->enroll($s, $pa, ['roll_no' => 5]);
        $this->assertCacheMatchesPrimary($s);
        $this->assertSame($pa->id, $s->batch_id);

        $second = $this->svc->enroll($s, $ma, ['roll_no' => 9]);
        $this->assertCacheMatchesPrimary($s);
        $this->assertSame($pa->id, $s->batch_id, 'a second enrollment is not primary');

        $this->svc->end($first, 'completed');                // the primary ends: the remaining one becomes primary
        $this->assertCacheMatchesPrimary($s);
        $this->assertSame([$ma->id, 9], [$s->batch_id, $s->roll_no]);

        $moved = $this->svc->transfer($second, $mb, ['roll_no' => 2]);
        $this->assertCacheMatchesPrimary($s);
        $this->assertSame([$mb->id, 2], [$s->batch_id, $s->roll_no]);

        $this->svc->end($moved, 'dropped');
        $s->refresh();
        $this->assertSame([null, null, null], [$s->program_id, $s->batch_id, $s->roll_no]);
    }

    public function test_ending_a_non_primary_enrollment_leaves_the_cache_alone(): void
    {
        [$pa, $ma] = $this->batches;
        $s = Student::create(['student_id' => 'S2', 'guardian_phone' => '01700000000']);
        $this->svc->enroll($s, $pa);
        $extra = $this->svc->enroll($s, $ma);

        $this->svc->end($extra, 'dropped');

        $this->assertCacheMatchesPrimary($s);
        $this->assertSame($pa->id, $s->batch_id);
    }

    public function test_the_cache_columns_cannot_be_mass_assigned(): void
    {
        [$pa] = $this->batches;
        $s = Student::create(['student_id' => 'S3', 'guardian_phone' => '01700000000', 'batch_id' => $pa->id, 'program_id' => $pa->program_id, 'roll_no' => 4]);

        $this->assertSame([null, null, null], [$s->fresh()->batch_id, $s->fresh()->program_id, $s->fresh()->roll_no]);
    }
}
