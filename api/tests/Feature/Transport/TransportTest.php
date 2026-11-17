<?php

namespace Tests\Feature\Transport;

use App\Models\{Batch, FeePayment, Program, Student, StudentTransport, User};
use App\Services\{FeeService, StudentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D229 TRN.1 (docs/modules/transport.md): vehicles, routes, stops, riders (seat limit; a change ends the row, never deletes it),
// the monthly transport fee as a due once per student from the start month to the end month, removal guards, staff exact keys,
// the student's / parent's own view, another institution 404.
class TransportTest extends TestCase
{
    use RefreshDatabase;

    private function school(string $slug): array
    {
        Queue::fake();
        $this->travelTo('2026-09-10 10:00:00');
        $i = $this->makeInstitution($slug, 'school');
        $admin = $this->makeUser($i, 'admin');
        [$a, $b] = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 8']);
            $b1 = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b2 = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $s = app(StudentService::class)->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $b1);
            \App\Models\Enrollment::create(['student_id' => $s->id, 'batch_id' => $b2->id, 'program_id' => $b2->program_id, 'status' => 'active', 'enrolled_at' => now()]);   // two active enrollments: the fee is still once a month
            return [$s, app(StudentService::class)->create(['name' => 'Mitu', 'guardian_phone' => '01722222222'], $b1)];
        });
        // the test moves the clock months ahead: transport switched on by the Super Admin (D6), so no trial runs out
        $i->forceFill(['enabled_modules' => ['transport' => true]])->save();
        return [$i, $admin, $a, $b, $this->hostOf($i)];
    }

    private function transportDues(\App\Models\Institution $i, Student $s): array
    {
        return Tenancy::as($i, fn () => app(FeeService::class)->dueLines(Student::find($s->id))->filter(fn ($l) => $l['category'] === 'পরিবহন ফি')
            ->map(fn ($l) => [$l['period'], $l['amount']])->values()->all());
    }

    public function test_routes_riders_seats_and_the_monthly_fee(): void
    {
        [$i, $admin, $rafi, $mitu, $host] = $this->school('trn1');
        $van = $this->api('POST', $host, 'transport/vehicles', $admin, ['name' => 'Van 1', 'number_plate' => 'DHA-11', 'capacity' => 1, 'driver_name' => 'Karim', 'driver_phone' => '01811111111'])->assertCreated()->json('data');
        $this->assertArrayNotHasKey('gps_api_key', $van);
        $route = $this->api('POST', $host, 'transport/routes', $admin, ['name' => 'Mirpur', 'vehicle_id' => $van['id'], 'morning_departure' => '07:00', 'monthly_fee' => '800.00'])->assertCreated()->json('data');
        $this->api('POST', $host, 'transport/routes', $admin, ['name' => 'x', 'monthly_fee' => '8.555'])->assertStatus(422)->assertJsonValidationErrors('monthly_fee');
        $stop = $this->api('POST', $host, "transport/routes/{$route['id']}/stops", $admin, ['stop_name' => 'Mirpur 10', 'pickup_time' => '07:20', 'drop_time' => '14:10'])->assertCreated()->json('data');
        $this->assertSame(1, $stop['sequence']);

        $code = Tenancy::as($i, fn () => Student::find($rafi->id)->student_id);
        $this->api('POST', $host, 'transport/assign', $admin, ['student_code' => $code, 'route_id' => $route['id'], 'stop_id' => $stop['id']])->assertCreated()->assertJsonPath('data.started_on', '2026-09-10');
        $this->api('POST', $host, 'transport/assign', $admin, ['student_id' => $mitu->id, 'route_id' => $route['id']])->assertStatus(422)->assertJsonPath('error', 'route_full');
        $this->api('PUT', $host, "transport/vehicles/{$van['id']}", $admin, ['capacity' => 2])->assertOk();
        $this->api('POST', $host, 'transport/assign', $admin, ['student_id' => $mitu->id, 'route_id' => $route['id']])->assertCreated();
        $this->api('PUT', $host, "transport/vehicles/{$van['id']}", $admin, ['capacity' => 1])->assertStatus(422)->assertJsonValidationErrors('capacity');
        $this->assertSame(['Rafi', 'Mitu'], array_column(array_column($this->api('GET', $host, "transport/routes/{$route['id']}/students", $admin)->assertOk()->json('data'), 'student'), 'name'), 'stop order; no stop last');

        $this->assertSame([['2026-09', '800.00']], $this->transportDues($i, $rafi), 'once a month though Rafi is in two batches');
        $this->travelTo('2026-11-05 10:00:00');
        $this->assertSame([['2026-09', '800.00'], ['2026-10', '800.00'], ['2026-11', '800.00']], $this->transportDues($i, $rafi));
        Tenancy::as($i, fn () => app(FeeService::class)->collect(Student::find($rafi->id), [['key' => app(FeeService::class)->dueLines(Student::find($rafi->id))->firstWhere('period', '2026-09')['key'], 'paid_amount' => '800.00']]));
        $this->assertSame([['2026-10', '800.00'], ['2026-11', '800.00']], $this->transportDues($i, $rafi));

        // a cheaper route from December: the old row ends (kept), the new fee applies from December
        $near = $this->api('POST', $host, 'transport/routes', $admin, ['name' => 'Kallyanpur', 'monthly_fee' => '500.00'])->assertCreated()->json('data');
        $this->api('POST', $host, 'transport/assign', $admin, ['student_id' => $rafi->id, 'route_id' => $near['id'], 'stop_id' => $stop['id']])->assertStatus(422)->assertJsonValidationErrors('stop_id');
        $this->api('POST', $host, 'transport/assign', $admin, ['student_id' => $rafi->id, 'route_id' => $near['id'], 'started_on' => '2026-12-01'])->assertCreated();
        $this->travelTo('2027-01-15 10:00:00');
        $this->assertSame([['2026-10', '800.00'], ['2026-11', '800.00'], ['2026-12', '500.00'], ['2027-01', '500.00']], $this->transportDues($i, $rafi));
        $this->api('POST', $host, "transport/students/{$rafi->id}/unassign", $admin, ['ended_on' => '2027-01-20'])->assertOk();
        $this->api('POST', $host, "transport/students/{$rafi->id}/unassign", $admin)->assertNotFound();
        $this->travelTo('2027-03-01 10:00:00');
        $this->assertSame([['2026-10', '800.00'], ['2026-11', '800.00'], ['2026-12', '500.00'], ['2027-01', '500.00']], $this->transportDues($i, $rafi), 'unpaid months stay due after leaving; none after');
        $this->assertSame(2, Tenancy::as($i, fn () => StudentTransport::where('student_id', $rafi->id)->count()), 'never deleted');
        $this->assertSame(1, Tenancy::as($i, fn () => FeePayment::count()));

        $this->api('DELETE', $host, "transport/routes/{$near['id']}", $admin)->assertStatus(409);
        $this->api('DELETE', $host, "transport/vehicles/{$van['id']}", $admin)->assertStatus(409);
        $this->api('DELETE', $host, "transport/stops/{$stop['id']}", $admin)->assertStatus(409);
        $spare = $this->api('POST', $host, 'transport/routes', $admin, ['name' => 'Spare'])->assertCreated()->json('data');
        $this->api('POST', $host, "transport/routes/{$spare['id']}/stops", $admin, ['stop_name' => 'Gate'])->assertCreated();
        $this->api('DELETE', $host, "transport/routes/{$spare['id']}", $admin)->assertOk();
    }

    public function test_staff_keys_family_view_and_other_institution(): void
    {
        [$i, $admin, $rafi, $mitu, $host] = $this->school('trn2');
        $van = $this->api('POST', $host, 'transport/vehicles', $admin, ['name' => 'Bus', 'number_plate' => 'DHA-22', 'capacity' => 40, 'driver_name' => 'Jamal', 'driver_phone' => '01822222222'])->assertCreated()->json('data');
        $route = $this->api('POST', $host, 'transport/routes', $admin, ['name' => 'Uttara', 'vehicle_id' => $van['id'], 'monthly_fee' => '1000'])->assertCreated()->json('data');
        $stop = $this->api('POST', $host, "transport/routes/{$route['id']}/stops", $admin, ['stop_name' => 'Sector 7', 'pickup_time' => '06:50'])->assertCreated()->json('data');
        $this->api('POST', $host, 'transport/assign', $admin, ['student_id' => $rafi->id, 'route_id' => $route['id'], 'stop_id' => $stop['id'], 'direction' => 'pickup_only'])->assertCreated();

        $parent = Tenancy::as($i, fn () => Student::find($rafi->id)->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $mine = $this->api('GET', $host, "parent/children/{$rafi->id}/transport", $parent)->assertOk()->json('data');
        $this->assertSame(['Uttara', 'Jamal', '01822222222', 'Sector 7', 'pickup_only'], [$mine['route'], $mine['driver_name'], $mine['driver_phone'], $mine['stop'], $mine['direction']]);
        $this->api('GET', $host, "parent/children/{$mitu->id}/transport", $parent)->assertNotFound();
        $this->api('GET', $host, "transport/routes/{$route['id']}/students", $parent)->assertForbidden();
        $mituUser = User::find(Tenancy::as($i, fn () => Student::find($mitu->id)->user_id));
        $mituUser->forceFill(['must_change_password' => false])->save();
        $this->api('GET', $host, 'student/transport', $mituUser)->assertOk()->assertJsonPath('data', null);

        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = function (string $name, array $keys) use ($i, $admin) {
            $u = User::create(['institution_id' => $i->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
            $u->forceFill(['must_change_password' => false])->save();
            $dep = Tenancy::as($i, function () use ($u, $name, $keys, $admin) {
                $svc = app(\App\Services\DepartmentService::class);
                $dep = $svc->create($admin, ['name' => "Dept {$name}"]);
                $m = $svc->addMember($admin, $dep->id, ['user_id' => $u->id]);
                $svc->assignDuties($admin, $m->id, ['duty_ids' => [$svc->createDuty($admin, $dep->id, ['code' => strtoupper($name), 'name' => $name, 'permission_keys' => $keys])->id]]);
                return $dep->id;
            });
            return [$u, $dep];
        };
        $as = function (User $u, int $dep, string $method, string $path, array $body = []) use ($host) {
            $this->app['auth']->forgetGuards();
            return $this->json($method, "http://{$host}/api/v1/{$path}", $body, ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken, 'X-Department-Id' => (string) $dep]);
        };
        [$reader, $rd] = $staff('TrnReader', ['staff.transport.read']);
        [$manager, $md] = $staff('TrnManager', ['staff.transport.manage']);
        $as($reader, $rd, 'GET', 'transport/routes')->assertOk()->assertJsonPath('data.0.riders', 1);
        $as($reader, $rd, 'POST', 'transport/assign', ['student_id' => $mitu->id, 'route_id' => $route['id']])->assertForbidden();
        $as($manager, $md, 'POST', 'transport/assign', ['student_id' => $mitu->id, 'route_id' => $route['id']])->assertCreated();
        $as($manager, $md, 'GET', 'transport/routes')->assertForbidden();

        [$j, $otherAdmin, , , $otherHost] = $this->school('trn3');
        $this->api('PUT', $otherHost, "transport/routes/{$route['id']}", $otherAdmin, ['name' => 'x'])->assertNotFound();
        $this->api('POST', $otherHost, "transport/students/{$rafi->id}/unassign", $otherAdmin)->assertNotFound();
    }
}
