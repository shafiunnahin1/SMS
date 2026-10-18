<?php

namespace Tests\Feature\Tenancy;

use App\Exceptions\TenantNotBoundException;
use App\Models\Program;
use App\Models\Student;
use App\Models\User;
use App\Support\Tenancy;
use App\Traits\BelongsToInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantFailClosedTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<class-string> every model that uses BelongsToInstitution */
    private function tenantModels(): array
    {
        $models = [];
        foreach (glob(app_path('Models/*.php')) as $file) {
            $class = 'App\\Models\\' . basename($file, '.php');
            if (in_array(BelongsToInstitution::class, class_uses_recursive($class), true)) $models[] = $class;
        }
        $this->assertGreaterThan(20, count($models), 'model discovery found too few tenant models');
        return $models;
    }

    public function test_every_tenant_model_refuses_get_count_and_create_without_a_tenant(): void
    {
        foreach ($this->tenantModels() as $model) {
            foreach (['get' => fn () => $model::query()->get(), 'count' => fn () => $model::count(), 'create' => fn () => $model::create([])] as $op => $call) {
                try {
                    $call();
                    $this->fail("{$model}::{$op}() ran without a bound tenant");
                } catch (TenantNotBoundException) {
                    $this->addToAssertionCount(1);
                }
            }
        }
    }

    public function test_without_tenancy_reads_inside_but_not_outside(): void
    {
        $this->assertSame(0, Tenancy::withoutTenancy(fn () => Student::count()));

        $this->expectException(TenantNotBoundException::class);
        Student::count();
    }

    public function test_create_inside_without_tenancy_needs_an_explicit_institution_id(): void
    {
        $alpha = $this->makeInstitution('alpha');

        $created = Tenancy::withoutTenancy(fn () => Program::create(['institution_id' => $alpha->id, 'name' => 'Class 1']));
        $this->assertSame($alpha->id, $created->institution_id);

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('set institution_id explicitly');
        Tenancy::withoutTenancy(fn () => Program::create(['name' => 'Class 2']));
    }

    public function test_a_bound_tenant_scopes_reads_and_fills_institution_id(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');
        $this->asTenant($beta, fn () => Program::create(['name' => 'Beta course']));

        $this->bindTenant($alpha);
        $program = Program::create(['name' => 'Alpha class']);

        $this->assertSame($alpha->id, $program->institution_id);
        $this->assertSame(['Alpha class'], Program::pluck('name')->all());
    }

    public function test_a_write_for_another_institution_is_blocked(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');
        $this->bindTenant($alpha);

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('Cross-tenant write blocked');
        Program::create(['institution_id' => $beta->id, 'name' => 'Sneaky']);
    }

    public function test_institution_id_is_immutable(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');
        $this->bindTenant($alpha);
        $program = Program::create(['name' => 'Class 1']);

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('immutable');
        $program->update(['institution_id' => $beta->id]);
    }

    public function test_tenancy_as_restores_the_previous_state_even_on_an_exception(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');

        try {
            Tenancy::as($alpha, function () { throw new \RuntimeException('boom'); });
        } catch (\RuntimeException) {
        }
        $this->assertNull(Tenancy::current());

        Tenancy::as($alpha, function () use ($alpha, $beta) {
            Tenancy::as($beta, fn () => $this->assertSame($beta->id, Tenancy::current()->id));
            $this->assertSame($alpha->id, Tenancy::current()->id);
        });
        $this->assertNull(Tenancy::current());
    }

    public function test_users_are_read_only_through_in_tenant_or_platform(): void
    {
        $alpha = $this->makeInstitution('alpha');
        $beta = $this->makeInstitution('beta');
        $this->makeUser($alpha, 'admin');
        $this->makeUser($beta, 'admin');
        $super = $this->makeUser(null, 'super_admin');

        $this->assertSame([$super->id], User::platform()->pluck('id')->all());
        $this->assertSame([$alpha->id], $this->asTenant($alpha, fn () => User::inTenant()->pluck('institution_id')->all()));

        $this->expectException(TenantNotBoundException::class);
        User::inTenant()->count();
    }
}
