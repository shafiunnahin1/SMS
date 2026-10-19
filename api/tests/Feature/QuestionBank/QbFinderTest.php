<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbQuestion, QbQuestionType, QbSubject, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// R2.1.2 / D114 (3): qbank's question finder - labelled cases: a clear match is recommended, two near-identical questions need a
// hand pick, an unrelated text is low confidence, only published questions are searched, filters narrow, no answer leaves.
class QbFinderTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;
    private array $ids = [];
    private int $physics;
    private int $geo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $this->physics = QbSubject::create(['name_bn' => 'পদার্থবিজ্ঞান', 'name_en' => 'Physics'])->id;
        $this->geo = QbSubject::create(['name_bn' => 'ভূগোল', 'name_en' => 'Geography'])->id;
        foreach ([
            'boil' => ['পানির স্ফুটনাঙ্ক সমুদ্রপৃষ্ঠে কত ডিগ্রি সেলসিয়াস?', $this->physics, 'published'],
            'freeze' => ['পানির হিমাঙ্ক সমুদ্রপৃষ্ঠে কত ডিগ্রি সেলসিয়াস?', $this->physics, 'published'],
            'capital' => ['What is the capital city of Bangladesh?', $this->geo, 'published'],
            'river' => ['বাংলাদেশের দীর্ঘতম নদী কোনটি?', $this->geo, 'published'],
            'draft' => ['What is the capital city of Bangladesh?', $this->geo, 'draft'],
        ] as $key => [$text, $subject, $status]) {
            $this->ids[$key] = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => $text,
                'answer_text' => "SECRET-ANSWER-{$key}", 'status' => $status, 'created_by' => $this->writer->id])->id;
        }
    }

    private function find(string $text, array $extra = []): array
    {
        return $this->api('POST', $this->central, 'writer/question-finder', $this->writer, ['text' => $text] + $extra)->assertOk()->json();
    }

    public function test_a_clear_match_is_recommended(): void
    {
        $r = $this->find('what is the capital city of bangladesh');   // as OCR might read it: no capitals, no question mark
        $this->assertSame('recommended', $r['decision']);
        $this->assertSame($this->ids['capital'], $r['recommended_question_id']);
        $this->assertSame('high', $r['results'][0]['confidence']);
        $this->assertNotContains($this->ids['draft'], array_column($r['results'], 'question_id'), 'only published questions');
    }

    public function test_near_identical_questions_need_a_hand_pick(): void
    {
        // the shared words only: boil and freeze match equally well
        $r = $this->find('পানির সমুদ্রপৃষ্ঠে কত ডিগ্রি সেলসিয়াস?');
        $top = array_slice(array_column($r['results'], 'question_id'), 0, 2);
        sort($top);
        $both = [$this->ids['boil'], $this->ids['freeze']];
        sort($both);
        $this->assertSame($both, $top);
        $this->assertNull($r['recommended_question_id'], 'too close to call - never auto-picked');
        $this->assertContains($r['decision'], ['manual_selection', 'low_confidence']);
    }

    public function test_an_unrelated_text_is_low_confidence_and_filters_narrow(): void
    {
        $r = $this->find('Photosynthesis happens in the leaves of plants');
        $this->assertNull($r['recommended_question_id']);
        $this->assertContains($r['decision'], ['low_confidence', 'no_match']);

        $only = $this->find('কত ডিগ্রি সেলসিয়াস', ['qb_subject_id' => $this->geo]);
        $this->assertNotContains($this->ids['boil'], array_column($only['results'], 'question_id'), 'the subject filter keeps physics out');
        $this->assertSame(2, $this->find('বাংলাদেশ', ['qb_subject_id' => $this->geo])['candidate_count']);
    }

    public function test_no_answer_leaves_and_bad_input_is_refused(): void
    {
        $json = json_encode($this->find('What is the capital city of Bangladesh?'), JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('SECRET-ANSWER', $json);
        $this->assertStringNotContainsString('answer_text', $json);
        $this->api('POST', $this->central, 'writer/question-finder', $this->writer, ['text' => 'abc'])->assertStatus(422);
        $this->api('POST', $this->central, 'writer/question-finder', $this->writer, ['text' => str_repeat('a', 5001)])->assertStatus(422);
    }
}
