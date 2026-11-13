<?php

namespace Tests\Feature\Homework;

use App\Jobs\SendSmsJob;
use App\Models\{AuditLog, Homework};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D212 HW.1: a teacher gives homework only for a subject they teach (the admin names the teacher), with an optional file on the private
// disk; the target's students and parents get an in-app notice, guardian phones one `homework_new` SMS each (off -> none); a student
// sees their target's homework and the file, another batch's student does not; a parent their child's; edit / delete own only.
class HomeworkTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_give_see_file_and_sms(): void
    {
        Storage::fake('private');
        $this->travelTo('2026-11-13 10:00:00');
        $s = $this->school('hw');   // Karim teaches Bangla (Class 10); Mine in A, Sister in B, Other in A; Mine and Sister share a guardian phone
        Queue::fake();
        $h = $s['host'];
        $karim = $s['karimUser'];
        $body = ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'title' => 'রচনা: আমার বিদ্যালয়', 'description' => '২০০ শব্দ', 'due_date' => '2026-11-20'];

        $this->api('POST', $h, 'homework', $karim, ['subject_id' => $s['physics']->id] + $body)->assertForbidden();   // not his subject
        $this->api('POST', $h, 'homework', $karim, ['teacher_id' => 1] + $body)->assertStatus(422);                     // a teacher cannot name another
        $r = $this->post("http://{$h}/api/v1/homework", $body + ['file' => UploadedFile::fake()->create('task.pdf', 200, 'application/pdf')],
            ['Authorization' => 'Bearer ' . $karim->createToken('t')->plainTextToken, 'Accept' => 'application/json'])->assertCreated();
        $id = $r->json('data.id');
        $this->assertTrue($r->json('data.has_file'));
        Tenancy::as($s['i'], fn () => Storage::disk('private')->assertExists(Homework::find($id)->file_path));

        // batch A only: Mine and Other (and their parents) are told; one SMS per guardian phone of the target
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'homework_new' && $j->phone === '01711000001');
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'homework_new' && $j->phone === '01711000002');
        Queue::assertPushed(SendSmsJob::class, 2);
        $this->assertSame(1, $s['parent']->notifications()->where('data->type', 'homework_new')->count());

        // the student of batch A sees it and the file; the parent too; another program's student would not
        $mineUser = Tenancy::as($s['i'], fn () => $s['mine']->user);
        $mineUser->forceFill(['must_change_password' => false])->save();
        $this->assertSame([$id], array_column($this->api('GET', $h, 'student/homework', $mineUser)->assertOk()->json('data'), 'id'));
        $this->api('GET', $h, "homework/{$id}/file", $mineUser)->assertOk();
        $this->assertSame([$id], array_column($this->api('GET', $h, "parent/homework?student_id={$s['mine']->id}", $s['parent'])->assertOk()->json('data'), 'id'));
        $this->assertSame([], $this->api('GET', $h, "parent/homework?student_id={$s['sister']->id}", $s['parent'])->assertOk()->json('data'));   // batch B
        $this->api('GET', $h, "parent/homework?student_id={$s['other']->id}", $s['parent'])->assertNotFound();                                   // not her child
        $sisterUser = Tenancy::as($s['i'], fn () => $s['sister']->user);
        $sisterUser->forceFill(['must_change_password' => false])->save();
        $this->api('GET', $h, "homework/{$id}", $sisterUser)->assertNotFound();

        // edit and delete: its teacher or the admin; another teacher gets 404
        $this->api('PUT', $h, "homework/{$id}", $s['otherUser'], ['title' => 'x'])->assertNotFound();
        $this->api('PUT', $h, "homework/{$id}", $karim, ['title' => 'রচনা: আমার গ্রাম'])->assertOk()->assertJsonPath('data.title', 'রচনা: আমার গ্রাম');
        $this->assertCount(1, $this->api('GET', $h, 'homework', $karim)->json('data'));
        $this->assertCount(0, $this->api('GET', $h, 'homework', $s['otherUser'])->json('data'));

        // the admin gives one naming the teacher; the SMS event off -> no SMS, the in-app notice still goes
        $s['i']->forceFill(['settings' => array_replace($s['i']->settings ?? [], ['sms_events' => ['homework_new' => 'off']])])->save();
        $karimTeacher = Tenancy::as($s['i'], fn () => \App\Models\Teacher::where('user_id', $karim->id)->value('id'));
        $this->api('POST', $h, 'homework', $s['admin'], ['teacher_id' => $karimTeacher, 'batch_id' => null] + $body)->assertCreated();
        Queue::assertPushed(SendSmsJob::class, 2);
        $this->assertSame(2, $s['parent']->notifications()->where('data->type', 'homework_new')->count());

        $this->api('DELETE', $h, "homework/{$id}", $s['admin'])->assertOk();
        Tenancy::as($s['i'], function () use ($id) {
            $this->assertNotNull(Homework::withTrashed()->find($id)->deleted_at);
            $this->assertSame(['homework.created', 'homework.updated', 'homework.created', 'homework.deleted'], AuditLog::where('action', 'like', 'homework.%')->orderBy('id')->pluck('action')->all());
        });
        $this->api('GET', $h, 'homework', $this->makeUser($s['i'], 'accountant'))->assertForbidden();
    }
}
