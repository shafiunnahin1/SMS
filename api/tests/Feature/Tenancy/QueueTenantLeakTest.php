<?php

namespace Tests\Feature\Tenancy;

use App\Models\Program;
use App\Support\Tenancy;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\InteractsWithQueue;
use Tests\TestCase;

class QueueTenantLeakTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RecordTenantJob::$seen = [];
    }

    public function test_jobs_of_two_institutions_in_one_worker_each_see_only_their_own_data(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');
        $this->asTenant($alpha, fn () => Program::create(['name' => 'Alpha class']));
        $this->asTenant($beta, fn () => Program::create(['name' => 'Beta course']));

        RecordTenantJob::dispatch($alpha->id);
        $this->assertNull(Tenancy::current(), 'job A left its tenant bound');
        RecordTenantJob::dispatch($beta->id);
        $this->assertNull(Tenancy::current(), 'job B left its tenant bound');

        $this->assertSame([
            [$alpha->id, ['Alpha class']],
            [$beta->id, ['Beta course']],
        ], RecordTenantJob::$seen);
    }

    public function test_a_job_restores_the_tenant_that_was_bound_before_it(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');

        $this->asTenant($alpha, function () use ($alpha, $beta) {
            RecordTenantJob::dispatch($beta->id);
            $this->assertSame($alpha->id, Tenancy::current()->id);
        });
        $this->assertSame($beta->id, RecordTenantJob::$seen[0][0]);
    }

    public function test_a_failing_job_still_releases_its_tenant(): void
    {
        $alpha = $this->makeInstitution('alpha');

        try {
            FailingTenantJob::dispatch($alpha->id);
            $this->fail('the job should have thrown');
        } catch (\RuntimeException $e) {
            $this->assertSame('job failed', $e->getMessage());
        }
        $this->assertNull(Tenancy::current());
    }

    public function test_a_tenant_job_without_an_institution_id_cannot_run(): void
    {
        $this->expectException(\Error::class);
        $this->expectExceptionMessage('institutionId');
        UnboundTenantJob::dispatch();
    }
}

class RecordTenantJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public static array $seen = [];

    public function __construct(int $institutionId) { $this->institutionId = $institutionId; }

    public function handle(): void
    {
        self::$seen[] = [Tenancy::current()?->id, Program::pluck('name')->all()];
    }
}

class FailingTenantJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public function __construct(int $institutionId) { $this->institutionId = $institutionId; }

    public function handle(): void { throw new \RuntimeException('job failed'); }
}

class UnboundTenantJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public function handle(): void {}
}
