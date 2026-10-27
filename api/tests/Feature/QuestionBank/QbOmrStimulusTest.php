<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbOmrForm, QbOmrScan, QbPaper, QbPaperItem, QbPaperSection, QbPaperVariant, QbQuestion, QbQuestionItem, QbQuestionOption, QbQuestionStimulus, QbQuestionType, QbSubject, User};
use App\Services\QuestionBank\QbOmrReviewService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D171 STIM.2: a stimulus MCQ group's children are OMR rows (one per child, after the rows before it); a child whose option count
// differs from the sheet's blocks the form with the usual reason; grading follows the frozen set's child key and gives each child
// its own marks, while ordinary MCQs keep the form's per-question mark and the negative mark applies to every wrong row.
class QbOmrStimulusTest extends TestCase
{
    use RefreshDatabase;

    private int $mcq;
    private int $group;

    protected function setUp(): void
    {
        parent::setUp();
        $super = User::create(['institution_id' => null, 'name' => 'super', 'role' => 'super_admin', 'phone' => '01700000029', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $subject = QbSubject::create(['name_bn' => 'বাংলা', 'name_en' => 'Bangla'])->id;
        $type = fn (string $slug) => QbQuestionType::create(['slug' => $slug, 'name_bn' => $slug, 'name_en' => $slug, 'family' => 'mcq'])->id;
        $make = fn (int $t, string $text) => QbQuestion::create(['qb_question_type_id' => $t, 'qb_subject_id' => $subject, 'question_text' => $text, 'status' => 'published', 'created_by' => $super->id])->id;
        $this->mcq = $make($type('mcq'), 'PLAIN');
        foreach ([0, 1, 2, 3] as $o) QbQuestionOption::create(['qb_question_id' => $this->mcq, 'label' => 'x', 'content_text' => "o{$o}", 'is_correct' => $o === 0, 'sort_order' => $o]);
        $this->group = $make($type('stimulus_mcq_group'), 'Read.');
        $st = QbQuestionStimulus::create(['qb_question_id' => $this->group, 'label' => 'passage', 'content_text' => 'Text', 'sort_order' => 1]);
        foreach ([['C1', 1, '1.00'], ['C2', 3, '2.00']] as $k => [$prompt, $correct, $marks]) {
            QbQuestionItem::create(['qb_question_id' => $this->group, 'qb_question_stimulus_id' => $st->id, 'item_type' => 'sub_mcq', 'prompt_text' => $prompt,
                'prompt_json' => ['options' => ['a', 'b', 'c', 'd']], 'answer_json' => ['correct' => $correct], 'marks' => $marks, 'sort_order' => $k + 1]);
        }
    }

    /** a final paper: the plain MCQ, then the group; set A frozen with the second child's choices reversed */
    private function paper($institution, User $teacher): int
    {
        return Tenancy::as($institution, function () use ($institution, $teacher) {
            $paper = QbPaper::create(['institution_id' => $institution->id, 'created_by' => $teacher->id, 'title' => 'Stim', 'status' => 'final', 'total_marks' => '4.00']);
            $section = QbPaperSection::create(['institution_id' => $institution->id, 'qb_paper_id' => $paper->id, 'title' => 'MCQ', 'sort_order' => 0]);
            QbPaperItem::create(['institution_id' => $institution->id, 'qb_paper_section_id' => $section->id, 'qb_question_id' => $this->mcq, 'marks' => '1.00', 'sort_order' => 0]);
            QbPaperItem::create(['institution_id' => $institution->id, 'qb_paper_section_id' => $section->id, 'qb_question_id' => $this->group, 'marks' => '3.00', 'sort_order' => 1]);
            QbPaperVariant::create(['qb_paper_id' => $paper->id, 'variant_number' => 1, 'code' => 'A', 'strategy' => 'options', 'layout_json' => [['section_id' => $section->id, 'items' => [
                ['qb_question_id' => $this->mcq, 'marks' => '1.00', 'options' => [0, 1, 2, 3], 'correct' => ['ক']],
                ['qb_question_id' => $this->group, 'marks' => '3.00', 'options' => [], 'children' => [[0, 1, 2, 3], [3, 2, 1, 0]], 'children_correct' => [['খ'], ['ক']], 'correct' => []],
            ]]]]);
            return $paper->id;
        });
    }

    private function settings(int $options = 4): array
    {
        return ['settings' => ['title' => 'OMR', 'roll_digits' => 4, 'option_count' => $options, 'option_language' => 'bangla',
            'info_boxes' => ['class' => true, 'roll' => true, 'subject' => true, 'set' => true], 'page_size' => 'a4', 'page_orientation' => 'portrait',
            'answer_columns' => 'auto', 'question_mark' => '1.00', 'negative_mark_enabled' => true, 'negative_mark' => '0.25', 'multiple_answer_policy' => 'wrong']];
    }

    public function test_children_are_rows_and_are_graded_with_their_own_marks(): void
    {
        $institution = $this->makeInstitution('omr-stim');
        $teacher = $this->makeUser($institution, 'teacher');
        $paperId = $this->paper($institution, $teacher);
        $host = $this->hostOf($institution);
        $this->api('PUT', $host, "question-bank/papers/{$paperId}/omr-form", $teacher, $this->settings())->assertOk();
        $this->api('POST', $host, "question-bank/papers/{$paperId}/omr-form/generate", $teacher)->assertOk();
        $form = Tenancy::as($institution, fn () => QbOmrForm::where('qb_paper_id', $paperId)->firstOrFail());
        $this->assertSame(3, $form->settings_json['question_count'], 'one plain MCQ + two children');

        $grade = fn (array $answers) => Tenancy::as($institution, fn () => app(QbOmrReviewService::class)->grade($form, QbPaper::findOrFail($paperId),
            (new QbOmrScan)->forceFill(['set_code' => 'A', 'answers_json' => array_map(fn ($s) => ['selected' => $s], $answers), 'comparison_json' => []])));

        // row 1 plain (ক = 0, 1 mark), row 2 child one (খ = 1, own 1 mark), row 3 child two reversed (ক = 0 holds choice d, own 2 marks)
        $this->assertSame(['correct' => 3, 'marks' => '4.00', 'set' => 'A', 'per_question' => ['correct', 'correct', 'correct']], $grade([[0], [1], [0]]));
        $this->assertSame('1.75', $grade([[0], [1], [3]])['marks'], 'a wrong child costs the negative mark and earns nothing');
        $this->assertSame('2.75', $grade([[1], [1], [0]])['marks'], 'a wrong plain MCQ: its negative mark, the children their own 1 + 2');
        $this->assertSame(['blank', 'correct', 'blank'], $grade([[], [1], []])['per_question']);
    }

    public function test_a_child_with_another_option_count_blocks_the_form(): void
    {
        $institution = $this->makeInstitution('omr-stim-opts');
        $teacher = $this->makeUser($institution, 'teacher');
        $paperId = $this->paper($institution, $teacher);
        QbQuestionItem::where('qb_question_id', $this->group)->where('prompt_text', 'C2')->update(['prompt_json' => ['options' => ['a', 'b', 'c', 'd', 'e']]]);
        $this->api('PUT', $this->hostOf($institution), "question-bank/papers/{$paperId}/omr-form", $teacher, $this->settings())
            ->assertStatus(422)->assertJsonPath('error', 'qb_omr_option_mismatch');
    }
}
