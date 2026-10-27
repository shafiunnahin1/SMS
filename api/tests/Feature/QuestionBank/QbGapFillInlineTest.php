<?php

namespace Tests\Feature\QuestionBank;

use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbQuestion, QbQuestionType, QbSubject, User};
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D142 R2.1.2-gap-fill-authoring: an inline gap question keeps one passage with its labelled blanks in question_text and one
// gap item per blank (no sentence), in passage order, each with its answers, hint and marks; it saves, reopens and is edited with
// the mapping intact (Bangla text included), a question written the old way (one sentence per blank) still saves and reopens, and
// a locked question shows the passage and hints but never an answer.
class QbGapFillInlineTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111119', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->seed(QbQuestionTypeSeeder::class);
    }

    private static function gap(array $answers, ?string $hint, string $marks, ?string $prompt = null): array
    {
        return ['item_type' => 'gap', 'stimulus_index' => 0, 'prompt_text' => $prompt, 'prompt_json' => $hint ? ['hint' => $hint] : null, 'answer_json' => ['answers' => $answers], 'marks' => $marks];
    }

    private function body(string $text, array $items): array
    {
        return ['qb_question_type_id' => QbQuestionType::where('slug', 'gap_fill')->firstOrFail()->id, 'qb_subject_id' => QbSubject::create(['name_bn' => 'বাংলা', 'name_en' => 'Bangla'])->id,
            'question_text' => $text, 'stimuli' => [['label' => 'word_box', 'content_text' => 'নদী, পাহাড়']], 'items' => $items];
    }

    private static function map(array $q): array
    {
        return array_map(fn ($i) => [$i['prompt_text'], $i['answer_json']['answers'] ?? null, $i['prompt_json']['hint'] ?? null, (string) $i['marks']], $q['items']);
    }

    public function test_inline_blanks_save_reopen_and_edit_with_a_stable_mapping(): void
    {
        $text = 'বাংলাদেশ (a) — দেশ, এখানে অনেক (b) — আছে।';
        $q = $this->api('POST', $this->central, 'writer/questions', $this->writer, $this->body($text, [self::gap(['নদীমাতৃক'], 'নদী', '1.00'), self::gap(['নদী', 'নদ-নদী'], null, '2.00')]))
            ->assertCreated()->json('data');
        $this->assertSame($text, $q['question_text'], 'the passage and its blank labels are kept as written');
        $reopened = $this->api('GET', $this->central, "writer/questions/{$q['id']}", $this->writer)->assertOk()->json('data');
        $this->assertSame([[null, ['নদীমাতৃক'], 'নদী', '1.00'], [null, ['নদী', 'নদ-নদী'], null, '2.00']], self::map($reopened), 'answers, hint and marks stay with their blank');

        // the editor moved blank (b) before (a): the passage relabels and the items follow
        $moved = 'বাংলাদেশ (b) — দেশ, এখানে অনেক (a) — আছে।';
        $edited = $this->api('PUT', $this->central, "writer/questions/{$q['id']}", $this->writer,
            ['question_text' => $moved, 'items' => [self::gap(['নদী', 'নদ-নদী'], null, '2.00'), self::gap(['নদীমাতৃক'], 'নদী', '1.00')]])->assertOk()->json('data');
        $this->assertSame($moved, $edited['question_text']);
        $this->assertSame([[null, ['নদী', 'নদ-নদী'], null, '2.00'], [null, ['নদীমাতৃক'], 'নদী', '1.00']], self::map($this->api('GET', $this->central, "writer/questions/{$q['id']}", $this->writer)->json('data')));
    }

    public function test_an_old_sentence_per_blank_question_still_saves_and_reopens(): void
    {
        $q = $this->api('POST', $this->central, 'writer/questions', $this->writer, $this->body('Fill in the blanks.', [
            self::gap(['went'], null, '1.00', 'He (a) ___ to'), self::gap(['school'], null, '1.00', '(b) ___ at nine.')]))->assertCreated()->json('data');
        $this->assertSame([['He (a) ___ to', ['went'], null, '1.00'], ['(b) ___ at nine.', ['school'], null, '1.00']],
            self::map($this->api('GET', $this->central, "writer/questions/{$q['id']}", $this->writer)->json('data')));
    }

    public function test_a_locked_gap_question_never_shows_an_answer(): void
    {
        $q = $this->api('POST', $this->central, 'writer/questions', $this->writer, $this->body('আকাশ (a) — রঙের।', [self::gap(['SECRET-নীল'], 'রং', '1.00')]))
            ->assertCreated()->json('data');
        $locked = QbQuestionPublicResource::make(QbQuestion::findOrFail($q['id']), false);
        $this->assertSame('আকাশ (a) — রঙের।', $locked['question_text']);
        $this->assertSame('রং', $locked['items'][0]['prompt_json']['hint'], 'the hint is part of the question');
        $this->assertArrayNotHasKey('answer_json', $locked['items'][0]);
        $this->assertStringNotContainsString('SECRET', json_encode($locked, JSON_UNESCAPED_UNICODE));
        $this->assertSame(['SECRET-নীল'], QbQuestionPublicResource::make(QbQuestion::findOrFail($q['id']), true)['items'][0]['answer_json']['answers'], 'the answer view still has it');
    }
}
