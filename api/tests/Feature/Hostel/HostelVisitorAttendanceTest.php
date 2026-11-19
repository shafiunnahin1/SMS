<?php

namespace Tests\Feature\Hostel;

use App\Models\{AuditLog, Batch, HostelAttendance, HostelVisitor, Program, Student, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D233 HST.4: the visitor log (residents only, out time, corrections in the audit log, never deleted, the parent's own child) and
// the night roll call (residents of the night, present by default, re-submitting updates, a new absence notifies the parents once,
// the student's / parent's own nights), staff keys, another institution 404.
class HostelVisitorAttendanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_visitors_and_night_attendance(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-10 20:00:00');
        $i = $this->makeInstitution('hva', 'school');
        $admin = $this->makeUser($i, 'admin');
        $d = Tenancy::as($i, function () {
            $b = Batch::create(['program_id' => Program::create(['name' => 'Class 8'])->id, 'name' => 'A']);
            $svc = app(StudentService::class);
            return ['rafi' => $svc->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $b), 'tanim' => $svc->create(['name' => 'Tanim', 'guardian_phone' => '01722222222'], $b),
                'nila' => $svc->create(['name' => 'Nila', 'guardian_phone' => '01733333333'], $b)];
        });
        $host = $this->hostOf($i);
        $h = $this->api('POST', $host, 'hostel', $admin, ['name' => 'Hall', 'type' => 'boys'])->assertCreated()->json('data');
        $room = $this->api('POST', $host, "hostel/{$h['id']}/rooms", $admin, ['room_number' => '1', 'capacity' => 4])->assertCreated()->json('data');
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['rafi']->id, 'room_id' => $room['id'], 'check_in_date' => '2026-11-01'])->assertCreated();
        $this->api('POST', $host, 'hostel/allocate', $admin, ['student_id' => $d['tanim']->id, 'room_id' => $room['id'], 'check_in_date' => '2026-11-01'])->assertCreated();

        // visitors
        $code = Tenancy::as($i, fn () => Student::find($d['rafi']->id)->student_id);
        $this->api('POST', $host, "hostel/{$h['id']}/visitors", $admin, ['student_id' => $d['nila']->id, 'visitor_name' => 'X'])->assertStatus(422)->assertJsonValidationErrors('student_code');
        $v = $this->api('POST', $host, "hostel/{$h['id']}/visitors", $admin, ['student_code' => $code, 'visitor_name' => 'Abdul Karim', 'relation' => 'বাবা', 'phone' => '01700000000', 'purpose' => 'খাবার দিতে'])
            ->assertCreated()->assertJsonPath('data.in_at', '2026-11-10 20:00')->json('data');
        $this->api('PUT', $host, "hostel/visitors/{$v['id']}", $admin, ['out_at' => '2026-11-10 19:00'])->assertStatus(422);
        $this->api('PUT', $host, "hostel/visitors/{$v['id']}", $admin, ['out_at' => '2026-11-10 20:40', 'relation' => 'চাচা'])->assertOk()->assertJsonPath('data.out_at', '2026-11-10 20:40');
        $this->assertSame('বাবা', Tenancy::as($i, fn () => AuditLog::where('action', 'hostel.visitor_updated')->sole()->new_data['was']['relation']));
        $this->assertSame(['Abdul Karim'], array_column($this->api('GET', $host, "hostel/{$h['id']}/visitors", $admin)->json('data'), 'visitor_name'));

        // night attendance
        $sheet = $this->api('GET', $host, "hostel/{$h['id']}/attendance", $admin)->assertOk()->json('data');
        $this->assertSame([false, ['present', 'present']], [$sheet['taken'], array_column($sheet['rows'], 'status')], 'two residents, present by default; Nila is not one');
        $this->api('PUT', $host, "hostel/{$h['id']}/attendance", $admin, ['date' => '2026-11-11', 'marks' => []])->assertStatus(422);   // the future
        $this->api('PUT', $host, "hostel/{$h['id']}/attendance", $admin, ['date' => '2026-11-10', 'marks' => [['student_id' => $d['nila']->id, 'status' => 'absent']]])->assertStatus(422);
        $this->api('PUT', $host, "hostel/{$h['id']}/attendance", $admin, ['date' => '2026-11-10', 'marks' => [['student_id' => $d['rafi']->id, 'status' => 'absent']]])->assertOk()->assertJsonPath('data.taken', true);
        $this->api('PUT', $host, "hostel/{$h['id']}/attendance", $admin, ['date' => '2026-11-10', 'marks' => [['student_id' => $d['rafi']->id, 'status' => 'absent'], ['student_id' => $d['tanim']->id, 'status' => 'leave']]])->assertOk();
        $this->assertSame(2, Tenancy::as($i, fn () => HostelAttendance::count()), 'one row per resident per night, updated');
        $parent = Tenancy::as($i, fn () => Student::find($d['rafi']->id)->parents()->first());
        $this->assertSame(1, $parent->notifications()->where('data->type', 'hostel_absent')->count(), 'notified once, not again on re-submit');
        $this->api('PUT', $host, "hostel/{$h['id']}/attendance", $admin, ['date' => '2026-11-09', 'marks' => [['student_id' => $d['rafi']->id, 'status' => 'present']]])->assertOk();

        $parent->forceFill(['must_change_password' => false])->save();
        $nights = $this->api('GET', $host, "parent/children/{$d['rafi']->id}/hostel/attendance", $parent, ['month' => '2026-11'])->assertOk()->json('data');
        $this->assertSame(['present' => 1, 'absent' => 1, 'leave' => 0], $nights['counts']);
        $this->assertSame(['Abdul Karim'], array_column($this->api('GET', $host, "parent/children/{$d['rafi']->id}/hostel/visitors", $parent)->assertOk()->json('data'), 'visitor_name'));
        $this->api('GET', $host, "parent/children/{$d['tanim']->id}/hostel/visitors", $parent)->assertNotFound();
        $tanim = User::find(Tenancy::as($i, fn () => Student::find($d['tanim']->id)->user_id));
        $tanim->forceFill(['must_change_password' => false])->save();
        $this->assertSame(['present' => 1, 'absent' => 0, 'leave' => 1], $this->api('GET', $host, 'student/hostel/attendance', $tanim)->assertOk()->json('data.counts'), 'the 9th marked everyone not listed present');
        $this->api('GET', $host, "hostel/{$h['id']}/attendance", $tanim)->assertForbidden();
        $this->assertSame(1, Tenancy::as($i, fn () => HostelVisitor::count()));

        $j = $this->makeInstitution('hva2', 'school');
        $other = $this->makeUser($j, 'admin');
        $this->api('PUT', $this->hostOf($j), "hostel/visitors/{$v['id']}", $other, ['out_at' => '2026-11-10 21:00'])->assertNotFound();
        $this->api('GET', $this->hostOf($j), "hostel/{$h['id']}/attendance", $other)->assertNotFound();
    }
}
