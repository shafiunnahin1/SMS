<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbImportRecord, QbSubject, QbTopic, User};
use App\Services\QbImportService;
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

// D151 R2.1.2-ai-prompt-library: JSON shaped the way the AI prompt asks - an existing topic used by id, a question whose topic is
// genuinely new left without one, and a root topic_proposals entry for that topic - stages every question with its own metadata;
// the proposal is never staged as a question and never becomes a topic link (nothing is fabricated).
class QbPromptTopicProposalTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_topic_proposal_stays_informational_and_maps_nothing(): void
    {
        $this->seed(QbQuestionTypeSeeder::class);
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111129', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Mathematics']);
        $chapter = QbChapter::create(['qb_subject_id' => $subject->id, 'name_bn' => 'প্যাটার্ন', 'name_en' => 'Patterns']);
        $topic = QbTopic::create(['qb_chapter_id' => $chapter->id, 'name_bn' => 'সংখ্যার প্যাটার্ন', 'name_en' => 'Number patterns']);
        $settings = fn (?array $topicRef) => ['subject' => ['id' => $subject->id, 'name' => 'গণিত'], 'chapter' => ['id' => $chapter->id, 'name' => 'প্যাটার্ন']] + ($topicRef ? ['topic' => $topicRef] : []);
        $json = ['schema_version' => QbImportService::SCHEMA_V5, 'document' => ['title' => 'নমুনা', 'language' => 'bn'], 'questions' => [
            ['question_type' => 'short', 'question_text' => '২, ৪, ৬ এর পরের সংখ্যা কত?', 'answer_text' => '৮', 'settings' => $settings(['id' => $topic->id, 'name' => 'সংখ্যার প্যাটার্ন'])],
            ['question_type' => 'short', 'question_text' => 'ফিবোনাচি ধারার পঞ্চম পদ কত?', 'answer_text' => '৫', 'settings' => $settings(null)],
        ], 'topic_proposals' => [['chapter_id' => $chapter->id, 'chapter_name' => 'প্যাটার্ন', 'proposed_topic_name' => 'ফিবোনাচি ধারা',
            'reason' => 'বিদ্যমান টপিকে নেই', 'affected_question_numbers' => [2]]]];

        $this->api('POST', 'admin.' . config('tenancy.base_domain'), 'writer/imports', $writer,
            ['files' => [UploadedFile::fake()->createWithContent('ai.json', json_encode($json, JSON_UNESCAPED_UNICODE))]])->assertSuccessful();

        $records = QbImportRecord::orderBy('record_index')->get();
        $this->assertCount(2, $records, 'the two questions only - the proposal is not a question');
        $this->assertSame([[], []], $records->pluck('errors')->map(fn ($e) => $e ?? [])->all());
        $this->assertSame($topic->id, (int) ($records[0]->payload['topic']['id'] ?? 0), 'the existing topic is used by its id');
        $this->assertNull($records[1]->payload['topic'] ?? null, 'the new topic is left unset, never mapped to an existing one');
        $this->assertSame(1, QbTopic::count(), 'no topic is created from a proposal');
        $this->assertStringNotContainsString('proposed_topic_name', json_encode($records->pluck('payload')->all(), JSON_UNESCAPED_UNICODE));
    }
}
