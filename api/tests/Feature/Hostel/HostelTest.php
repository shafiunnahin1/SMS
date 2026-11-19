<?php

namespace Tests\Feature\Hostel;

use App\Models\{Batch, FeePayment, HostelAllocation, HostelRoom, Program, Student, User};
use App\Services\{FeeService, StudentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D233 HST.1 (docs/modules/hostel.md): hostels and rooms (total_rooms follows the rooms; seats never below the occupants; a used
// room / hostel is not removed), allocation (by ID card number, gender and hostel type, seat limit, one active per student, a room
// change ends the old one, never deleted), check-out, current_occupancy kept equal to the active allocations, the room fee as a
// monthly due once per student from the check-in month to the check-out month, occupancy report, the family's own view, staff
// exact keys, another institution 404.
class HostelTest extends TestCase
{
    use RefreshDatabase;

    private function school(string $slug): array
    {
        Queue::fake();
        $this->travelTo('2026-09-10 10:00:00');
        $i = $this->makeInstitution($slug, 'school');
        $i->forceFill(['enabled_modules' => ['hostel' => true]])->save();   // the clock moves months ahead: no trial runs out
        $admin = $this->makeUser($i, 'admin');
        $d = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 8']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $svc = app(StudentService::class);
            $rafi = $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111', 'gender' => 'male'], $a);
            \App\Models\Enrollment::create(['student_id' => $rafi->id, 'batch_id' => $b->id, 'program_id' => $p->id, 'status' => 'active', 'enrolled_at' => now()]);   // two batches: one fee a month
            return ['rafi' => $rafi, 'mitu' => $svc->create(['name' => 'Mitu', 'guardian_phone' => '01722222222', 'gender' => 'female'], $a),
                'tanim' => $svc->create(['name' => 'Tanim', 'guardian_phone' => '01733333333', 'gender' => 'male'], $a)];
        });
        return [$i, $admin, $d, $this->hostOf($i)];
    }

    private function dues($i, Student $s): array
    {
        return Tenancy::as($i, fn () => app(FeeService::class)->dueLines(Student::find($s->id))->filter(fn ($l) => $l['category'] === 'হোস্টেল ফি')
            ->map(fn ($l) => [$l['period'], $l['amount']])->values()->all());
    }

    public function test_rooms_allocation_rules_and_the_monthly_room_fee(): void
    {
        [$i, $admin, $d, $host] = $this->school('hst1');
        $this->api('POST', $host, 'hostel', $admin, ['name' => 'x', 'type' => 'boys', 'total_rooms' => 9])->assertStatus(422)->assertJsonValidationErrors('total_rooms');
        $boys = $this->api('POST', $host, 'hostel', $admin, ['name' => 'শাহজালাল হল', 'type' => 'boys', 'warden_name' => 'Karim', 'warden_phone' => '01811111111'])->assertCreated()->json('data');
        $r101 = $this->api('POST', $host, "hostel/{$boys['id']}/rooms", $admin, ['room_number' => '101', 'capacity' => 1, 'floor' => 1, 'monthly_fee' => '1500.00'])->assertCreated()->json('data');
        $r102 = $this->api('POST', $host, "hostel/{$boys['id']}/rooms", $admin, ['room_number' => '102', 'capacity' => 2, 'monthly_fee' => '1000'])->assertCreated()->json('data');
        $this->api('POST', $host, "hostel/{$boys['id']}/rooms", $admin, ['room_number' => '101', 'capacity' => 2])->assertStatus(422)->assertJsonValidationErrors('room_number');
        $this->assertSame(2, $this->api('GET', $host, 'hostel', $admin)->json('data.0.total_rooms'), 'total_rooms follows the rooms');

        $code = Tenancy::as($i, fn () => Student::find($d['rafi']->id)->student_id);
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['mitu']->id, 'room_id' => $r101['id']])->assertStatus(422)->assertJsonPath('error', 'hostel_wrong_type');
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_code' => $code, 'room_id' => $r101['id']])->assertCreated()->assertJsonPath('data.check_in_date', '2026-09-10');
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['tanim']->id, 'room_id' => $r101['id']])->assertStatus(422)->assertJsonPath('error', 'room_full');
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['rafi']->id, 'room_id' => $r101['id']])->assertStatus(409);
        $this->api('PUT', $host, "hostel/{$boys['id']}/rooms/{$r101['id']}", $admin, ['capacity' => 0])->assertStatus(422);
        $this->assertSame(['102'], array_column($this->api('GET', $host, 'hostel/available-rooms', $admin)->json('data'), 'room_number'), '101 is full');
        $this->api('PUT', $host, "hostel/{$boys['id']}", $admin, ['type' => 'girls'])->assertStatus(422)->assertJsonValidationErrors('type');

        $this->assertSame([['2026-09', '1500.00']], $this->dues($i, $d['rafi']), 'once a month though Rafi is in two batches');
        $this->travelTo('2026-11-05 10:00:00');
        $this->assertSame([['2026-09', '1500.00'], ['2026-10', '1500.00'], ['2026-11', '1500.00']], $this->dues($i, $d['rafi']));
        Tenancy::as($i, fn () => app(FeeService::class)->collect(Student::find($d['rafi']->id), [['key' => app(FeeService::class)->dueLines(Student::find($d['rafi']->id))->firstWhere(fn ($l) => $l['category'] === 'হোস্টেল ফি' && $l['period'] === '2026-09')['key']]]));
        $this->assertSame([['2026-10', '1500.00'], ['2026-11', '1500.00']], $this->dues($i, $d['rafi']));

        // a cheaper room from December: the old allocation ends (kept) and both rooms' occupancy follow
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['rafi']->id, 'room_id' => $r102['id'], 'check_in_date' => '2026-12-01'])->assertCreated();
        $this->assertSame([0, 1], Tenancy::as($i, fn () => [HostelRoom::find($r101['id'])->current_occupancy, HostelRoom::find($r102['id'])->current_occupancy]));
        $this->travelTo('2027-01-15 10:00:00');
        $this->assertSame([['2026-10', '1500.00'], ['2026-11', '1500.00'], ['2026-12', '1000.00'], ['2027-01', '1000.00']], $this->dues($i, $d['rafi']));
        $active = $this->api('GET', $host, 'hostel/allocations', $admin)->json('data.0');
        $this->api('PATCH', $host, "hostel/allocations/{$active['id']}/checkout", $admin, ['check_out_date' => '2027-01-20'])->assertOk()->assertJsonPath('data.status', 'checked_out');
        $this->api('PATCH', $host, "hostel/allocations/{$active['id']}/checkout", $admin)->assertStatus(409);
        $this->travelTo('2027-03-01 10:00:00');
        $this->assertSame([['2026-10', '1500.00'], ['2026-11', '1500.00'], ['2026-12', '1000.00'], ['2027-01', '1000.00']], $this->dues($i, $d['rafi']), 'unpaid months stay due; none after check-out');
        $this->assertSame(2, Tenancy::as($i, fn () => HostelAllocation::where('student_id', $d['rafi']->id)->count()), 'never deleted');
        $this->assertSame(0, Tenancy::as($i, fn () => HostelRoom::find($r102['id'])->current_occupancy));

        $this->api('DELETE', $host, "hostel/{$boys['id']}/rooms/{$r101['id']}", $admin)->assertStatus(409);
        $this->api('DELETE', $host, "hostel/{$boys['id']}", $admin)->assertStatus(409);
        $spare = $this->api('POST', $host, "hostel/{$boys['id']}/rooms", $admin, ['room_number' => '201', 'capacity' => 3])->assertCreated()->json('data');
        $this->api('DELETE', $host, "hostel/{$boys['id']}/rooms/{$spare['id']}", $admin)->assertOk();
        $girls = $this->api('POST', $host, 'hostel', $admin, ['name' => 'Begum Rokeya', 'type' => 'girls'])->assertCreated()->json('data');
        $this->api('DELETE', $host, "hostel/{$girls['id']}/rooms/{$r102['id']}", $admin)->assertNotFound()->assertJsonMissing(['error' => 'room_in_use']);   // another hostel's room
        $this->assertSame(1, Tenancy::as($i, fn () => FeePayment::count()));
        $report = collect($this->api('GET', $host, 'hostel/reports/occupancy', $admin)->assertOk()->json('data'))->keyBy('name');
        $this->assertSame([2, 3, 0, 3], [$report['শাহজালাল হল']['rooms'], $report['শাহজালাল হল']['seats'], $report['শাহজালাল হল']['occupied'], $report['শাহজালাল হল']['free']]);
    }

    public function test_family_view_staff_keys_and_other_institution(): void
    {
        [$i, $admin, $d, $host] = $this->school('hst2');
        $h = $this->api('POST', $host, 'hostel', $admin, ['name' => 'Hall', 'type' => 'boys', 'warden_name' => 'Karim', 'warden_phone' => '01811111111'])->assertCreated()->json('data');
        $room = $this->api('POST', $host, "hostel/{$h['id']}/rooms", $admin, ['room_number' => '7', 'capacity' => 4, 'floor' => 2, 'monthly_fee' => '900'])->assertCreated()->json('data');
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['rafi']->id, 'room_id' => $room['id']])->assertCreated();

        $parent = Tenancy::as($i, fn () => Student::find($d['rafi']->id)->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $mine = $this->api('GET', $host, "parent/children/{$d['rafi']->id}/hostel", $parent)->assertOk()->json('data');
        $this->assertSame(['Hall', '7', 2, 'Karim', '01811111111', '900.00'], [$mine['hostel'], $mine['room_number'], $mine['floor'], $mine['warden_name'], $mine['warden_phone'], $mine['monthly_fee']]);
        $this->api('GET', $host, "parent/children/{$d['mitu']->id}/hostel", $parent)->assertNotFound();
        $this->api('GET', $host, 'hostel/allocations', $parent)->assertForbidden();
        $mituUser = User::find(Tenancy::as($i, fn () => Student::find($d['mitu']->id)->user_id));
        $mituUser->forceFill(['must_change_password' => false])->save();
        $this->api('GET', $host, 'student/hostel', $mituUser)->assertOk()->assertJsonPath('data', null);

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
        [$reader, $rd] = $staff('HstReader', ['staff.hostel.read']);
        [$manager, $md] = $staff('HstManager', ['staff.hostel.manage']);
        $as($reader, $rd, 'GET', 'hostel/allocations')->assertOk()->assertJsonCount(1, 'data');
        $as($reader, $rd, 'POST', 'hostel/allocate', ['student_id' => $d['tanim']->id, 'room_id' => $room['id']])->assertForbidden();
        $as($manager, $md, 'POST', 'hostel/allocate', ['student_id' => $d['tanim']->id, 'room_id' => $room['id']])->assertCreated();
        $as($manager, $md, 'GET', 'hostel')->assertForbidden();

        [$j, $otherAdmin, , $otherHost] = $this->school('hst3');
        $this->api('PUT', $otherHost, "hostel/{$h['id']}", $otherAdmin, ['name' => 'x'])->assertNotFound();
        $this->api('POST', $otherHost, 'hostel/allocate', $otherAdmin, ['student_id' => $d['rafi']->id, 'room_id' => $room['id']])->assertNotFound();
    }
}
