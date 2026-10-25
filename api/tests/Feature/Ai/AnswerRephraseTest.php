<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, AiMessage, QbQuestion, QbQuestionType, QbSubject};
use App\Services\Ai\AnswerRephraser;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// D164 (6) AI-P1.6: a composed answer is shown at once and then rephrased by the small model; a trusted reply replaces it (the
// template kept, AI-P1.6.1), a reply with a new number or an extra ✓ is rejected, a stopped model leaves the template, no URL = no
// call, and a locked answer is never sent to the model. FULLTEXT sees only committed rows, so this test commits and truncates.
class AnswerRephraseTest extends TestCase
{
    use DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateDatabaseTables();
        parent::tearDown();
    }

    private function setUpChat(string $slug): array
    {
        $subject = QbSubject::firstOrCreate(['name_bn' => 'গণিত'], ['name_en' => 'Maths']);
        $type = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        if (!QbQuestion::exists()) {
            $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => '৪ ও ৬ এর লসাগু কত',
                'answer_text' => 'SECRET-ANSWER', 'explanation_text' => 'SECRET-EXPLANATION', 'status' => 'published', 'created_by' => 1]);
            $q->options()->create(['label' => 'ক', 'content_text' => '১২', 'is_correct' => true, 'sort_order' => 0]);
            $q->options()->create(['label' => 'খ', 'content_text' => '১৮', 'is_correct' => false, 'sort_order' => 1]);
        }
        $i = $this->makeInstitution($slug, 'school');
        $t = $this->makeUser($i, 'teacher');
        $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $t->id, 'title' => 'x'])->id);
        return [$i, $this->hostOf($i), $t, $id];
    }

    private function askAndShow(string $slug): array
    {
        [$i, $host, $t, $id] = $this->setUpChat($slug);
        $this->api('POST', $host, "ai/conversations/{$id}/messages", $t, ['text' => '৪ ও ৬ এর লসাগু কত'])->assertCreated();
        return [$i, collect($this->api('GET', $host, "ai/conversations/{$id}", $t)->assertOk()->json('data.messages'))->firstWhere('role', 'answer')];
    }

    public function test_trusted_reply_replaces_template(): void
    {
        config(['services.ai_llm.url' => 'http://llm.test', 'services.ai_llm.model' => 'qwen3-1.7b-q4']);
        Http::fake(['llm.test/*' => Http::response(['choices' => [['message' => ['content' => "<think>x</think>৪ আর ৬-এর লসাগু ১২ ✓"]]]])]);
        [$i, $m] = $this->askAndShow('airp1');
        $this->assertSame('৪ আর ৬-এর লসাগু ১২ ✓', $m['body']);
        $this->assertFalse($m['rephrasing']);
        $this->assertStringContainsString('লসাগু', (string) $m['template'], 'the template kept as history');
        $this->assertSame('qwen3-1.7b-q4', Tenancy::as($i, fn () => AiMessage::find($m['id'])->model_version));
        Http::assertSent(fn (Request $r) => $r->url() === 'http://llm.test/v1/chat/completions');
    }

    public function test_untrusted_or_stopped_model_keeps_template(): void
    {
        config(['services.ai_llm.url' => 'http://llm.test']);
        Http::fake(['llm.test/*' => Http::response(['choices' => [['message' => ['content' => 'লসাগু ২৪']]]])]);   // 24 is not in the text
        [$i, $m] = $this->askAndShow('airp2');
        $this->assertStringNotContainsString('২৪', $m['body']);
        $this->assertStringContainsString('লসাগু', $m['body']);
        $this->assertNull(Tenancy::as($i, fn () => AiMessage::find($m['id'])->model_version), 'NULL = the template stays');
        $this->assertNull($m['template'], 'nothing replaced, no history');

        Http::fake(['llm.test/*' => Http::response('down', 503)]);
        [, $m] = $this->askAndShow('airp3');
        $this->assertFalse($m['rephrasing']);
        $this->assertStringContainsString('লসাগু', $m['body']);
    }

    public function test_off_without_url_and_locked_answer_never_sent(): void
    {
        config(['services.ai_llm.url' => null]);
        Http::fake();
        [, $m] = $this->askAndShow('airp4');
        Http::assertNothingSent();
        $this->assertFalse($m['rephrasing']);

        \App\Models\PlatformSetting::write(\App\Services\Ai\AssistantService::QUOTA_KEY, 0);
        config(['services.ai_llm.url' => 'http://llm.test']);
        Http::fake(['llm.test/*' => Http::response(['choices' => [['message' => ['content' => 'ঠিক আছে']]]])]);
        $this->askAndShow('airp5');
        Http::assertSent(fn (Request $r) => !str_contains($r->body(), 'SECRET') && !str_contains($r->body(), '✓'));
    }

    public function test_trust_rule(): void
    {
        $this->assertTrue(AnswerRephraser::trusted('ক) ১২ ✓  খ) ১৮', '১২ সঠিক ✓, ১৮ নয়'));
        $this->assertFalse(AnswerRephraser::trusted('ক) ১২ ✓  খ) ১৮', '১৮ ✓'.' ১২ ✓'), 'an extra correct mark');
        $this->assertFalse(AnswerRephraser::trusted('লসাগু ১২', 'লসাগু 13'), 'a new number, Latin digits too');
        $this->assertFalse(AnswerRephraser::trusted('লসাগু', ''));
    }
}
