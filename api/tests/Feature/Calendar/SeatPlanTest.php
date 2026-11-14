<?php

namespace Tests\Feature\Calendar;

use App\Models\{AuditLog, Enrollment, ExamSeatPlan};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D213 CAL.3: the admin fills rooms with the exam's students in batch then roll order (seat 1..capacity, `columns` benches a row);
// not enough seats or no student is refused; generating again replaces the plan; one student moves to a free seat of a room of
// the plan, never onto a taken seat; the room-wise PDF prints; admin only.
class SeatPlanTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_generate_adjust_print(): void
    {
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('seat');   // Class 10: Mine and Other in A, Sister in B
        $h = $s['host'];
        $admin = $s['admin'];
        $exam = $this->exam($s);
        Tenancy::as($s['i'], function () use ($s) {
            Enrollment::where('student_id', $s['mine']->id)->update(['roll_no' => 2]);
            Enrollment::where('student_id', $s['other']->id)->update(['roll_no' => 1]);
            Enrollment::where('student_id', $s['sister']->id)->update(['roll_no' => 1]);
        });

        $this->api('POST', $h, "exams/{$exam}/seat-plan/generate", $admin, ['rooms' => [['name' => '101', 'capacity' => 2]]])
            ->assertStatus(422)->assertJsonPath('error', 'seat_capacity_short');
        $this->api('POST', $h, "exams/{$exam}/seat-plan/generate", $admin, ['rooms' => [['name' => '101', 'capacity' => 2], ['name' => '101', 'capacity' => 2]]])->assertStatus(422);
        $this->api('POST', $h, "exams/{$exam}/seat-plan/generate", $s['karimUser'], ['rooms' => [['name' => '101', 'capacity' => 5]]])->assertForbidden();

        $r = $this->api('POST', $h, "exams/{$exam}/seat-plan/generate", $admin, ['rooms' => [['name' => '101', 'capacity' => 2, 'columns' => 1], ['name' => '102', 'capacity' => 10]]])
            ->assertCreated()->json('data');
        $this->assertSame(3, $r['placed']);
        // batch A by roll (Other 1, Mine 2) then batch B (Sister)
        $this->assertSame(['101', '102'], array_column($r['rooms'], 'name'));
        $this->assertSame([$s['other']->id, $s['mine']->id], array_column($r['rooms'][0]['seats'], 'student_id'));
        $this->assertSame([[1, 1], [2, 1]], array_map(fn ($x) => [$x['row'], $x['column']], $r['rooms'][0]['seats']));
        $this->assertSame([$s['sister']->id], array_column($r['rooms'][1]['seats'], 'student_id'));

        // again: the plan is replaced, not added to
        $this->api('POST', $h, "exams/{$exam}/seat-plan/generate", $admin, ['rooms' => [['name' => 'Hall', 'capacity' => 3]]])->assertCreated();
        $this->assertSame(3, Tenancy::as($s['i'], fn () => ExamSeatPlan::where('exam_id', $exam)->count()));
        $this->assertSame(['Hall'], array_column($this->api('GET', $h, "exams/{$exam}/seat-plan", $admin)->assertOk()->json('data.rooms'), 'name'));

        // move: to a free seat of a room of the plan
        $this->api('PUT', $h, "exams/{$exam}/seat-plan/{$s['mine']->id}", $admin, ['room_name' => 'Hall', 'seat_number' => '1'])->assertStatus(422)->assertJsonPath('error', 'seat_taken');
        $this->api('PUT', $h, "exams/{$exam}/seat-plan/{$s['mine']->id}", $admin, ['room_name' => 'Nowhere', 'seat_number' => '9'])->assertStatus(422)->assertJsonPath('error', 'seat_unknown_room');
        $seats = $this->api('PUT', $h, "exams/{$exam}/seat-plan/{$s['mine']->id}", $admin, ['room_name' => 'Hall', 'seat_number' => '9'])->assertOk()->json('data.rooms.0.seats');
        $this->assertSame('9', collect($seats)->firstWhere('student_id', $s['mine']->id)['seat_number']);
        $this->api('PUT', $h, "exams/{$exam}/seat-plan/999999", $admin, ['room_name' => 'Hall', 'seat_number' => '8'])->assertNotFound();

        $pdf = $this->api('GET', $h, "exams/{$exam}/seat-plan/print", $admin)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        Tenancy::as($s['i'], fn () => $this->assertSame(['seat_plan.generated', 'seat_plan.generated', 'seat_plan.moved'], AuditLog::where('action', 'like', 'seat_plan.%')->orderBy('id')->pluck('action')->all()));
    }

    public function test_an_exam_without_students_and_without_a_plan(): void
    {
        $s = $this->school('seat0');
        $exam = $this->exam($s);
        Tenancy::as($s['i'], fn () => Enrollment::query()->update(['status' => 'dropped']));
        $this->api('POST', $s['host'], "exams/{$exam}/seat-plan/generate", $s['admin'], ['rooms' => [['name' => '1', 'capacity' => 5]]])->assertStatus(422)->assertJsonPath('error', 'seat_no_students');
        $this->api('GET', $s['host'], "exams/{$exam}/seat-plan/print", $s['admin'])->assertNotFound();
        $this->assertSame([], $this->api('GET', $s['host'], "exams/{$exam}/seat-plan", $s['admin'])->assertOk()->json('data.rooms'));
    }
}
