<?php

namespace Tests\Feature;

use App\Models\{AuditLog, Batch, FeeCategory, FeePayment, Institution, Program, Student, Subject, Teacher, User};
use App\Services\{FeeService, StudentService};
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RouteDef;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

// docs/TESTING.md "TenantIsolationTest": two tenants of each of the four types; no tenant-scoped endpoint ever returns another
// tenant's row. The framework discovers the routes itself, so every route added in later steps is checked without editing
// this file - except a route with an {id}, which must say below how to make a row of another tenant (the test fails until it does).
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private const TYPES = ['school', 'college', 'coaching', 'private_batch'];

    /** @var array<string, array{institution: Institution, admin: User}> keyed by slug (the slug doubles as a marker in every row) */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (self::TYPES as $type) {
            foreach (['a', 'b'] as $n) {
                $slug = 'iso' . str_replace('_', '', $type) . $n;
                $inst = $this->makeInstitution($slug, $type);
                $admin = $this->makeUser($inst, 'admin');
                $admin->forceFill(['name' => "admin {$slug}"])->save();
                Tenancy::as($inst, function () use ($admin, $slug) {
                    $admin->notify(new GeneralNotification('notice', "note {$slug}", 'notice'));
                    AuditLog::record('isolation.seed', $admin, ['marker' => $slug]);
                });
                $admin->createToken("seed {$slug}");
                $this->tenants[$slug] = ['institution' => $inst, 'admin' => $admin];
                $this->seedReceipt($this->tenants[$slug]);
            }
        }
    }

    /** How to make a row of $other that a route's {id} could point at. Every tenant route with a parameter must be listed. */
    private function foreignIds(): array
    {
        return [
            'PATCH api/v1/notifications/{id}/read'         => fn (array $other) => $other['admin']->notifications()->value('id'),
            'DELETE api/v1/auth/sessions/{id}'             => fn (array $other) => $other['admin']->tokens()->value('id'),
            'POST api/v1/admin/users/{id}/force-logout'    => fn (array $other) => $other['admin']->id,
            'POST api/v1/admin/users/{id}/unlock'          => fn (array $other) => $other['admin']->id,
            'GET api/v1/audit-logs/{id}'                   => fn (array $other) => Tenancy::as($other['institution'], fn () => AuditLog::value('id')),
            'GET api/v1/students/{id}'                     => fn (array $other) => $this->seedStudent($other),
            'GET api/v1/fees/payments/student/{id}'        => fn (array $other) => $this->seedStudent($other),
            'GET api/v1/fees/receipt/{id}'                 => fn (array $other) => $this->seedReceipt($other),
            'GET api/v1/programs/{id}'                     => fn (array $other) => $this->rowOf($other, Program::class),
            'PUT api/v1/programs/{id}'                     => fn (array $other) => $this->rowOf($other, Program::class),
            'DELETE api/v1/programs/{id}'                  => fn (array $other) => $this->rowOf($other, Program::class),
            'GET api/v1/batches/{id}'                      => fn (array $other) => $this->rowOf($other, Batch::class),
            'PUT api/v1/batches/{id}'                      => fn (array $other) => $this->rowOf($other, Batch::class),
            'DELETE api/v1/batches/{id}'                   => fn (array $other) => $this->rowOf($other, Batch::class),
            'GET api/v1/batches/{id}/students'             => fn (array $other) => $this->rowOf($other, Batch::class),
            'GET api/v1/subjects/{id}'                     => fn (array $other) => $this->seedSubject($other),
            'PUT api/v1/subjects/{id}'                     => fn (array $other) => $this->seedSubject($other),
            'DELETE api/v1/subjects/{id}'                  => fn (array $other) => $this->seedSubject($other),
            'GET api/v1/teachers/{id}'                     => fn (array $other) => $this->seedTeacher($other),
            'PUT api/v1/teachers/{id}'                     => fn (array $other) => $this->seedTeacher($other),
            'DELETE api/v1/teachers/{id}'                  => fn (array $other) => $this->seedTeacher($other),
            // the parameter is not a row id: the route only touches the caller's own children (WalkingSkeletonSliceTest, consent test)
            'PUT api/v1/parent/consents/{type}'            => null,
        ];
    }

    /** A student (named after the tenant's marker) in a batch with a monthly fee - created once per tenant */
    private function seedStudent(array $t): int
    {
        return Tenancy::as($t['institution'], function () use ($t) {
            $slug = $t['institution']->slug;
            if ($id = Student::where('student_id', 'like', 'ISO%')->value('id')) return $id;
            \Illuminate\Support\Facades\Queue::fake();
            FeeCategory::create(['name' => "fee {$slug}", 'amount' => 100, 'frequency' => 'monthly']);
            $batch = Batch::create(['program_id' => Program::create(['name' => "program {$slug}"])->id, 'name' => "batch {$slug}"]);
            return app(StudentService::class)->create(['name' => "student {$slug}", 'student_id' => 'ISO' . $t['institution']->id, 'guardian_phone' => '01711111111'], $batch)->id;
        });
    }

    /** The tenant's first row of a model (seedStudent made a program and a batch) */
    private function rowOf(array $t, string $model): ?int
    {
        $this->seedStudent($t);
        return Tenancy::as($t['institution'], fn () => $model::value('id'));
    }

    private function seedSubject(array $t): int
    {
        $this->seedStudent($t);
        return Tenancy::as($t['institution'], fn () => Subject::value('id')
            ?? Subject::create(['program_id' => Program::value('id'), 'name' => "subject {$t['institution']->slug}"])->id);
    }

    /** A teacher row (with no login, so no other tenant gains a session) */
    private function seedTeacher(array $t): int
    {
        return Tenancy::as($t['institution'], fn () => Teacher::value('id') ?? Teacher::create(['employee_id' => 'ISO-T'])->id);
    }

    /** One receipt line of the tenant's student (collected once) */
    private function seedReceipt(array $t): int
    {
        $student = $this->seedStudent($t);
        return Tenancy::as($t['institution'], function () use ($student) {
            if ($id = FeePayment::value('id')) return $id;
            $fees = app(FeeService::class);
            $s = Student::findOrFail($student);
            return $fees->collect($s, [['key' => $fees->dueLines($s)->first()['key']]])->first()->id;
        });
    }

    /** @return RouteDef[] the routes that only run on a tenant host */
    private function tenantRoutes(): array
    {
        return array_values(array_filter(Route::getRoutes()->getRoutes(), fn (RouteDef $r) => in_array('tenant', $r->gatherMiddleware(), true)));
    }

    private static function key(RouteDef $r, string $method): string { return "{$method} {$r->uri()}"; }

    public function test_the_framework_has_two_tenants_of_each_type_and_finds_the_tenant_routes(): void
    {
        $this->assertSame(array_merge(...array_map(fn ($t) => [$t, $t], self::TYPES)), array_values(array_map(fn ($t) => $t['institution']->institution_type, $this->tenants)));
        $this->assertNotEmpty($this->tenantRoutes());
        $this->assertNotContains('GET api/v1/bootstrap', array_map(fn ($r) => self::key($r, 'GET'), $this->tenantRoutes()), 'any-host routes are not tenant routes');
    }

    public function test_every_tenant_list_endpoint_returns_only_the_callers_own_rows(): void
    {
        $lists = array_filter($this->tenantRoutes(), fn (RouteDef $r) => in_array('GET', $r->methods(), true) && !str_contains($r->uri(), '{'));
        $this->assertNotEmpty($lists);

        foreach ($this->tenants as $slug => $me) {
            $others = array_diff(array_keys($this->tenants), [$slug]);
            foreach ($lists as $route) {
                $path = substr($route->uri(), strlen('api/v1/'));
                $res = $this->api('GET', $this->hostOf($me['institution']), $path, $me['admin']);
                $where = "{$slug} GET {$path}";
                $this->assertLessThan(500, $res->status(), $where);
                if ($res->status() !== 200) continue;   // a feature or module this type does not have: nothing leaks either way
                foreach ($others as $other) $this->assertStringNotContainsString($other, $res->getContent(), "{$where} leaked {$other}");
                foreach (self::institutionIds($res->json()) as $id) $this->assertSame($me['institution']->id, $id, "{$where} returned institution_id {$id}");
            }
        }
    }

    public function test_every_tenant_route_with_an_id_refuses_another_tenants_row(): void
    {
        $byId = [];
        foreach ($this->tenantRoutes() as $route) {
            if (!str_contains($route->uri(), '{')) continue;
            foreach (array_diff($route->methods(), ['HEAD']) as $method) $byId[self::key($route, $method)] = true;
        }
        $this->assertSame([], array_keys(array_diff_key($byId, $this->foreignIds())), 'add these routes to foreignIds()');

        $me = $this->tenants['isoschoola'];
        foreach (array_filter($this->foreignIds()) as $key => $make) {
            [$method, $uri] = explode(' ', $key, 2);
            foreach ($this->tenants as $slug => $other) {
                if ($slug === 'isoschoola') continue;
                $id = $make($other);
                $this->assertNotNull($id, "{$key}: no row seeded for {$slug}");
                $path = str_replace('{id}', (string) $id, substr($uri, strlen('api/v1/')));
                $this->api($method, $this->hostOf($me['institution']), $path, $me['admin'])->assertNotFound();
            }
        }
        $this->assertSame(7, User::whereKeyNot($me['admin']->id)->whereHas('tokens')->count(), 'no other tenant lost a session');
    }

    private static function institutionIds(mixed $json): array
    {
        if (!is_array($json)) return [];
        $ids = [];
        foreach ($json as $k => $v) {
            if ($k === 'institution_id' && $v !== null) $ids[] = (int) $v;
            elseif (is_array($v)) array_push($ids, ...self::institutionIds($v));
        }
        return $ids;
    }
}
