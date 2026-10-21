<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbClassLevel, QbCreativePart, QbQuestion, QbQuestionOccurrence, QbQuestionOption, QbQuestionType, QbSubject, QbTopic, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QbWriterQuestionFiltersTest extends TestCase
{
    use RefreshDatabase;

    private function platformUser(string $role, string $tag): User
    {
        return User::create(['institution_id' => null, 'name' => $tag, 'role' => $role, 'phone' => '0171' . str_pad((string) crc32($tag) % 10000000, 7, '0', STR_PAD_LEFT),
            'password' => 'Writer-pass-26', 'is_active' => true]);
    }

    public function test_writer_question_filters_search_and_answer_preview_payload(): void
    {
        $writer = $this->platformUser('content_writer', 'filter-writer');
        $other = $this->platformUser('content_writer', 'filter-other');
        $moderator = $this->platformUser('content_moderator', 'filter-moderator');
        $class = QbClassLevel::create(['name_bn' => 'নবম', 'name_en' => 'Nine']);
        $subject = QbSubject::create(['name_bn' => 'পদার্থ', 'name_en' => 'Physics', 'code' => 'PHY']);
        $subject->classLevels()->attach($class->id);
        $chapter = QbChapter::create(['qb_subject_id' => $subject->id, 'name_bn' => 'গতি', 'name_en' => 'Motion', 'number' => 2]);
        $topic = QbTopic::create(['qb_chapter_id' => $chapter->id, 'name_bn' => 'বেগ', 'name_en' => 'Speed']);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনি', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $question = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'qb_chapter_id' => $chapter->id,
            'qb_topic_id' => $topic->id, 'question_text' => 'বেগের একক কী?', 'answer_text' => 'মিটার/সেকেন্ড', 'explanation_text' => 'দূরত্বকে সময় দিয়ে ভাগ করি।', 'status' => 'draft', 'created_by' => $writer->id]);
        $question->classLevels()->attach($class->id);
        QbQuestionOption::create(['qb_question_id' => $question->id, 'label' => 'ক', 'content_text' => 'মিটার', 'is_correct' => false, 'sort_order' => 0]);
        QbQuestionOption::create(['qb_question_id' => $question->id, 'label' => 'খ', 'content_text' => 'মিটার/সেকেন্ড', 'is_correct' => true, 'sort_order' => 1]);
        QbCreativePart::create(['qb_question_id' => $question->id, 'part_label' => 'ক', 'marks' => 1, 'question_text' => 'গতি কী?', 'answer_text' => 'দূরত্ব ÷ সময়', 'sort_order' => 0]);
        QbQuestionOccurrence::create(['qb_question_id' => $question->id, 'board' => 'Dhaka', 'institution_name' => 'Board', 'exam_type' => 'board', 'year' => 2024]);
        QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => 'Other writer question', 'status' => 'draft', 'created_by' => $other->id]);

        $central = 'admin.' . config('tenancy.base_domain');
        $url = "writer/questions?class_level_ids[]={$class->id}&subject_ids[]={$subject->id}&chapter_ids[]={$chapter->id}&topic_ids[]={$topic->id}&question_type_ids[]={$type->id}&source_types[]=board&years[]=2024";
        $response = $this->api('GET', $central, $url, $writer)->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($question->id, $response->json('data.0.id'));
        $this->assertSame('মিটার/সেকেন্ড', $response->json('data.0.options.1.content_text'));
        $this->assertTrue($response->json('data.0.options.1.is_correct'));
        $this->assertSame('দূরত্বকে সময় দিয়ে ভাগ করি।', $response->json('data.0.explanation_text'));
        $this->assertSame('দূরত্ব ÷ সময়', $response->json('data.0.creative_parts.0.answer_text'));
        $this->assertSame(['board'], $response->json('meta.facets.source_types'));
        $this->assertSame([2024], $response->json('meta.facets.years'));
        $this->assertCount(1, $this->api('GET', $central, "writer/questions?q=PHY-MCQ-" . str_pad((string) $question->id, 6, '0', STR_PAD_LEFT), $writer)->assertOk()->json('data'));
        $this->assertCount(1, $this->api('GET', $central, 'writer/questions?q=বেগের%20একক', $writer)->assertOk()->json('data'));
        $this->assertCount(1, $this->api('GET', $central, 'writer/questions', $writer)->assertOk()->json('data'));
        $this->assertCount(2, $this->api('GET', $central, 'writer/questions', $moderator)->assertOk()->json('data'));
    }
}
