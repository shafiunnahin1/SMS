<?php

namespace Tests\Feature\QuestionBank;

use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbQuestion, QbQuestionType, QbSubject, User};
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D73 (QB.13): one seen passage mixes its parts - an MCQ, a written answer, a gap with a base-word hint, a true/false with its
// correction, an information-transfer table, a three-column matching row, a two-field answer and two steps to order. Each part
// must be complete for its own kind before review; locked, no part gives its answer away.
class QbStructuredMixedTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_seen_passage_mixes_every_kind_and_gives_no_answer_away(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->seed(QbQuestionTypeSeeder::class);
        $subject = QbSubject::create(['name_bn' => 'ইংরেজি', 'name_en' => 'English'])->id;
        $items = [
            ['item_type' => 'sub_mcq', 'stimulus_index' => 0, 'prompt_text' => 'Behula was -', 'prompt_json' => ['options' => ['a heroine', 'a goddess']], 'answer_json' => ['correct' => 0], 'marks' => 1],
            ['item_type' => 'sub_question', 'stimulus_index' => 0, 'prompt_text' => 'Who was Lakhindar?', 'answer_json' => ['answer_text' => 'Her husband.'], 'marks' => 2],
            ['item_type' => 'gap', 'stimulus_index' => 0, 'prompt_text' => 'She (a) ___ to the gods.', 'prompt_json' => ['hint' => 'go'], 'answer_json' => ['answers' => ['went']], 'marks' => 1],
            ['item_type' => 'true_false', 'stimulus_index' => 0, 'prompt_text' => 'Manasa helped Chand.', 'answer_json' => ['value' => false, 'correction' => 'Manasa was angry with Chand.'], 'marks' => 1],
            ['item_type' => 'table_fill', 'stimulus_index' => 0, 'prompt_json' => ['table' => ['columns' => ['Who', 'What'], 'rows' => [['Behula', null], [null, 'a merchant']]]],
                'answer_json' => ['cells' => ['0-1' => ['his wife'], '1-0' => ['Saudagar']]], 'marks' => 2],
            ['item_type' => 'match_triple', 'prompt_text' => 'Education means', 'answer_json' => ['middle' => 'conscious of', 'right' => 'our rights'], 'marks' => 1],
            ['item_type' => 'multi_field', 'prompt_text' => 'বিদ্যালয়', 'prompt_json' => ['fields' => ['ব্যাসবাক্য', 'সমাস']], 'answer_json' => ['values' => ['বিদ্যার আলয়', 'ষষ্ঠী তৎপুরুষ']], 'marks' => 2],
            ['item_type' => 'order_step', 'prompt_text' => 'wake up', 'answer_json' => ['position' => 1], 'marks' => 1],
            ['item_type' => 'order_step', 'prompt_text' => 'brush teeth', 'answer_json' => ['position' => 2], 'marks' => 1],
        ];
        $body = ['qb_question_type_id' => QbQuestionType::where('slug', 'seen_passage')->value('id'), 'qb_subject_id' => $subject, 'question_text' => 'Read the passage.',
            'stimuli' => [['label' => 'passage', 'content_text' => 'Behula is a legendary heroine.']]];

        $broken = $items;
        $broken[3]['answer_json'] = ['correction' => 'no value'];                 // a true/false without true or false
        $q = $this->api('POST', $central, 'writer/questions', $writer, $body + ['items' => $broken])->assertCreated()->json('data');
        $this->api('POST', $central, "writer/questions/{$q['id']}/submit", $writer)->assertStatus(422)->assertJsonValidationErrors('items');

        $this->api('PUT', $central, "writer/questions/{$q['id']}", $writer, $body + ['items' => $items])->assertOk();
        $this->api('POST', $central, "writer/questions/{$q['id']}/submit", $writer)->assertOk();

        $locked = QbQuestionPublicResource::make(QbQuestion::find($q['id']), unlocked: false);
        $this->assertStringNotContainsString('answer_json', json_encode($locked['items']));
        foreach (['Her husband', 'went', 'Manasa was angry', 'his wife', 'Saudagar', 'ষষ্ঠী', 'বিদ্যার আলয়'] as $answer) {
            $this->assertStringNotContainsString($answer, json_encode($locked['items'], JSON_UNESCAPED_UNICODE), "locked parts never carry: {$answer}");
        }
        $this->assertSame(['middle' => ['conscious of'], 'right' => ['our rights']], $locked['triple_choices']);
        $kinds = array_column($locked['items'], 'item_type');
        $this->assertSame(['sub_mcq', 'sub_question', 'gap', 'true_false', 'table_fill', 'match_triple', 'multi_field', 'order_step', 'order_step'], $kinds, 'the parts keep their places');
        $this->assertSame(['1.00', '2.00', '1.00', '1.00', '2.00', '1.00', '2.00', '1.00', '1.00'], array_column($locked['items'], 'marks'), 'every structured part keeps its marks');
        $this->assertSame(['brush teeth', 'wake up'], array_column(array_slice($locked['items'], 7), 'prompt_text'), 'the steps trade places only among themselves');
        $this->assertSame('go', $locked['items'][2]['prompt_json']['hint'], 'the base word is part of the question');
        $open = QbQuestionPublicResource::make(QbQuestion::find($q['id']), unlocked: true);
        $this->assertFalse($open['items'][3]['answer_json']['value']);
    }
}
