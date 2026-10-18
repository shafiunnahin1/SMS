<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbQuestionType, QbSubject, User};
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// R2.1.2 / D114 (1), D113: every seeded question type, written in Bangla and in English, is created, reopened, edited, sent for
// review and published with its own parts intact - the editor's whole range, not a sample.
class QbEveryTypeRoundTripTest extends TestCase
{
    use RefreshDatabase;

    private const TEXT = [
        'bn' => ['q' => 'নিচের প্রশ্নটির উত্তর দাও: $x^2 = 4$ হলে ___ কত?', 'a' => 'দুই', 'opt' => ['ক' => 'এক', 'খ' => 'দুই'], 'passage' => 'রহিম গ্রামে থাকে।'],
        'en' => ['q' => 'Answer the following: if $x^2 = 4$, what is ___?', 'a' => 'Two', 'opt' => ['A' => 'One', 'B' => 'Two'], 'passage' => 'Rahim lives in a village.'],
    ];

    /** the smallest complete body for a type: its structure first (as the editor saves it), then its family */
    private function body(QbQuestionType $type, string $lang): array
    {
        $t = self::TEXT[$lang];
        [$first, $second] = array_values($t['opt']);
        $structure = $type->ui_config['structure'] ?? null;
        return match ($structure) {
            'gap' => ['items' => [['item_type' => 'gap', 'answer_json' => ['answers' => [$t['a']]]]]],
            'match' => ['items' => [['item_type' => 'match_pair', 'prompt_text' => $first, 'answer_json' => ['right' => '1']],
                ['item_type' => 'match_pair', 'prompt_text' => $second, 'answer_json' => ['right' => '2']]]],
            'order' => ['items' => [['item_type' => 'order_step', 'prompt_text' => $first, 'answer_json' => ['position' => 1]],
                ['item_type' => 'order_step', 'prompt_text' => $second, 'answer_json' => ['position' => 2]]]],
            'passage' => ['stimuli' => [['label' => 'passage', 'content_text' => $t['passage']]],
                'items' => [['item_type' => 'sub_question', 'stimulus_index' => 0, 'prompt_text' => $t['q'], 'answer_json' => ['answer_text' => $t['a']]]]],
            'passage_mcq' => ['stimuli' => [['label' => 'stimulus', 'content_text' => $t['passage']]],
                'items' => [['item_type' => 'sub_mcq', 'stimulus_index' => 0, 'prompt_text' => $t['q'], 'prompt_json' => ['options' => [$first, $second]], 'answer_json' => ['correct' => 1]]]],
            default => match ($type->family) {
                'mcq' => ['options' => collect($t['opt'])->map(fn ($v, $k) => ['label' => $k, 'content_text' => $v, 'is_correct' => $v === $second])->values()->all()],
                'true_false' => ['options' => [['label' => 'T', 'content_text' => $first, 'is_correct' => true], ['label' => 'F', 'content_text' => $second, 'is_correct' => false]]],
                'creative' => ['creative_parts' => [['part_label' => 'ক', 'cognitive_level' => 'knowledge', 'marks' => 1, 'question_text' => $t['q'], 'answer_text' => $t['a']]]],
                default => ['answer_text' => $t['a']],
            },
        };
    }

    public function test_every_type_round_trips_in_bangla_and_english(): void
    {
        $this->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class, \Illuminate\Routing\Middleware\ThrottleRequestsWithRedis::class]);   // ~600 calls; the per-minute limit is not under test here
        $central = 'admin.' . config('tenancy.base_domain');
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $moderator = User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->seed(QbQuestionTypeSeeder::class);
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        $types = QbQuestionType::orderBy('id')->get();
        $this->assertGreaterThanOrEqual(74, $types->count());

        foreach ($types as $type) {
            foreach (array_keys(self::TEXT) as $lang) {
                $at = "{$type->slug} ({$lang})";
                $body = $this->body($type, $lang);
                $made = $this->api('POST', $central, 'writer/questions', $writer, ['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject,
                    'question_text' => self::TEXT[$lang]['q']] + $body)->assertCreated()->json('data');
                $id = $made['id'];
                $open = $this->api('GET', $central, "writer/questions/{$id}", $writer)->assertOk()->json('data');
                $this->assertSame(self::TEXT[$lang]['q'], $open['question_text'], $at);
                foreach (['options', 'creative_parts', 'items', 'stimuli'] as $part) {
                    if (isset($body[$part])) $this->assertCount(count($body[$part]), $open[$part], "{$at}: {$part} kept");
                }
                $edited = self::TEXT[$lang]['q'] . ' ✓';
                $this->api('PUT', $central, "writer/questions/{$id}", $writer, ['question_text' => $edited])->assertOk()->assertJsonPath('data.question_text', $edited);
                $this->api('POST', $central, "writer/questions/{$id}/submit", $writer)->assertOk();
                $this->api('POST', $central, "writer/questions/{$id}/publish", $moderator)->assertOk();
                $after = $this->api('GET', $central, "writer/questions/{$id}", $moderator)->assertOk()->json('data');
                $this->assertSame(['published', $edited], [$after['status'], $after['question_text']], $at);
                foreach (['options', 'creative_parts', 'items', 'stimuli'] as $part) {
                    if (isset($body[$part])) $this->assertCount(count($body[$part]), $after[$part], "{$at}: {$part} survive the edit");
                }
            }
        }
    }
}
