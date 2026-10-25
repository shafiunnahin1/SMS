<?php

namespace Tests\Feature\Ai;

use App\Models\{AiAnswerBank, AiAnswerReveal, AiConversation, AiReview, PlatformSetting, QbQuestion, QbQuestionType, QbSubject, QbUnlock};
use App\Services\Ai\AssistantService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

// D164 (2)(3) AI-P1.2: the assistant answers from the reviewed answer bank (directly), else from the whole platform's published
// question bank and curriculum (composed, with sources), else "not found"; a locked question's answer is shown only within the
// institution's daily free quota (one reveal per question per day), never beyond it; an unlocked one is always shown and never
// counted; every answer is queued for review. FULLTEXT sees only committed rows, so this test commits and truncates.
class AssistantAskTest extends TestCase
{
    use DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateDatabaseTables();
        parent::tearDown();
    }

    private function question(string $text): QbQuestion
    {
        $subject = QbSubject::firstOrCreate(['name_bn' => 'গণিত'], ['name_en' => 'Maths']);
        $type = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => $text,
            'answer_text' => 'SECRET-ANSWER', 'explanation_text' => 'SECRET-EXPLANATION', 'status' => 'published', 'created_by' => 1]);
        $q->options()->create(['label' => 'ক', 'content_text' => '১২', 'is_correct' => true, 'sort_order' => 0]);
        $q->options()->create(['label' => 'খ', 'content_text' => '১৮', 'is_correct' => false, 'sort_order' => 1]);
        return $q;
    }

    private function ask(array $s, string $text)
    {
        $id = Tenancy::as($s['i'], fn () => AiConversation::create(['user_id' => $s['t']->id, 'title' => 'x'])->id);
        return $this->api('POST', $s['host'], "ai/conversations/{$id}/messages", $s['t'], ['text' => $text])->assertCreated();
    }

    private function school(string $slug): array
    {
        $i = $this->makeInstitution($slug, 'school');
        return ['i' => $i, 'host' => $this->hostOf($i), 't' => $this->makeUser($i, 'teacher')];
    }

    public function test_free_quota_then_locked_and_unlocked_never_counted(): void
    {
        $q = $this->question('৪ ও ৬ এর লসাগু কত');
        $a = $this->school('aiask');
        $r = $this->ask($a, '৪ ও ৬ এর লসাগু কত')->json('data');
        $this->assertSame('composed', $r['answer']['kind']);
        $this->assertSame([['type' => 'question', 'id' => $q->id, 'locked' => false]], array_values(array_filter($r['answer']['sources'], fn ($x) => $x['type'] === 'question')));
        $this->assertStringContainsString('SECRET-EXPLANATION', $r['answer']['body'], 'a free reveal within the quota');
        $this->assertTrue($r['questions'][0]['free_reveal']);
        $this->assertSame(19, $r['free_left']);
        $this->ask($a, '৪ ও ৬ এর লসাগু কত');                                            // the same question again today: not counted twice
        $this->assertSame(1, Tenancy::as($a['i'], fn () => AiAnswerReveal::count()));
        $this->assertSame(2, Tenancy::as($a['i'], fn () => AiReview::where('status', 'unreviewed')->count()), 'every answer queued for review');

        PlatformSetting::write(AssistantService::QUOTA_KEY, 0);
        $b = $this->school('aiask2');
        $locked = $this->ask($b, '৪ ও ৬ এর লসাগু কত')->getContent();
        foreach (['SECRET-ANSWER', 'SECRET-EXPLANATION', 'is_correct', '✓'] as $secret) $this->assertStringNotContainsString($secret, $locked, "{$secret} beyond the quota");

        $c = $this->school('aiask3');
        Tenancy::as($c['i'], fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $c['t']->id, 'price' => '0.00', 'reason' => 'free']));
        $open = $this->ask($c, '৪ ও ৬ এর লসাগু কত')->json('data');
        $this->assertStringContainsString('SECRET-EXPLANATION', $open['answer']['body'], 'unlocked: always shown');
        $this->assertSame(0, Tenancy::as($c['i'], fn () => AiAnswerReveal::count()), 'an unlock is never counted');
    }

    public function test_reviewed_bank_answer_directly_and_not_found(): void
    {
        $a = $this->school('aibank2');
        Tenancy::withoutTenancy(fn () => AiAnswerBank::create(['question_text' => 'লসাগু কাকে বলে', 'answer_text' => 'লঘিষ্ঠ সাধারণ গুণিতক হলো ...', 'weight' => 3]));
        $r = $this->ask($a, 'লসাগু কাকে বলে?')->json('data.answer');
        $this->assertSame(['direct', 'লঘিষ্ঠ সাধারণ গুণিতক হলো ...'], [$r['kind'], $r['body']]);
        $this->assertSame('not_found', $this->ask($a, 'zzqx wwvy')->json('data.answer.kind'));
        $this->api('POST', $a['host'], 'ai/conversations/999999/messages', $a['t'], ['text' => 'x'])->assertNotFound();
    }
}
