<?php

namespace Tests\Feature\Exams;

use App\Models\{ExamPaper, ExamSubject, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, Result, User};
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
            $this->assertSame($paper, $physics['papers'][0]['qb_paper_id']);
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

    /** D159 (1): a final paper of two subject blocks - Math 2 MCQ x 1 mark, Physics 3 MCQ x 1 mark */
    private function blockPaper(array $s): int
    {
        $super = User::firstOrCreate(['phone' => '01700000099'], ['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $items = [];
        foreach (['গণিত' => 2, 'পদার্থবিজ্ঞান' => 3] as $name => $n) {
            $subject = QbSubject::firstOrCreate(['name_bn' => $name], ['name_en' => $name])->id;
            for ($k = 0; $k < $n; $k++) {
                $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => 'q' . uniqid(), 'status' => 'published', 'created_by' => $super->id]);
                foreach ([true, false, false, false] as $o => $ok) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => "o{$o}", 'is_correct' => $ok]);
                Tenancy::as($s['i'], fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $s['admin']->id, 'price' => '0.00', 'reason' => 'free']));
                $items[] = ['qb_question_id' => $q->id, 'marks' => '1'];
            }
        }
        $id = $this->api('POST', $s['host'], 'question-bank/papers', $s['admin'], ['title' => 'Class test', 'sets_count' => 1, 'sections' => [['title' => 'MCQ', 'items' => $items]]])->assertCreated()->json('data.id');
        $this->api('POST', $s['host'], "question-bank/papers/{$id}/finalize", $s['admin'], ['strategy' => 'serial'])->assertOk();
        return $id;
    }

    public function test_a_multi_subject_paper_links_by_block_and_one_subject_takes_several_papers(): void
    {
        $s = $this->school('exampaper4');
        $exam = $this->exam($s);
        $class = $this->blockPaper($s);
        $physicsBlock = QbSubject::where('name_bn', 'পদার্থবিজ্ঞান')->value('id');
        $url = "exams/{$exam}/subjects/{$s['physics']->id}/paper";
        $this->api('PUT', $s['host'], $url, $s['admin'], ['qb_paper_id' => $class])->assertStatus(422)->assertJsonPath('error', 'exam_paper_pick_block');
        $rows = $this->api('PUT', $s['host'], $url, $s['admin'], ['qb_paper_id' => $class, 'qb_subject_id' => $physicsBlock])->assertOk()->json('data');
        $physics = collect($rows)->firstWhere('subject_id', $s['physics']->id);
        $this->assertEquals([['key' => 'mcq', 'full' => 3]], array_map(fn ($c) => ['key' => $c['key'], 'full' => $c['full']], $physics['components']), 'only the physics block counts');
        $this->assertSame('পদার্থবিজ্ঞান', $physics['papers'][0]['block']);
        $this->api('PUT', $s['host'], $url, $s['admin'], ['qb_paper_id' => $class, 'qb_subject_id' => $physicsBlock])->assertStatus(422)->assertJsonPath('error', 'exam_paper_already_linked');

        // D159 (2): the written paper joins the MCQ block - parts are the union, MCQ adds up with the written paper's MCQ
        $rows = $this->api('PUT', $s['host'], $url, $s['admin'], ['qb_paper_id' => $this->paper($s)])->assertOk()->json('data');
        $physics = collect($rows)->firstWhere('subject_id', $s['physics']->id);
        $this->assertEquals(['mcq' => 33, 'cq' => 50, 'short' => 20], array_column($physics['components'], 'full', 'key'));
        $this->assertEquals(103, (float) $physics['full_marks']);
        $this->assertCount(2, $physics['papers']);

        $rows = $this->api('DELETE', $s['host'], $url . '?link_id=' . $physics['papers'][0]['id'], $s['admin'])->assertOk()->json('data');
        $this->assertEquals(['mcq' => 30, 'cq' => 50, 'short' => 20], array_column(collect($rows)->firstWhere('subject_id', $s['physics']->id)['components'], 'full', 'key'), 'one link removed, the other stays');
    }
}
