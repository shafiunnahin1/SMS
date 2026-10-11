<?php

namespace Tests\Feature\QuestionBank;

use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbQuestion, QbQuestionType, QbSubject, User};
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// QB.4 (D65, docs/modules/question-bank.md §3খ): the structured types - gaps (with a word box), matching pairs, ordering steps,
// a passage with sub-questions and a stimulus with MCQs - round-trip through the writers' API, are complete only with their own
// parts, and leave the panel without their answers (nor an answer given away by position) unless unlocked.
class QbStructuredTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;
    private int $subject;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->seed(QbQuestionTypeSeeder::class);
        $this->subject = QbSubject::create(['name_bn' => 'ইংরেজি', 'name_en' => 'English'])->id;
    }

    private function save(string $slug, array $body): array
    {
        $type = QbQuestionType::where('slug', $slug)->firstOrFail();
        return $this->api('POST', $this->central, 'writer/questions', $this->writer,
            ['qb_question_type_id' => $type->id, 'qb_subject_id' => $this->subject, 'question_text' => "Do the {$slug} task."] + $body)->assertCreated()->json('data');
    }

    private function submit(int $id): \Illuminate\Testing\TestResponse
    {
        return $this->api('POST', $this->central, "writer/questions/{$id}/submit", $this->writer);
    }

    public function test_qbanks_types_are_grouped_into_structures(): void
    {
        $structure = fn ($slug) => QbQuestionType::where('slug', $slug)->first()->ui_config['structure'];
        $this->assertSame(['gap', 'gap', 'match', 'order', 'passage', 'passage_mcq', null],
            array_map($structure, ['gap_fill', 'cloze_test_with_clues', 'matching', 'rearrange', 'seen_passage', 'stimulus_mcq_group', 'paragraph']));
        $this->assertSame('writing', QbQuestionType::where('slug', 'application')->first()->family, "qbank's later `application` (the letter) wins");
        $this->assertNotNull(QbQuestionType::where('slug', 'gap_fill')->first()->ui_config['qbank']['interaction']['type'], "qbank's own config is kept as data");
    }

    public function test_a_cloze_with_a_word_box_round_trips_and_needs_every_answer(): void
    {
        $q = $this->save('cloze_test_with_clues', [
            'stimuli' => [['label' => 'word_box', 'content_text' => 'went, school, early']],
            'items' => [
                ['item_type' => 'gap', 'stimulus_index' => 0, 'prompt_text' => 'He (a) ___ to', 'answer_json' => ['answers' => ['went']]],
                ['item_type' => 'gap', 'stimulus_index' => 0, 'prompt_text' => '(b) ___ at nine.', 'answer_json' => ['answers' => []]],
            ]]);
        $this->assertSame('word_box', $q['stimuli'][0]['label']);
        $this->assertSame([$q['stimuli'][0]['id'], $q['stimuli'][0]['id']], array_column($q['items'], 'qb_question_stimulus_id'));
        $this->submit($q['id'])->assertStatus(422)->assertJsonValidationErrors('items');

        $this->api('PUT', $this->central, "writer/questions/{$q['id']}", $this->writer, ['items' => [
            ['item_type' => 'gap', 'stimulus_index' => 0, 'prompt_text' => 'He (a) ___ to', 'answer_json' => ['answers' => ['went']]],
            ['item_type' => 'gap', 'stimulus_index' => 0, 'prompt_text' => '(b) ___ at nine.', 'answer_json' => ['answers' => ['school', 'School']]],
        ]])->assertOk()->assertJsonCount(2, 'data.items')->assertJsonCount(1, 'data.stimuli');     // items alone keep the word box
        $this->submit($q['id'])->assertOk();

        $this->api('PUT', $this->central, "writer/questions/{$q['id']}", $this->writer, ['items' => [['item_type' => 'gap', 'stimulus_index' => 3, 'answer_json' => ['answers' => ['x']]]]])
            ->assertStatus(422);                                                         // only a draft / rejected question is edited at all
    }

    public function test_matching_and_ordering_and_what_an_institution_sees(): void
    {
        $match = $this->save('matching', ['items' => [
            ['item_type' => 'match_pair', 'prompt_text' => 'Dhaka', 'answer_json' => ['right' => 'Bangladesh']],
            ['item_type' => 'match_pair', 'prompt_text' => 'Delhi', 'answer_json' => ['right' => 'India']],
            ['item_type' => 'match_pair', 'prompt_text' => 'Kathmandu', 'answer_json' => ['right' => 'Nepal']],
        ]]);
        $this->submit($match['id'])->assertOk();
        $locked = QbQuestionPublicResource::make(QbQuestion::find($match['id']), unlocked: false);
        $this->assertSame(['Bangladesh', 'India', 'Nepal'], $locked['choices']);
        $this->assertSame(['Dhaka', 'Delhi', 'Kathmandu'], array_column($locked['items'], 'prompt_text'));
        $this->assertArrayNotHasKey('answer_json', $locked['items'][0]);

        $order = $this->save('rearrange', ['items' => [
            ['item_type' => 'order_step', 'prompt_text' => 'wake up', 'answer_json' => ['position' => 1]],
            ['item_type' => 'order_step', 'prompt_text' => 'brush teeth', 'answer_json' => ['position' => 2]],
            ['item_type' => 'order_step', 'prompt_text' => 'go to school', 'answer_json' => ['position' => 3]],
        ]]);
        $this->submit($order['id'])->assertOk();
        $locked = QbQuestionPublicResource::make(QbQuestion::find($order['id']), unlocked: false);
        $this->assertSame(['brush teeth', 'go to school', 'wake up'], array_column($locked['items'], 'prompt_text'), 'not in the right order');
        $open = QbQuestionPublicResource::make(QbQuestion::find($order['id']), unlocked: true);
        $this->assertSame(['wake up', 'brush teeth', 'go to school'], array_column($open['items'], 'prompt_text'));
        $this->assertSame(1, $open['items'][0]['answer_json']['position']);

        $broken = $this->save('rearrange', ['items' => [
            ['item_type' => 'order_step', 'prompt_text' => 'a', 'answer_json' => ['position' => 1]],
            ['item_type' => 'order_step', 'prompt_text' => 'b', 'answer_json' => ['position' => 1]],
        ]]);
        $this->submit($broken['id'])->assertStatus(422)->assertJsonValidationErrors('items');
        $onePair = $this->save('matching', ['items' => [['item_type' => 'match_pair', 'prompt_text' => 'x', 'answer_json' => ['right' => 'y']]]]);
        $this->submit($onePair['id'])->assertStatus(422);
    }

    public function test_a_passage_and_a_stimulus_with_mcqs(): void
    {
        $p = $this->save('seen_passage', [
            'stimuli' => [['label' => 'passage', 'content_text' => 'Rahim lives in a village. He loves his school.']],
            'items' => [['item_type' => 'sub_question', 'stimulus_index' => 0, 'prompt_text' => 'Where does Rahim live?', 'answer_json' => ['answer_text' => 'In a village']]],
        ]);
        $this->submit($p['id'])->assertOk();
        $noPassage = $this->save('seen_passage', ['items' => [['item_type' => 'sub_question', 'prompt_text' => 'Q?', 'answer_json' => ['answer_text' => 'A']]]]);
        $this->submit($noPassage['id'])->assertStatus(422);

        $m = $this->save('stimulus_mcq_group', [
            'stimuli' => [['label' => 'stimulus', 'content_text' => 'A car moves 100 m in 10 s.']],
            'items' => [['item_type' => 'sub_mcq', 'stimulus_index' => 0, 'prompt_text' => 'Its speed?', 'prompt_json' => ['options' => ['10 m/s', '1 m/s']], 'answer_json' => ['correct' => 0]]],
        ]);
        $this->submit($m['id'])->assertOk();
        $locked = QbQuestionPublicResource::make(QbQuestion::find($m['id']), unlocked: false);
        $this->assertSame(['10 m/s', '1 m/s'], $locked['items'][0]['prompt_json']['options']);
        $this->assertStringNotContainsString('correct', json_encode($locked));
        $bad = $this->save('stimulus_mcq_group', [
            'stimuli' => [['content_text' => 'S']],
            'items' => [['item_type' => 'sub_mcq', 'stimulus_index' => 0, 'prompt_text' => 'Q', 'prompt_json' => ['options' => ['a', 'b']], 'answer_json' => ['correct' => 5]]],
        ]);
        $this->submit($bad['id'])->assertStatus(422);
    }
}
