<?php

namespace Tests\Feature\Services;

use App\Exceptions\TenantNotBoundException;
use App\Models\{Batch, FeeCategory, Program, Student};
use App\Support\TenantBulk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "TenantBulkGuardTest": a row for another institution throws LogicException and NOTHING is written;
// no bound tenant -> TenantNotBoundException
class TenantBulkGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_foreign_row_aborts_the_whole_insert(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');
        $this->bindTenant($alpha);

        try {
            TenantBulk::insert(FeeCategory::class, [
                ['institution_id' => $alpha->id, 'name' => 'ok', 'amount' => 1, 'frequency' => 'once'],
                ['institution_id' => $beta->id, 'name' => 'sneaky', 'amount' => 1, 'frequency' => 'once'],
            ]);
            $this->fail('expected a cross-tenant LogicException');
        } catch (\LogicException $e) {
            $this->assertStringContainsString('Cross-tenant bulk write blocked', $e->getMessage());
        }
        $this->assertSame(0, $this->asTenant($alpha, fn () => FeeCategory::count()));
        $this->assertSame(0, $this->asTenant($beta, fn () => FeeCategory::count()));
    }

    public function test_a_row_without_institution_id_is_refused(): void
    {
        $this->bindTenant($this->makeInstitution('alpha'));
        $this->expectException(\LogicException::class);
        TenantBulk::insert(FeeCategory::class, [['name' => 'x', 'amount' => 1, 'frequency' => 'once']]);
    }

    public function test_upsert_checks_every_row_too(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');
        $this->bindTenant($alpha);
        $p = Program::create(['name' => 'P']);
        $b = Batch::create(['program_id' => $p->id, 'name' => 'A']);
        $s = Student::create(['student_id' => 'S1', 'guardian_phone' => '01700000000']);
        $row = ['student_id' => $s->id, 'batch_id' => $b->id, 'program_id' => $p->id, 'date' => '2026-10-01', 'status' => 'present'];

        $this->assertSame(1, TenantBulk::upsert(\App\Models\Attendance::class, [$row + ['institution_id' => $alpha->id]], ['institution_id', 'student_id', 'batch_id', 'date'], ['status']));
        $this->expectException(\LogicException::class);
        TenantBulk::upsert(\App\Models\Attendance::class, [$row + ['institution_id' => $beta->id]], ['institution_id', 'student_id', 'batch_id', 'date'], ['status']);
    }

    public function test_without_a_tenant_nothing_is_written(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $this->expectException(TenantNotBoundException::class);
        TenantBulk::insert(FeeCategory::class, [['institution_id' => $alpha->id, 'name' => 'x', 'amount' => 1, 'frequency' => 'once']]);
    }
}
