<?php

namespace Tests\Feature\Exams;

use App\Models\{ExamPaper, ExamSubject, QbCreativePart, QbPrice, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, Result, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D158 (3)(4): an exam subject links one FINAL question paper of its institution (a paper may serve many exams); the subject's mark
// parts follow the paper's kinds of question (MCQ / creative / short) with the paper's marks; no change once marks exist or after
// publishing; another institution's paper is 404.
class ExamPaperLinkTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_a_final_paper_sets_the_mark_parts_and_serves_many_exams(): void
    {
        $s = $this->school('exampaper1');
        $paper = $this->paper($s);
        $first = $this->exam($s);
        $second = $this->exam($s, 'Test 2');
        foreach ([$first, $second] as $exam) {
            $rows = $this->api('PUT', $s['host'], "exams/{$exam}/subjects/{$s['physics']->id}/paper", $s['admin'], ['qb_paper_id' => $paper])->assertOk()->json('data');
            $physics = collect($rows)->firstWhere('subject_id', $s['physics']->id);
            $this->assertSame(['mcq', 'cq', 'short'], array_column($physics['components'], 'key'), 'one field per kind of question');
            $this->assertEquals([30, 50, 20], array_column($physics['components'], 'full'));
            $this->assertEquals(100, (float) $physics['full_marks']);
            $this->assertSame($paper, $physics['paper']['qb_paper_id']);
        }
        $this->assertSame(2, Tenancy::as($s['i'], fn () => ExamPaper::where('qb_paper_id', $paper)->count()), 'one paper, two exams');

        $this->api('DELETE', $s['host'], "exams/{$first}/subjects/{$s['physics']->id}/paper", $s['admin'])->assertOk();
        $this->assertNull(Tenancy::as($s['i'], fn () => ExamSubject::where('exam_id', $first)->where('subject_id', $s['physics']->id)->value('components')));
    }

    public function test_draft_papers_marked_subjects_published_exams_and_other_schools_are_refused(): void
    {
        $s = $this->school('exampaper2');
        $exam = $this->exam($s);
        $url = "exams/{$exam}/subjects/{$s['physics']->id}/paper";
        $this->api('PUT', $s['host'], $url, $s['admin'], ['qb_paper_id' => $this->paper($s, 'draft')])->assertStatus(422)->assertJsonPath('error', 'exam_paper_not_final');

        $other = $this->school('exampaper3');
        $this->api('PUT', $s['host'], $url, $s['admin'], ['qb_paper_id' => $this->paper($other)])->assertNotFound();
        $this->api('PUT', $s['host'], $url, $s['karimUser'], ['qb_paper_id' => $this->paper($s)])->assertForbidden();

        Tenancy::as($s['i'], fn () => Result::create(['exam_id' => $exam, 'student_id' => $s['mine']->id, 'subject_id' => $s['physics']->id, 'marks_obtained' => 50]));
        $this->api('PUT', $s['host'], $url, $s['admin'], ['qb_paper_id' => $this->paper($s)])->assertStatus(422)->assertJsonPath('error', 'exam_paper_has_marks');
    }
}
