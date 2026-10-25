<?php

namespace Tests\Feature\Ai;

use App\Models\{AiAnswerBank, AiConversation, AiMessage, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

// D164 (3) AI-P1.4: the platform reviewers see every answer de-identified (no phone, 10-digit ID, teacher or institution), thumbs-down
// and "not found" first; a rewrite replaces the shown answer (the first stays as history), tells the asker in-app and joins the
// answer bank open to every institution, so the same question is then answered directly; the head may keep answers out of review.
class AiReviewTest extends TestCase
{
    use DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateDatabaseTables();
        parent::tearDown();
    }

    private function reviewer(): User
    {
        return User::create(['institution_id' => null, 'name' => 'Rev', 'role' => 'content_moderator', 'phone' => '01799000001', 'password' => 'Writer-pass-26', 'is_active' => true]);
    }

    private function ask(array $s, string $text): array
    {
        $id = Tenancy::as($s['i'], fn () => AiConversation::create(['user_id' => $s['t']->id, 'title' => 'x'])->id);
        return ['chat' => $id] + $this->api('POST', $s['host'], "ai/conversations/{$id}/messages", $s['t'], ['text' => $text])->assertCreated()->json('data');
    }

    private function school(string $slug): array
    {
        $i = $this->makeInstitution($slug, 'school');
        $t = $this->makeUser($i, 'teacher');
        $t->forceFill(['name' => 'Karim Teacher'])->save();
        return ['i' => $i, 'host' => $this->hostOf($i), 't' => $t, 'admin' => $this->makeUser($i, 'admin')];
    }

    public function test_deidentified_queue_rewrite_bank_and_notification(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $rev = $this->reviewer();
        $a = $this->school('aireva');
        $first = $this->ask($a, 'ভগ্নাংশ কাকে বলে 01711000001 2510240001');
        $second = $this->ask($a, 'গসাগু কী');
        $this->api('PUT', $a['host'], "ai/messages/{$second['answer']['id']}/rating", $a['t'], ['rating' => -1])->assertOk();

        $queue = $this->api('GET', $central, 'writer/ai-reviews', $rev)->assertOk();
        $json = $queue->getContent();
        foreach (['01711000001', '2510240001', 'Karim Teacher', 'Aireva'] as $secret) $this->assertStringNotContainsString($secret, $json, "{$secret} reaches the reviewer");
        $this->assertSame([$second['answer']['id'], $first['answer']['id']], array_map(fn ($r) => Tenancy::withoutTenancy(fn () => \App\Models\AiReview::find($r['id'])->ai_message_id), $queue->json('data')), 'thumbs-down first');

        $reviewId = $queue->json('data.1.id');
        $this->api('PUT', $central, "writer/ai-reviews/{$reviewId}", $rev, ['status' => 'corrected'])->assertStatus(422);
        $this->api('PUT', $central, "writer/ai-reviews/{$reviewId}", $rev, ['status' => 'rewritten', 'text' => 'ভগ্নাংশ হলো একটি পূর্ণ বস্তুর অংশ।'])->assertOk()->assertJsonPath('data.weight', 3);
        $shown = collect($this->api('GET', $a['host'], "ai/conversations/{$first['chat']}", $a['t'])->json('data.messages'))->firstWhere('role', 'answer');
        $this->assertSame(['ভগ্নাংশ হলো একটি পূর্ণ বস্তুর অংশ।', 'rewritten'], [$shown['body'], $shown['review']]);
        $this->assertNotNull($shown['original'], 'the first answer stays as history');
        $this->assertSame(1, $a['t']->fresh()->notifications()->count());
        $bank = Tenancy::withoutTenancy(fn () => AiAnswerBank::sole());
        $this->assertSame([null, 3], [$bank->institution_id, $bank->weight]);
        $this->assertStringNotContainsString('01711000001', $bank->question_text);

        $b = $this->school('airevb');                                                   // another institution asks the same: answered directly
        $again = $this->ask($b, 'ভগ্নাংশ কাকে বলে?')['answer'];
        $this->assertSame(['direct', 'ভগ্নাংশ হলো একটি পূর্ণ বস্তুর অংশ।'], [$again['kind'], $again['body']]);
    }

    public function test_the_head_keeps_answers_out_of_review(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $rev = $this->reviewer();
        $a = $this->school('airevoff');
        $asked = $this->ask($a, 'গসাগু কী');
        $this->api('GET', $a['host'], 'ai/settings', $a['admin'])->assertOk()->assertJsonPath('data.send_to_review', true);
        $this->api('PUT', $a['host'], 'ai/settings', $a['t'], ['send_to_review' => false])->assertForbidden();
        $this->api('PUT', $a['host'], 'ai/settings', $a['admin'], ['send_to_review' => false])->assertOk()->assertJsonPath('data.send_to_review', false);
        $this->api('GET', $central, 'writer/ai-reviews', $rev)->assertOk()->assertJsonCount(0, 'data');
        $reviewId = Tenancy::as($a['i'], fn () => \App\Models\AiReview::where('ai_message_id', $asked['answer']['id'])->value('id'));
        $this->api('PUT', $central, "writer/ai-reviews/{$reviewId}", $rev, ['status' => 'approved'])->assertNotFound();
        $this->api('GET', $a['host'], 'writer/ai-reviews', $a['admin'])->assertStatus(404);   // a tenant host has no review queue
    }
}
