<?php

namespace Tests\Feature\Exams;

use App\Models\{BatchTeacher, ExamSubject, Result, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "ExamSubjectsTest" (R1 part; admit cards are a later release): creating an exam copies every subject of the
// program; parts must add up; a changed scale re-grades saved marks; published exams are closed. Plus Step 4.5 Done When: a
// teacher enters marks only for their own subject (a batch subject teacher only for their batch).
class ExamSubjectsTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_an_exam_gets_every_subject_of_its_program_and_parts_must_add_up(): void
    {
        $s = $this->school('exs');
        $id = $this->api('POST', $s['host'], 'exams', $s['admin'], ['name' => 'Test 1', 'program_id' => $s['p']->id, 'exam_type' => 'weekly', 'academic_year' => 2026])
            ->assertCreated()->assertJsonPath('data.subjects_count', 2)->assertJsonPath('data.status', 'upcoming')->json('data.id');
        $rows = $this->api('GET', $s['host'], "exams/{$id}/subjects", $s['admin'])->assertOk()->json('data');
        $this->assertSame([['বাংলা', '100.00', '33.00'], ['পদার্থবিজ্ঞান', '100.00', '33.00']], array_map(fn ($r) => [$r['name'], $r['full_marks'], $r['pass_marks']], $rows));

        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [['subject_id' => $s['physics']->id, 'full_marks' => 100, 'pass_marks' => 33,
            'components' => [['key' => 'written', 'label' => 'লিখিত', 'full' => 60, 'pass' => 20], ['key' => 'mcq', 'label' => 'MCQ', 'full' => 30, 'pass' => 10]]]]])
            ->assertStatus(422)->assertJsonPath('error', 'components_total');
        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [['subject_id' => $s['bangla']->id, 'full_marks' => 25, 'pass_marks' => 30]]])
            ->assertStatus(422);
        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [['subject_id' => $s['bangla']->id, 'full_marks' => 25, 'pass_marks' => 9,
            'exam_date' => '2026-11-02', 'start_time' => '10:00', 'end_time' => '11:00', 'room' => '201']]])
            ->assertOk()->assertJsonPath('data.0.full_marks', '25.00')->assertJsonPath('data.0.start_time', '10:00');
        $this->api('PUT', $s['host'], "exams/{$id}", $s['admin'], ['name' => 'Test 1', 'exam_type' => 'weekly', 'academic_year' => 2026, 'program_id' => 99])->assertStatus(422);
        $this->api('POST', $s['host'], 'exams', $s['karimUser'], ['name' => 'X', 'program_id' => $s['p']->id, 'exam_type' => 'term', 'academic_year' => 2026])->assertForbidden();
    }

    public function test_a_changed_scale_regrades_and_a_published_exam_is_closed(): void
    {
        $s = $this->school('exr');
        $id = $this->exam($s);
        $this->api('POST', $s['host'], "exams/{$id}/publish", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'no_results');
        $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $id, 'subject_id' => $s['bangla']->id,
            'rows' => [['student_id' => $s['mine']->id, 'marks_obtained' => 40]]])->assertOk()->assertJsonPath('data.0.grade', 'C');
        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [['subject_id' => $s['bangla']->id, 'full_marks' => 50, 'pass_marks' => 17]]])->assertOk();
        $this->assertSame(['80.00', 'A+'], Tenancy::as($s['i'], fn () => [Result::first()->percentage, Result::first()->grade]), '40 of 50 is now 80%');
        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [['subject_id' => $s['bangla']->id, 'full_marks' => 30, 'pass_marks' => 10]]])
            ->assertStatus(422);                                   // 40 saved marks do not fit 30: nothing changes
        $this->assertSame('50.00', Tenancy::as($s['i'], fn () => ExamSubject::where('subject_id', $s['bangla']->id)->value('full_marks')));
        $this->api('DELETE', $s['host'], "exams/{$id}", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'in_use');

        $this->api('POST', $s['host'], "exams/{$id}/publish", $s['admin'])->assertOk()->assertJsonPath('data.status', 'published');
        $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $id, 'subject_id' => $s['bangla']->id,
            'rows' => [['student_id' => $s['mine']->id, 'marks_obtained' => 45]]])->assertStatus(422)->assertJsonPath('error', 'exam_published');
        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [['subject_id' => $s['bangla']->id, 'full_marks' => 50, 'pass_marks' => 20]]])
            ->assertStatus(422)->assertJsonPath('error', 'exam_published');
        $rid = Tenancy::as($s['i'], fn () => Result::value('id'));
        $this->api('PUT', $s['host'], "results/{$rid}", $s['karimUser'], ['marks_obtained' => 45])->assertStatus(422)->assertJsonPath('error', 'exam_published');
        $this->api('PUT', $s['host'], "results/{$rid}", $s['admin'], ['marks_obtained' => 45])->assertOk()->assertJsonPath('data.grade', 'A+');

        $empty = $this->api('POST', $s['host'], 'exams', $s['admin'], ['name' => 'Spare', 'program_id' => $s['p']->id, 'exam_type' => 'term', 'academic_year' => 2026])->json('data.id');
        $this->api('DELETE', $s['host'], "exams/{$empty}", $s['admin'])->assertOk();
        $this->assertSame(0, Tenancy::as($s['i'], fn () => ExamSubject::where('exam_id', $empty)->count()));
    }

    public function test_a_teacher_enters_marks_only_for_their_own_subject(): void
    {
        $s = $this->school('exe');
        $id = $this->exam($s);
        $karim = $s['karimUser'];
        $other = $s['otherUser'];

        // Karim is Bangla's subject teacher: every student of the exam
        $sheet = $this->api('GET', $s['host'], "exams/{$id}/subjects/{$s['bangla']->id}/entry", $karim)->assertOk();
        $this->assertSame(['Mine', 'Other', 'Sister'], collect($sheet->json('data.rows'))->pluck('name')->sort()->values()->all());
        $this->api('GET', $s['host'], "exams/{$id}/subjects/{$s['physics']->id}/entry", $karim)->assertForbidden();
        $this->api('POST', $s['host'], 'results/bulk', $karim, ['exam_id' => $id, 'subject_id' => $s['physics']->id,
            'rows' => [['student_id' => $s['mine']->id, 'components' => ['written' => 60, 'mcq' => 20]]]])->assertForbidden();
        $this->assertSame([], collect($this->api('GET', $s['host'], 'results', $karim)->json('data.0.subjects'))->where('name', 'পদার্থবিজ্ঞান')->all());

        // the other teacher teaches Physics only in section B: only Sister
        Tenancy::as($s['i'], fn () => BatchTeacher::create(['batch_id' => $s['b']->id, 'teacher_id' => Teacher::where('user_id', $other->id)->value('id'), 'subject_id' => $s['physics']->id]));
        $rows = $this->api('GET', $s['host'], "exams/{$id}/subjects/{$s['physics']->id}/entry", $other)->assertOk()->json('data.rows');
        $this->assertSame(['Sister'], array_column($rows, 'name'));
        $this->api('POST', $s['host'], 'results/bulk', $other, ['exam_id' => $id, 'subject_id' => $s['physics']->id,
            'rows' => [['student_id' => $s['mine']->id, 'components' => ['written' => 60, 'mcq' => 20]]]])->assertStatus(422)->assertJsonPath('error', 'not_in_exam');
        $this->api('POST', $s['host'], 'results/bulk', $other, ['exam_id' => $id, 'subject_id' => $s['physics']->id,
            'rows' => [['student_id' => $s['sister']->id, 'components' => ['written' => 65, 'mcq' => 8]]]])
            ->assertOk()->assertJsonPath('data.0.marks_obtained', '73.00')->assertJsonPath('data.0.grade', 'F');   // MCQ under 10 fails
        $this->api('POST', $s['host'], 'results/bulk', $karim, ['exam_id' => $id, 'subject_id' => $s['bangla']->id,
            'rows' => [['student_id' => $s['other']->id, 'marks_obtained' => 101]]])->assertStatus(422);
        $this->assertSame(1, Tenancy::as($s['i'], fn () => Result::count()));

        $foreign = $this->school('exe2');
        $foreignExam = $this->exam($foreign);
        $this->api('GET', $s['host'], "exams/{$foreignExam}/subjects/{$foreign['bangla']->id}/entry", $s['admin'])->assertNotFound();
        $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $foreignExam, 'subject_id' => $foreign['bangla']->id,
            'rows' => [['student_id' => $foreign['mine']->id, 'marks_obtained' => 50]]])->assertNotFound();
    }
}
