<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbPaper, QbPaperItem, QbPaperSection, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QbOmrFormApiTest extends TestCase
{
    use RefreshDatabase;

    private QbQuestion $mcq;

    protected function setUp(): void
    {
        parent::setUp();

        $super = User::create(['institution_id' => null, 'name' => 'super', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $this->mcq = QbQuestion::create([
            'qb_question_type_id' => $type->id,
            'qb_subject_id' => $subject->id,
            'question_text' => '২ + ২ = ?',
            'status' => 'published',
            'created_by' => $super->id,
        ]);
        foreach (['৪' => true, '৩' => false, '৫' => false, '৬' => false] as $text => $correct) {
            QbQuestionOption::create(['qb_question_id' => $this->mcq->id, 'label' => 'x', 'content_text' => $text, 'is_correct' => $correct]);
        }
    }

    private function paper($institution, User $creator, string $status = 'final'): int
    {
        return Tenancy::as($institution, function () use ($institution, $creator, $status) {
            $paper = QbPaper::create(['institution_id' => $institution->id, 'created_by' => $creator->id, 'title' => 'Final assessment', 'status' => $status, 'total_marks' => '1.00']);
            $section = QbPaperSection::create(['institution_id' => $institution->id, 'qb_paper_id' => $paper->id, 'title' => 'MCQ', 'sort_order' => 0]);
            QbPaperItem::create(['institution_id' => $institution->id, 'qb_paper_section_id' => $section->id, 'qb_question_id' => $this->mcq->id, 'marks' => '1.00', 'sort_order' => 0]);
            return $paper->id;
        });
    }

    private function settings(array $overrides = []): array
    {
        return array_replace_recursive([
            'title' => 'Final OMR',
            'roll_digits' => 6,
            'option_count' => 4,
            'option_language' => 'bangla',
            'info_boxes' => ['class' => true, 'roll' => true, 'subject' => true, 'set' => true],
            'page_size' => 'a4',
            'page_orientation' => 'portrait',
            'answer_columns' => 'auto',
            'question_mark' => '1.00',
            'negative_mark_enabled' => true,
            'negative_mark' => '0.25',
            'multiple_answer_policy' => 'wrong',
        ], $overrides);
    }

    public function test_teacher_owns_form_and_generate_locks_until_unlock_creates_a_new_version(): void
    {
        $institution = $this->makeInstitution('omr-form-api');
        $teacher = $this->makeUser($institution, 'teacher');
        $otherTeacher = User::create(['institution_id' => $institution->id, 'name' => 'other', 'email' => 'other-omr@example.test', 'role' => 'teacher', 'password' => 'Teacher-pass-26', 'is_active' => true]);
        $admin = $this->makeUser($institution, 'admin');
        $paperId = $this->paper($institution, $teacher);
        $url = "question-bank/papers/{$paperId}/omr-form";

        $this->api('PUT', $this->hostOf($institution), $url, $teacher, ['settings' => $this->settings()])
            ->assertOk()->assertJsonPath('data.layout_version', 1)->assertJsonPath('data.settings.option_labels.0', 'ক');
        $this->api('GET', $this->hostOf($institution), $url, $otherTeacher)->assertNotFound();
        $this->api('GET', $this->hostOf($institution), $url, $admin)->assertOk();

        $this->api('POST', $this->hostOf($institution), "{$url}/generate", $teacher)->assertOk();
        $this->api('PUT', $this->hostOf($institution), $url, $teacher, ['settings' => $this->settings(['title' => 'Changed'])])->assertStatus(422);
        $this->api('POST', $this->hostOf($institution), "{$url}/unlock", $teacher)
            ->assertOk()->assertJsonPath('data.layout_version', 2)->assertJsonPath('data.locked_at', null);
        $this->api('PUT', $this->hostOf($institution), $url, $teacher, ['settings' => $this->settings(['title' => 'New layout'])])
            ->assertOk()->assertJsonPath('data.settings.title', 'New layout');
    }

    public function test_form_requires_final_paper_and_matching_mcq_option_counts(): void
    {
        $institution = $this->makeInstitution('omr-form-invalid');
        $teacher = $this->makeUser($institution, 'teacher');
        $draftId = $this->paper($institution, $teacher, 'draft');
        $this->api('PUT', $this->hostOf($institution), "question-bank/papers/{$draftId}/omr-form", $teacher, ['settings' => $this->settings()])
            ->assertStatus(422)->assertJsonPath('error', 'qb_omr_paper_not_final');

        $finalId = $this->paper($institution, $teacher);
        $this->api('PUT', $this->hostOf($institution), "question-bank/papers/{$finalId}/omr-form", $teacher,
            ['settings' => $this->settings(['option_count' => 5])])->assertStatus(422)->assertJsonPath('error', 'qb_omr_option_mismatch');
    }
}