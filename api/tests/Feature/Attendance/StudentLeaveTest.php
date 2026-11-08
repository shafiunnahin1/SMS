<?php

namespace Tests\Feature\Attendance;

use App\Jobs\NotifyAbsentParentsJob;
use App\Models\{Attendance, AuditLog, Batch, ExamSubject, StudentLeaveRequest, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D197 AAD.3 (academics-advanced.md section 8 StudentLeaveTest): the parent asks only for their own child; the class teacher decides
// up to max_days_auto, above it the admin; approved leave is the attendance default and sends no absent SMS; already-taken absences
// are offered for correction, not changed; an exam on the dates is warned; the doctor's note is a private signed link.
class StudentLeaveTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_request_decide_and_attendance(): void
    {
        Storage::fake('private');
        $s = $this->school('lv');
        $h = $s['host'];
        Tenancy::as($s['i'], fn () => Batch::whereKey($s['a']->id)->update(['teacher_id' => Teacher::where('user_id', $s['karimUser']->id)->value('id')]));
        $exam = $this->exam($s);
        Tenancy::as($s['i'], fn () => ExamSubject::where('exam_id', $exam)->update(['exam_date' => now()->addDays(2)->toDateString()]));
        $today = now()->toDateString();

        // an absence already taken today (before the leave is approved)
        Queue::fake([NotifyAbsentParentsJob::class]);
        $this->api('POST', $h, 'attendance', $s['admin'], ['batch_id' => $s['a']->id, 'date' => $today, 'records' => [['student_id' => $s['mine']->id, 'status' => 'absent']]])->assertCreated();

        // the parent: own child only; the note is stored privately; an exam inside the dates is warned
        $this->api('POST', $h, "parent/children/{$s['other']->id}/leave-requests", $s['parent'], ['from_date' => $today, 'to_date' => $today, 'reason' => 'x'])->assertNotFound();
        $short = $this->api('POST', $h, "parent/children/{$s['mine']->id}/leave-requests", $s['parent'], ['from_date' => $today, 'to_date' => now()->addDay()->toDateString(),
            'reason' => 'Fever', 'attachment' => UploadedFile::fake()->create('note.pdf', 100, 'application/pdf')])->assertCreated()->json('data');
        $this->assertSame([2, 'pending', []], [$short['total_days'], $short['status'], $short['exam_clash']]);
        $this->assertStringNotContainsString('/storage/', (string) $short['attachment_url']);
        Storage::disk('private')->assertExists(Tenancy::as($s['i'], fn () => StudentLeaveRequest::find($short['id'])->attachment));
        $this->api('POST', $h, "parent/children/{$s['mine']->id}/leave-requests", $s['parent'], ['from_date' => $today, 'to_date' => $today, 'reason' => 'again'])
            ->assertStatus(422)->assertJsonPath('error', 'leave_overlap');
        $this->api('POST', $h, "parent/children/{$s['mine']->id}/leave-requests", $s['parent'], ['from_date' => $today, 'to_date' => $today, 'reason' => 'x',
            'attachment' => UploadedFile::fake()->create('x.exe', 10)])->assertStatus(422);
        $long = $this->api('POST', $h, "parent/children/{$s['sister']->id}/leave-requests", $s['parent'], ['from_date' => now()->addDay()->toDateString(), 'to_date' => now()->addDays(5)->toDateString(),
            'reason' => 'Village'])->assertCreated()->json('data');
        $this->assertCount(2, $long['exam_clash']);
        $this->assertCount(2, $this->api('GET', $h, 'parent/leave-requests', $s['parent'])->assertOk()->json('data'));

        // the class teacher sees their batch only and decides up to 3 days; the long one is the admin's
        $list = $this->api('GET', $h, 'leave-requests/students?status=pending', $s['karimUser'])->assertOk()->json('data');
        $this->assertSame([$short['id']], array_column($list, 'id'));
        $this->api('PATCH', $h, "leave-requests/students/{$long['id']}", $s['karimUser'], ['status' => 'approved'])->assertNotFound();
        $this->api('PATCH', $h, "leave-requests/students/{$short['id']}", $s['otherUser'], ['status' => 'approved'])->assertNotFound();
        $ok = $this->api('PATCH', $h, "leave-requests/students/{$short['id']}", $s['karimUser'], ['status' => 'approved', 'note' => 'Get well'])->assertOk()->json('data');
        $this->assertSame('approved', $ok['status']);
        $this->assertSame([$today], array_column($ok['absent_to_correct'], 'date'));
        $this->assertSame('absent', Tenancy::as($s['i'], fn () => Attendance::where('student_id', $s['mine']->id)->value('status')));   // not changed for them
        $this->api('PATCH', $h, "leave-requests/students/{$short['id']}", $s['karimUser'], ['status' => 'rejected'])->assertStatus(422)->assertJsonPath('error', 'leave_decided');
        $this->assertTrue(Tenancy::as($s['i'], fn () => AuditLog::where('action', 'student_leave.approved')->exists()));
        $this->assertSame(1, $s['parent']->fresh()->notifications()->where('data->type', 'student_leave')->count());

        $this->api('PATCH', $h, "leave-requests/students/{$long['id']}", $s['admin'], ['status' => 'rejected'])->assertOk();

        // tomorrow: the sheet says leave by default; saving them absent sends no absent SMS (the other student still gets one)
        $tomorrow = now()->addDay()->toDateString();
        $this->travel(1)->days();
        $rows = collect($this->api('GET', $h, "attendance?batch_id={$s['a']->id}&date={$tomorrow}", $s['karimUser'])->assertOk()->json('data.rows'))->keyBy('student_id');
        $this->assertSame(['leave', true], [$rows[$s['mine']->id]['status'], $rows[$s['mine']->id]['on_leave']]);
        $this->assertNull($rows[$s['other']->id]['status']);
        Queue::fake([NotifyAbsentParentsJob::class]);
        $this->api('POST', $h, 'attendance', $s['karimUser'], ['batch_id' => $s['a']->id, 'date' => $tomorrow, 'records' => [
            ['student_id' => $s['mine']->id, 'status' => 'absent'], ['student_id' => $s['other']->id, 'status' => 'absent']]])->assertCreated();
        Queue::assertPushed(NotifyAbsentParentsJob::class, fn ($j) => (new \ReflectionProperty($j, 'studentIds'))->getValue($j) === [$s['other']->id]);
    }
}
