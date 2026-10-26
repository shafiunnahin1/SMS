<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, PlatformSetting, QbQuestion, QbQuestionType, QbSubject};
use App\Services\Ai\AssistantService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

// D166 AI-Q2: an answer carries the questions it showed as structured items for the chat's safe renderer - LaTeX and graph tokens
// exactly as stored (the renderer draws them; the plain answer text never has the token), a locked one without answer,
// explanation or is_correct, an open one with them; the chat reload gives the same items. FULLTEXT: commits and truncates.
class AssistantItemsTest extends TestCase
{
    use DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateDatabaseTables();
        parent::tearDown();
    }

    public function test_items_keep_latex_and_graph_for_the_renderer_and_hide_locked_answers(): void
    {
        $type = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $subject = QbSubject::firstOrCreate(['name_bn' => 'গণিত'], ['name_en' => 'Maths']);
        $graph = '[[qmx-graph:eyJ4IjpbMSwyLDNdfQ]]';
        $text = 'লেখচিত্রের ঢাল $\\frac{\\Delta y}{\\Delta x}$ কত ' . $graph;
        $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => $text,
            'answer_text' => 'ANSWER-$m=2$', 'explanation_text' => 'EXPLAINED', 'status' => 'published', 'created_by' => 1, 'published_at' => now()]);
        $q->options()->create(['label' => 'ক', 'content_text' => '$2$', 'is_correct' => true, 'sort_order' => 0]);
        $q->options()->create(['label' => 'খ', 'content_text' => '$3$', 'is_correct' => false, 'sort_order' => 1]);

        $ask = function (string $slug) {
            $i = $this->makeInstitution($slug, 'school');
            $t = $this->makeUser($i, 'teacher');
            $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $t->id, 'title' => 'x'])->id);
            $a = $this->api('POST', $this->hostOf($i), "ai/conversations/{$id}/messages", $t, ['text' => 'লেখচিত্রের ঢাল কত'])->assertCreated()->json('data.answer');
            $reload = collect($this->api('GET', $this->hostOf($i), "ai/conversations/{$id}", $t)->assertOk()->json('data.messages'))->firstWhere('role', 'answer');
            return [$a, $reload];
        };

        [$open, $reload] = $ask('aiitem1');                                      // within the free quota: open
        $item = $open['items'][0];
        $this->assertSame($text, $item['question_text'], 'LaTeX and the graph token round-trip unchanged for the renderer');
        $this->assertSame(['$2$', true], [$item['options'][0]['content_text'], $item['options'][0]['is_correct']]);
        $this->assertSame(['ANSWER-$m=2$', 'EXPLAINED'], [$item['answer_text'], $item['explanation_text']]);
        $this->assertStringNotContainsString('qmx-graph', $open['body']);
        $this->assertSame($open['items'], $reload['items'], 'the reload gives the same items');

        PlatformSetting::write(AssistantService::QUOTA_KEY, 0);
        [$locked] = $ask('aiitem2');
        $json = json_encode($locked['items'], JSON_UNESCAPED_UNICODE);
        foreach (['ANSWER-', 'EXPLAINED', 'is_correct'] as $bad) $this->assertStringNotContainsString($bad, $json, $bad);
        $this->assertSame($text, $locked['items'][0]['question_text'], 'the question side is still shown');
    }
}
