<?php

namespace Tests\Feature\Homework;

use App\Models\{HomeworkSubmission, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D212 HW.2: a student submits online (text / file), re-submits until graded, late after the due date; the teacher sees every target
// student, marks a paper hand-in, grades with feedback (the student and parents get a notice); another teacher sees nothing; the
// student and the parent see the submissions; the file only for those allowed.
class HomeworkSubmissionTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_submit_paper_grade_and_views(): void
    {
        Storage::fake('private');
        Queue::fake();
        $this->travelTo('2026-11-13 10:00:00');
        $s = $this->school('hws');
        $h = $s['host'];
        $karim = $s['karimUser'];
        $id = $this->api('POST', $h, 'homework', $karim, ['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'title' => 'রচনা', 'due_date' => '2026-11-15'])
            ->assertCreated()->json('data.id');
        [$mine, $other, $sister] = Tenancy::as($s['i'], fn () => array_map(function ($st) { $u = $st->user; $u->forceFill(['must_change_password' => false])->save(); return $u; }, [$s['mine'], $s['other'], $s['sister']]));
        $auth = fn ($u) => ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken, 'Accept' => 'application/json'];

        $this->api('POST', $h, "homework/{$id}/submit", $mine, [])->assertStatus(422)->assertJsonPath('error', 'empty_submission');
        $this->api('POST', $h, "homework/{$id}/submit", $sister, ['text_answer' => 'x'])->assertNotFound();   // batch B: not hers
        // another institution's homework id: 404 (the tenant boundary)
        $o = $this->makeInstitution('hwso');
        $foreign = \App\Support\Tenancy::as($o, function () use ($o) {
            $tu = $this->makeUser($o, 'teacher');
            $t = \App\Models\Teacher::create(['user_id' => $tu->id, 'employee_id' => 'F-1']);
            $p = \App\Models\Program::create(['name' => 'F']);
            $sub = \App\Models\Subject::create(['program_id' => $p->id, 'name' => 'F', 'full_marks' => 100, 'pass_marks' => 33]);
            return \App\Models\Homework::create(['teacher_id' => $t->id, 'program_id' => $p->id, 'subject_id' => $sub->id, 'title' => 'F'])->id;
        });
        $this->api('POST', $h, "homework/{$foreign}/submit", $mine, ['text_answer' => 'x'])->assertNotFound();
        $this->app['auth']->forgetGuards();   // the previous call's user must not carry over to this raw multipart request
        $this->post("http://{$h}/api/v1/homework/{$id}/submit", ['text_answer' => 'আমার বিদ্যালয়...', 'file' => UploadedFile::fake()->image('page.jpg')], $auth($mine))
            ->assertCreated()->assertJsonPath('data.status', 'submitted')->assertJsonPath('data.has_file', true);
        $this->api('POST', $h, "homework/{$id}/submit", $mine, ['text_answer' => 'নতুন লেখা'])->assertCreated()->assertJsonPath('data.text_answer', 'নতুন লেখা');   // replaces

        // after the due date: late
        $this->travelTo('2026-11-16 08:00:00');
        $this->api('POST', $h, "homework/{$id}/submit", $other, ['text_answer' => 'দেরিতে'])->assertCreated()->assertJsonPath('data.status', 'late');

        // the teacher: every target student (Mine, Other) with submissions; marks nobody else on paper; grades
        $list = $this->api('GET', $h, "homework/{$id}/submissions", $karim)->assertOk();
        $this->assertSame([2, 2], [$list->json('meta.submitted'), $list->json('meta.total')]);
        $this->api('POST', $h, "homework/{$id}/paper", $karim, ['student_id' => $s['sister']->id])->assertNotFound();   // not in the target
        $this->api('GET', $h, "homework/{$id}/submissions", $s['otherUser'])->assertNotFound();                          // another teacher
        $mineSub = Tenancy::as($s['i'], fn () => HomeworkSubmission::where('student_id', $s['mine']->id)->first());
        $this->api('POST', $h, "homework/submissions/{$mineSub->id}/grade", $karim, ['grade' => 'A+', 'feedback' => 'চমৎকার'])->assertOk()->assertJsonPath('data.status', 'graded');
        $this->api('POST', $h, "homework/{$id}/submit", $mine, ['text_answer' => 'আবার'])->assertStatus(422)->assertJsonPath('error', 'submission_graded');
        $this->assertSame(1, $s['parent']->notifications()->where('data->type', 'homework_graded')->count());

        // a paper hand-in for a student of a whole-program homework
        $whole = $this->api('POST', $h, 'homework', $karim, ['program_id' => $s['p']->id, 'subject_id' => $s['bangla']->id, 'title' => 'অনুশীলনী'])->assertCreated()->json('data.id');
        $this->api('POST', $h, "homework/{$whole}/paper", $karim, ['student_id' => $s['sister']->id])->assertCreated()->assertJsonPath('data.on_paper', true);

        // the student and the parent see the graded submission; the file: the student, the parent, the teacher - not another student
        $mineRows = $this->api('GET', $h, 'student/homework/submitted', $mine)->assertOk()->json('data');
        $this->assertSame(['graded', 'A+', 'চমৎকার'], [$mineRows[0]['status'], $mineRows[0]['grade'], $mineRows[0]['feedback']]);
        $this->assertCount(1, $this->api('GET', $h, "parent/homework/submitted?student_id={$s['sister']->id}", $s['parent'])->assertOk()->json('data'));
        Tenancy::as($s['i'], fn () => HomeworkSubmission::whereKey($mineSub->id)->update(['file_path' => 'institutions/x/hw.jpg']));
        Storage::disk('private')->put('institutions/x/hw.jpg', 'img');
        $this->api('GET', $h, "homework/submissions/{$mineSub->id}/file", $mine)->assertOk();
        $this->api('GET', $h, "homework/submissions/{$mineSub->id}/file", $s['parent'])->assertOk();
        $this->api('GET', $h, "homework/submissions/{$mineSub->id}/file", $karim)->assertOk();
        $this->api('GET', $h, "homework/submissions/{$mineSub->id}/file", $other)->assertNotFound();
        $this->api('GET', $h, "homework/submissions/{$mineSub->id}/file", $s['otherUser'])->assertNotFound();

        // the form's options: Karim only Bangla (his subject), the admin every subject and the teachers
        $this->assertSame(['বাংলা'], array_column($this->api('GET', $h, 'homework/options', $karim)->assertOk()->json('data.subjects'), 'name'));
        $adminOpts = $this->api('GET', $h, 'homework/options', $s['admin'])->assertOk()->json('data');
        $this->assertCount(2, $adminOpts['subjects']);
        $this->assertCount(2, $adminOpts['teachers']);
    }
}
