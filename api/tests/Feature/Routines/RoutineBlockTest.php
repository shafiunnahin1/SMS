<?php

namespace Tests\Feature\Routines;

use App\Models\{RoutineBlock, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D197 AAD.5 (academics-advanced.md section 4.2): the admin keeps fixed blocks (break / assembly / prayer) for one program or all,
// one day or every day; a class inside a block is refused (routine_conflict, back-to-back allowed); saving a block lists the classes
// already inside it without touching them; the print shows blocks as their own grey columns; teachers and students only read.
class RoutineBlockTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_blocks_crud_conflict_and_print(): void
    {
        $s = $this->school('rtb');
        $h = $s['host'];
        $karim = Tenancy::as($s['i'], fn () => Teacher::where('user_id', $s['karimUser']->id)->value('id'));
        $other = Tenancy::as($s['i'], fn () => Teacher::where('user_id', $s['otherUser']->id)->value('id'));
        $slot = fn (array $f) => $f + ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $karim, 'day_of_week' => 'sun', 'start_time' => '10:00', 'end_time' => '10:45'];
        $existing = $this->api('POST', $h, 'routines', $s['admin'], $slot([]))->assertCreated()->json('data.id');

        // validation; only the admin writes
        $this->api('POST', $h, 'routine-blocks', $s['admin'], ['start_time' => '11:00', 'end_time' => '10:30', 'kind' => 'break'])->assertStatus(422);
        $this->api('POST', $h, 'routine-blocks', $s['admin'], ['start_time' => '11:00', 'end_time' => '11:30', 'kind' => 'lunch'])->assertStatus(422);
        $this->api('POST', $h, 'routine-blocks', $s['karimUser'], ['start_time' => '11:00', 'end_time' => '11:30', 'kind' => 'break'])->assertForbidden();

        // an every-day break for every program; a Sunday assembly of this program over the existing class: listed, not moved
        $break = $this->api('POST', $h, 'routine-blocks', $s['admin'], ['start_time' => '11:00', 'end_time' => '11:30', 'kind' => 'break', 'label' => 'Tiffin'])
            ->assertCreated()->assertJsonPath('data.overlapping_routines', [])->json('data.id');
        $asm = $this->api('POST', $h, 'routine-blocks', $s['admin'], ['program_id' => $s['p']->id, 'day_of_week' => 'sun', 'start_time' => '10:30', 'end_time' => '10:40', 'kind' => 'assembly'])
            ->assertCreated()->json('data');
        $this->assertSame([$existing], array_column($asm['overlapping_routines'], 'routine_id'));
        $this->assertSame(1, Tenancy::as($s['i'], fn () => \App\Models\Routine::whereKey($existing)->count()));

        // a class in the break (any day) or the Sunday assembly is refused; Monday 10:30 and back-to-back with the break are fine
        $this->api('POST', $h, 'routines', $s['admin'], $slot(['day_of_week' => 'mon', 'start_time' => '11:15', 'end_time' => '12:00']))->assertStatus(422)->assertJsonPath('error', 'routine_conflict');
        $this->api('POST', $h, 'routines', $s['admin'], $slot(['batch_id' => $s['b']->id, 'teacher_id' => $other, 'subject_id' => $s['physics']->id, 'start_time' => '10:35', 'end_time' => '10:50']))->assertStatus(422);
        $this->api('POST', $h, 'routines', $s['admin'], $slot(['day_of_week' => 'mon', 'start_time' => '10:30', 'end_time' => '11:00']))->assertCreated();
        $this->api('POST', $h, 'routines', $s['admin'], $slot(['day_of_week' => 'tue', 'start_time' => '11:30', 'end_time' => '12:15']))->assertCreated();

        // edit and delete; readers
        $this->api('PUT', $h, "routine-blocks/{$break}", $s['admin'], ['start_time' => '12:15', 'end_time' => '12:45', 'kind' => 'prayer', 'label' => 'Zuhr'])->assertOk()->assertJsonPath('data.kind', 'prayer');
        $this->assertCount(2, $this->api('GET', $h, "routine-blocks?program_id={$s['p']->id}", $s['karimUser'])->assertOk()->json('data'));

        // print: the blocks are their own grey columns; the Sunday-only assembly greys only Sunday
        $seen = null;
        $this->mock(\App\Services\PdfService::class)->shouldReceive('render')->andReturnUsing(function ($v, $data) use (&$seen) { $seen = $data; return '%PDF'; });
        $this->api('GET', $h, "routines/{$s['p']->id}/print", $s['admin'])->assertOk();
        $this->assertContains('12:15–12:45', $seen['times']);
        $this->assertSame('Zuhr', $seen['blocks']['mon']['12:15–12:45']);
        $this->assertArrayHasKey('10:30–10:40', $seen['blocks']['sun']);
        $this->assertArrayNotHasKey('10:30–10:40', $seen['blocks']['mon'] ?? []);

        $this->api('DELETE', $h, "routine-blocks/{$asm['id']}", $s['admin'])->assertOk();
        $this->assertSame(1, Tenancy::as($s['i'], fn () => RoutineBlock::count()));
    }
}
