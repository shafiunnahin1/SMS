<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbCreativePart, QbQuestion, QbQuestionItem, QbQuestionOption, QbQuestionStimulus, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D171 STIM.1: a stimulus_mcq_group is one paper item whose sub_mcq children are numbered MCQs (D129's MCQ serial runs on through
// them; written questions keep their own serial); the group's marks are the sum of its children's own marks, never the author's
// number, and a child without marks blocks the group; sets keep the children attached and in order, "options" shuffles each
// child's choices with the correct answer following them into the print and the frozen answer key; answers only when bought and asked.
class QbStimulusPaperTest extends TestCase
{
    use RefreshDatabase;

    private const CHOICES = [['Town', 'Village', 'City', 'Port'], ['Rice', 'Fish', 'Tea', 'Jute']];

    private User $super;
    private QbQuestion $mcq;
    private QbQuestion $group;
    private QbQuestion $creative;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000019', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = fn (string $slug, string $family) => QbQuestionType::create(['slug' => $slug, 'name_bn' => $slug, 'name_en' => $slug, 'family' => $family])->id;
        $subject = QbSubject::create(['name_bn' => 'বাংলা', 'name_en' => 'Bangla'])->id;
        $make = fn (int $t, string $text) => QbQuestion::create(['qb_question_type_id' => $t, 'qb_subject_id' => $subject, 'question_text' => $text, 'status' => 'published', 'created_by' => $this->super->id]);
        $this->mcq = $make($type('mcq', 'mcq'), 'PLAIN-MCQ');
        foreach (['A1' => true, 'A2' => false, 'A3' => false, 'A4' => false] as $text => $ok) QbQuestionOption::create(['qb_question_id' => $this->mcq->id, 'label' => 'x', 'content_text' => $text, 'is_correct' => $ok]);
        $this->group = $make($type('stimulus_mcq_group', 'other'), 'Read the passage.');
        $st = QbQuestionStimulus::create(['qb_question_id' => $this->group->id, 'label' => 'passage', 'content_text' => 'STIMULUS-TEXT Rahim lives in a village.', 'sort_order' => 1]);
        foreach ([['CHILD-ONE', 1, '1.00'], ['CHILD-TWO', 3, '2.00']] as $k => [$prompt, $correct, $marks]) {
            QbQuestionItem::create(['qb_question_id' => $this->group->id, 'qb_question_stimulus_id' => $st->id, 'item_type' => 'sub_mcq', 'prompt_text' => $prompt,
                'prompt_json' => ['options' => self::CHOICES[$k]], 'answer_json' => ['correct' => $correct], 'marks' => $marks, 'sort_order' => $k + 1]);
        }
        $this->creative = $make($type('creative', 'creative'), 'WRITTEN-Q');
        QbCreativePart::create(['qb_question_id' => $this->creative->id, 'part_label' => 'ক', 'cognitive_level' => 'knowledge', 'marks' => 1, 'question_text' => 'x', 'answer_text' => 'y']);
    }

    private function setUpInstitution(string $slug): array
    {
        $i = $this->makeInstitution($slug);
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, function () use ($admin) {
            foreach ([$this->mcq, $this->group, $this->creative] as $q) QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']);
        });
        return [$i, $admin];
    }

    private function body(array $extra = []): array
    {
        return array_merge(['title' => 'Stimulus', 'sets_count' => 2, 'sections' => [
            ['title' => 'MCQ', 'items' => [['qb_question_id' => $this->mcq->id, 'marks' => '1'], ['qb_question_id' => $this->group->id, 'marks' => '99']]],
            ['title' => 'Written', 'items' => [['qb_question_id' => $this->creative->id, 'marks' => '10']]],
        ]], $extra);
    }

    private function printed($i, User $admin, int $id, string $set, bool $answers): array
    {
        return $this->api('GET', $this->hostOf($i), "question-bank/papers/{$id}/pdf?format=json&set={$set}&answers=" . ($answers ? 1 : 0), $admin)->assertOk()->json('data');
    }

    /** [no => [prompt, printed options, correct index or null]] of the group's children in print order */
    private static function children(array $data): array
    {
        $out = [];
        foreach ($data['sections'][0]['items'] as $it) foreach ($it['question']['items'] ?? [] as $p) {
            if (isset($p['no'])) $out[$p['no']] = [$p['prompt_text'], $p['prompt_json']['options'], $p['answer_json']['correct'] ?? null];
        }
        return $out;
    }

    public function test_children_take_mcq_serials_and_the_group_marks_are_their_sum(): void
    {
        [$i, $admin] = $this->setUpInstitution('stim-serials');
        $paper = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $this->body())->assertCreated()->json('data');
        $this->assertSame('14.00', $paper['total_marks'], 'mcq 1 + group (1 + 2) + written 10; the group is counted once');
        $this->assertSame('3.00', (string) $paper['sections'][0]['items'][1]['marks'], "the author's 99 is replaced by the children's sum");

        $data = $this->printed($i, $admin, $paper['id'], 'A', false);
        [$plain, $group] = $data['sections'][0]['items'];
        $this->assertSame([1, null], [$plain['no'], $group['no']], 'the group itself takes no serial');
        $this->assertSame([2 => ['CHILD-ONE', self::CHOICES[0], null], 3 => ['CHILD-TWO', self::CHOICES[1], null]], self::children($data), 'children continue the MCQ serial; no answers on the question copy');
        $this->assertSame(1, $data['sections'][1]['items'][0]['no'], 'written questions keep their own serial');
        $this->assertSame([], $data['answer_key']);

        $html = $this->html($i, $admin, $paper['id']);
        $this->assertSame(1, substr_count($html, 'STIMULUS-TEXT'), 'the stimulus prints once');
        $this->assertMatchesRegularExpression('/2\.\s*CHILD-ONE.*\[1\].*3\.\s*CHILD-TWO.*\[2\]/s', $html, 'children print numbered with their own marks, in order');
    }

    public function test_a_child_without_marks_blocks_the_group(): void
    {
        [$i, $admin] = $this->setUpInstitution('stim-nomarks');
        QbQuestionItem::where('qb_question_id', $this->group->id)->where('prompt_text', 'CHILD-TWO')->update(['marks' => 0]);
        $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $this->body())->assertStatus(422)->assertJsonValidationErrors('sections');
    }

    public function test_option_sets_shuffle_each_child_and_the_key_follows(): void
    {
        [$i, $admin] = $this->setUpInstitution('stim-options');
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $this->body(['sets_count' => 4]))->assertCreated()->json('data.id');
        $this->api('POST', $this->hostOf($i), "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'options'])->assertOk();
        $labels = ['ক', 'খ', 'গ', 'ঘ'];
        $moved = false;
        foreach (['A', 'B', 'C', 'D'] as $set) {
            $data = $this->printed($i, $admin, $id, $set, true);
            $children = self::children($data);
            $this->assertSame([2, 3], array_keys($children), "set {$set}: children stay numbered 2 and 3");
            $key = collect($data['answer_key'])->keyBy('no');
            foreach ([2 => [0, 'Village'], 3 => [1, 'Jute']] as $no => [$k, $right]) {
                [$prompt, $options, $correct] = $children[$no];
                $this->assertEqualsCanonicalizing(self::CHOICES[$k], $options, "set {$set}: the same choices");
                $this->assertSame($right, $options[$correct], "set {$set}: the printed answer follows the choice");
                $this->assertSame([$labels[array_search($right, $options, true)]], $key[$no]['correct'], "set {$set}: the frozen key follows the choice");
                $moved = $moved || $options !== self::CHOICES[$k];
            }
            $this->assertSame($data, $this->printed($i, $admin, $id, $set, true), "set {$set} prints the same every time");
        }
        $this->assertTrue($moved, 'some set reorders a child\'s choices');
    }

    public function test_serial_sets_move_the_group_as_one_unit(): void
    {
        [$i, $admin] = $this->setUpInstitution('stim-serial');
        $extra = QbQuestion::create(['qb_question_type_id' => $this->mcq->qb_question_type_id, 'qb_subject_id' => $this->mcq->qb_subject_id, 'question_text' => 'MCQ-2', 'status' => 'published', 'created_by' => $this->super->id]);
        foreach (['B1' => true, 'B2' => false] as $text => $ok) QbQuestionOption::create(['qb_question_id' => $extra->id, 'label' => 'x', 'content_text' => $text, 'is_correct' => $ok]);
        Tenancy::as($i, fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $extra->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']));
        $body = $this->body(['sets_count' => 3]);
        $body['sections'][0]['items'][] = ['qb_question_id' => $extra->id, 'marks' => '1'];
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, $body)->assertCreated()->json('data.id');
        $this->api('POST', $this->hostOf($i), "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'serial'])->assertOk();
        foreach (['A', 'B', 'C'] as $set) {
            $data = $this->printed($i, $admin, $id, $set, false);
            $children = self::children($data);
            $this->assertSame(['CHILD-ONE', 'CHILD-TWO'], array_column(array_values($children), 0), "set {$set}: children together and in order");
            $this->assertSame([self::CHOICES[0], self::CHOICES[1]], array_column(array_values($children), 1), "set {$set}: serial never shuffles choices");
            $first = array_key_first($children);
            $this->assertSame([$first, $first + 1], array_keys($children), "set {$set}: consecutive MCQ serials");
            $mcqNos = collect($data['sections'][0]['items'])->pluck('no')->filter()->values()->all();
            $this->assertEqualsCanonicalizing([1, 2, 3, 4], array_merge($mcqNos, array_keys($children)), "set {$set}: one continuous MCQ serial");
        }
    }

    private function html($i, User $admin, int $id): string
    {
        $this->bindTenant($i);
        $this->actingAs($admin);
        $fake = new class extends \App\Services\PdfService {
            public ?string $html = null;
            public function render(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait', bool $qbankFigures = false): string
            {
                $this->html = view($view, $data + ['institution' => Tenancy::current(), 'theme' => app(\App\Services\ThemeService::class)->getTheme(Tenancy::current()),
                    'locale' => 'bn', 'dir' => 'ltr', 'logo' => null])->render();
                return '%PDF';
            }
        };
        $request = \Illuminate\Http\Request::create('/', 'GET', ['set' => 'A', 'answers' => '0']);
        $request->setUserResolver(fn () => $admin);
        app(\App\Http\Controllers\QuestionBank\QbPaperController::class)->pdf($request, $id, $fake);
        return $fake->html;
    }
}
