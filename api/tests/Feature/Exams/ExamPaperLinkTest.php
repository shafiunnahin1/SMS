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

    private function paper(array $s, string $status = 'final'): int
    {
        $super = User::firstOrCreate(['phone' => '01700000099'], ['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $mcqType = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $creType = QbQuestionType::firstOrCreate(['slug' => 'creative'], ['name_bn' => 'সৃজনশীল', 'name_en' => 'Creative', 'family' => 'creative'])->id;
        $shortType = QbQuestionType::firstOrCreate(['slug' => 'short'], ['name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $subject = QbSubject::firstOrCreate(['name_bn' => 'পদার্থবিজ্ঞান'], ['name_en' => 'Physics'])->id;
        $q = fn ($type) => QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => 'q' . uniqid(), 'status' => 'published', 'created_by' => $super->id]);
        $mcq = $q($mcqType);
        foreach ([true, false, false, false] as $n => $ok) QbQuestionOption::create(['qb_question_id' => $mcq->id, 'label' => 'x', 'content_text' => "o{$n}", 'is_correct' => $ok]);
        $cq = $q($creType);
        QbCreativePart::create(['qb_question_id' => $cq->id, 'part_label' => 'ক', 'cognitive_level' => 'knowledge', 'marks' => 1, 'question_text' => 'x']);
        $short = $q($shortType);
        Tenancy::as($s['i'], function () use ($s, $mcq, $cq, $short) {
            foreach ([$mcq, $cq, $short] as $x) QbUnlock::create(['item_type' => 'question', 'item_id' => $x->id, 'unlocked_by' => $s['admin']->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $id = $this->api('POST', $s['host'], 'question-bank/papers', $s['admin'], ['title' => 'Physics paper', 'sets_count' => 1, 'sections' => [
            ['title' => 'MCQ', 'items' => [['qb_question_id' => $mcq->id, 'marks' => '30']]],
            ['title' => 'CQ', 'items' => [['qb_question_id' => $cq->id, 'marks' => '50']]],
            ['title' => 'Short', 'items' => [['qb_question_id' => $short->id, 'marks' => '20']]],
        ]])->assertCreated()->json('data.id');
        if ($status === 'final') $this->api('POST', $s['host'], "question-bank/papers/{$id}/finalize", $s['admin'], ['strategy' => 'serial'])->assertOk();
        return $id;
    }

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
