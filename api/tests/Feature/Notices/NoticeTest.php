<?php

namespace Tests\Feature\Notices;

use App\Models\{Batch, BatchTeacher, Enrollment, Notice, NoticeReceipt, ParentStudent, Program, Student, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D193 NTC.1 (communication-plus.md §৫ NoticeScheduleTest / NoticeAckTest, academic-structure.md "Targeting Rule"): the admin
// writes notices; each reader sees only the notices meant for them (group + program/batch), a future one stays hidden, opening
// marks it read, the acknowledge button records it once, and the admin's report lists who read / acknowledged.
class NoticeTest extends TestCase
{
    use RefreshDatabase;

    private function school(): array
    {
        $i = $this->makeInstitution('ntc-school');
        $admin = $this->makeUser($i, 'admin');
        return Tenancy::as($i, function () use ($i, $admin) {
            $p6 = Program::create(['name' => 'Class 6']);
            $p7 = Program::create(['name' => 'Class 7']);
            $a6 = Batch::create(['program_id' => $p6->id, 'name' => 'A']);
            $b6 = Batch::create(['program_id' => $p6->id, 'name' => 'B']);
            $a7 = Batch::create(['program_id' => $p7->id, 'name' => 'A']);
            $su = User::create(['institution_id' => $i->id, 'name' => 'Stu', 'username' => 'NTC-S1', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
            $student = Student::create(['user_id' => $su->id, 'student_id' => 'NTC-S1', 'name' => 'Stu', 'guardian_phone' => '01711000001']);
            Enrollment::create(['student_id' => $student->id, 'program_id' => $p6->id, 'batch_id' => $a6->id, 'is_primary' => true, 'status' => 'active', 'enrolled_at' => now()->toDateString()]);
            $parent = User::create(['institution_id' => $i->id, 'name' => 'Par', 'phone' => '01711000002', 'role' => 'parent', 'password' => 'Parent-pass-26', 'is_active' => true]);
            ParentStudent::create(['parent_user_id' => $parent->id, 'student_id' => $student->id, 'is_primary' => true]);
            $tu = $this->makeUser($i, 'teacher');
            $teacher = Teacher::create(['user_id' => $tu->id, 'employee_id' => 'NTC-T1', 'status' => 'active']);
            BatchTeacher::create(['batch_id' => $a7->id, 'teacher_id' => $teacher->id]);
            return compact('i', 'admin', 'p6', 'p7', 'a6', 'b6', 'a7', 'su', 'parent', 'tu');
        });
    }

    public function test_targeting_scheduling_read_ack_and_report(): void
    {
        $s = $this->school();
        $host = $this->hostOf($s['i']);
        $post = fn (array $f) => $this->api('POST', $host, 'notices', $s['admin'], $f + ['content' => 'Body'])->assertCreated()->json('data.id');
        $all = $post(['title' => 'Holiday', 'target' => 'all', 'require_ack' => true, 'ack_deadline' => now()->addDays(3)->toDateString()]);
        $class6 = $post(['title' => 'Class 6 parents', 'target' => 'parents', 'program_id' => $s['p6']->id]);
        $sixB = $post(['title' => '6B only', 'target' => 'students', 'program_id' => $s['p6']->id, 'batch_id' => $s['b6']->id]);
        $teachers7 = $post(['title' => 'Class 7 teachers', 'target' => 'teachers', 'program_id' => $s['p7']->id]);
        $later = $post(['title' => 'Tomorrow', 'target' => 'all', 'published_at' => now()->addDay()->toIso8601String()]);

        $titles = fn (User $u) => collect($this->api('GET', $host, 'notices', $u)->assertOk()->json('data'))->pluck('title')->sort()->values()->all();
        $this->assertSame(['Holiday'], $titles($s['su']));                                     // not 6B, not the parents' one, not tomorrow's
        $this->assertSame(['Class 6 parents', 'Holiday'], $titles($s['parent']));
        $this->assertSame(['Class 7 teachers', 'Holiday'], $titles($s['tu']));
        $this->assertCount(5, $this->api('GET', $host, 'notices', $s['admin'])->json('data'));     // the admin sees everything, scheduled too
        $this->api('GET', $host, "notices/{$later}", $s['su'])->assertNotFound();
        $this->api('GET', $host, "notices/{$sixB}", $s['su'])->assertNotFound();

        $this->api('GET', $host, "notices/{$all}", $s['su'])->assertOk()->assertJsonPath('data.acknowledged_at', null);
        $this->assertNotNull(Tenancy::as($s['i'], fn () => NoticeReceipt::where('user_id', $s['su']->id)->value('read_at')));
        $first = $this->api('POST', $host, "notices/{$all}/ack", $s['su'])->assertOk()->json('data.acknowledged_at');
        $this->travel(1)->minutes();
        $this->assertSame($first, $this->api('POST', $host, "notices/{$all}/ack", $s['su'])->assertOk()->json('data.acknowledged_at'));   // once
        $this->api('POST', $host, "notices/{$class6}/ack", $s['parent'])->assertStatus(422);         // no ack asked
        $this->assertSame(1, Tenancy::as($s['i'], fn () => NoticeReceipt::where('notice_id', $all)->count()));

        $report = $this->api('GET', $host, "notices/{$all}/receipts", $s['admin'])->assertOk()->json('data');
        $this->assertSame([3, 1, 1, false], [$report['total'], $report['read'], $report['acknowledged'], $report['overdue']]);   // student, parent, teacher
        $this->travel(5)->days();
        $this->assertTrue($this->api('GET', $host, "notices/{$all}/receipts", $s['admin'])->json('data.overdue'));
        $this->api('GET', $host, "notices/{$all}/receipts", $s['su'])->assertForbidden();
        $this->api('POST', $host, 'notices', $s['tu'], ['title' => 'x', 'content' => 'y', 'target' => 'all'])->assertForbidden();
        unset($teachers7);
    }

    public function test_validation_edit_soft_delete_and_other_institution(): void
    {
        $s = $this->school();
        $host = $this->hostOf($s['i']);
        $other = $this->makeInstitution('ntc-other');
        $otherBatch = Tenancy::as($other, fn () => Batch::create(['program_id' => Program::create(['name' => 'X'])->id, 'name' => 'A']));
        $this->api('POST', $host, 'notices', $s['admin'], ['title' => 'x', 'content' => 'y', 'target' => 'all', 'batch_id' => $otherBatch->id, 'program_id' => $otherBatch->program_id])->assertStatus(422);
        $this->api('POST', $host, 'notices', $s['admin'], ['title' => 'x', 'content' => 'y', 'target' => 'all', 'program_id' => $s['p6']->id, 'batch_id' => $s['a7']->id])->assertStatus(422);   // batch of another program
        $this->api('POST', $host, 'notices', $s['admin'], ['title' => 'x', 'content' => 'y', 'target' => 'all', 'require_ack' => true])->assertStatus(422);   // deadline needed
        $this->api('POST', $host, 'notices', $s['admin'], ['title' => 'x', 'content' => 'y', 'target' => 'all', 'created_by' => 999])->assertStatus(422);

        $id = $this->api('POST', $host, 'notices', $s['admin'], ['title' => 'Old', 'content' => 'y', 'target' => 'all'])->assertCreated()->json('data.id');
        $this->api('PUT', $host, "notices/{$id}", $s['admin'], ['title' => 'New'])->assertOk()->assertJsonPath('data.title', 'New');
        $this->api('DELETE', $host, "notices/{$id}", $s['admin'])->assertOk();
        $this->api('GET', $host, "notices/{$id}", $s['su'])->assertNotFound();
        $this->assertNotNull(Tenancy::as($s['i'], fn () => Notice::withTrashed()->find($id)?->deleted_at));    // soft deleted, kept

        $theirs = Tenancy::as($other, fn () => Notice::create(['title' => 'Theirs', 'content' => 'z', 'target' => 'all'])->id);
        $this->api('GET', $host, "notices/{$theirs}", $s['admin'])->assertNotFound();
        $this->api('GET', $host, "notices/{$theirs}/receipts", $s['admin'])->assertNotFound();
        $this->assertNotContains('Theirs', collect($this->api('GET', $host, 'notices', $s['admin'])->json('data'))->pluck('title')->all());
    }
}
