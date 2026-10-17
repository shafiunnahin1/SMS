<?php

namespace Tests\Feature\Tenancy;

use App\Services\Tenancy\TenantResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantResolverTest extends TestCase
{
    use RefreshDatabase;

    private TenantResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = app(TenantResolver::class);
    }

    public function test_a_platform_subdomain_resolves_to_its_institution(): void
    {
        $school = $this->makeInstitution('dhanmondi-school');

        $this->assertSame($school->id, $this->resolver->resolve('dhanmondi-school.schoolapp.com')?->id);
    }

    public function test_an_unknown_slug_resolves_to_nothing(): void
    {
        $this->assertNull($this->resolver->resolve('nobody.schoolapp.com'));
    }

    public function test_a_reserved_slug_never_resolves_even_if_an_institution_has_it(): void
    {
        foreach (['admin', 'www', 'api', 'demo'] as $slug) {
            $this->makeInstitution($slug);
            $this->assertNull($this->resolver->resolve("{$slug}.schoolapp.com"), "reserved slug {$slug} resolved");
        }
    }

    public function test_a_two_level_subdomain_and_the_bare_base_domain_do_not_resolve(): void
    {
        $this->makeInstitution('alpha');

        $this->assertNull($this->resolver->resolve('x.alpha.schoolapp.com'));
        $this->assertNull($this->resolver->resolve('schoolapp.com'));
        $this->assertNull($this->resolver->resolve('.schoolapp.com'));
    }

    public function test_a_foreign_host_does_not_resolve_in_release_1(): void
    {
        $this->makeInstitution('alpha');

        $this->assertNull($this->resolver->resolve('alpha.example.com'));
        $this->assertNull($this->resolver->resolve('portal.alpha.edu.bd'));
    }

    public function test_central_hosts_are_recognised_and_bind_no_tenant(): void
    {
        $this->assertTrue($this->resolver->isCentralHost('schoolapp.com'));
        $this->assertTrue($this->resolver->isCentralHost('admin.schoolapp.com'));
        $this->assertFalse($this->resolver->isCentralHost('alpha.schoolapp.com'));
        $this->assertNull($this->resolver->resolve('admin.schoolapp.com'));
    }
}
