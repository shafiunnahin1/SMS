<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbOmrForm, QbOmrScan, QbPaperVariant, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D126 (2), R2.1.5: qbank's subsets on SMS papers - up to 26 sets, strategy options / serial / both, no repeated order, qbank's
// capacity limit, A-Z or ক-ঞ names; on final every set is frozen with its own answer key, so a later edit never changes it.
class QbPaperSetsTest extends TestCase
{
    use RefreshDatabase;

    private array $mcqs = [];

    protected function setUp(): void
    {
        parent::setUp();
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        foreach ([['২ + ২ = ?', ['৪', '৩', '৫', '৬']], ['৩ × ৩ = ?', ['৯', '৬', '১২', '৩']], ['১০ ÷ ২ = ?', ['৫', '২', '৮', '১০']]] as [$text, $opts]) {
            $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => $text, 'status' => 'published', 'created_by' => $super->id]);
            foreach ($opts as $k => $o) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => $o, 'is_correct' => $k === 0, 'sort_order' => $k]);
            $this->mcqs[] = $q;
        }
    }

    private function paper(int $sets, array $questions = null): array
    {
        $i = $this->makeInstitution('sets' . $sets . count($questions ?? $this->mcqs));
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, function () use ($admin) {
            foreach ($this->mcqs as $q) QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $items = array_map(fn ($q) => ['qb_question_id' => $q->id, 'marks' => '1'], $questions ?? $this->mcqs);
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, ['title' => 'সাপ্তাহিক', 'sets_count' => $sets,
            'sections' => [['title' => 'ক-বিভাগ', 'items' => $items]]])->assertCreated()->json('data.id');
        return [$this->hostOf($i), $admin, $id, $i];
    }

    private function printed(string $host, User $as, int $id, string $set, bool $answers = false): array
    {
        return $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set={$set}&format=json" . ($answers ? '&answers=1' : ''), $as)->assertOk()->json('data');
    }

    private const RIGHT = ['২ + ২ = ?' => '৪', '৩ × ৩ = ?' => '৯', '১০ ÷ ২ = ?' => '৫'];   // each question's correct option

    public function test_many_sets_are_frozen_at_final_each_with_its_own_answer_key(): void
    {
        [$host, $admin, $id, $i] = $this->paper(5);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'both', 'set_names' => 'bangla'])->assertOk();
        $codes = Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->pluck('code')->all());
        $this->assertSame(['ক', 'খ', 'গ', 'ঘ', 'ঙ'], $codes);

        $orders = [];
        foreach (['A', 'B', 'C', 'D', 'E'] as $k => $set) {
            $d = $this->printed($host, $admin, $id, $set, true);
            $this->assertSame($codes[$k], $d['set_code']);
            $items = $d['sections'][0]['items'];
            $orders[] = json_encode(array_map(fn ($it) => [$it['question']['question_text'], array_column($it['question']['options'], 'content_text')], $items));
            foreach ($items as $it) {                                        // the key names the label where the right answer now sits
                $right = collect($it['question']['options'])->firstWhere('content_text', self::RIGHT[$it['question']['question_text']]);
                $this->assertSame([$right['label']], collect($d['answer_key'])->firstWhere('no', $it['no'])['correct'], "set {$set} question {$it['no']}");
            }
        }
        $this->assertCount(5, array_unique($orders), 'no two sets print the same order');
        $first = json_decode($orders[0], true);
        $this->assertSame(['২ + ২ = ?', ['৪', '৩', '৫', '৬']], $first[0], 'set ক is the paper as built');

        // a later edit of a question does not change a printed set
        $before = $this->printed($host, $admin, $id, 'C', true);
        QbQuestionOption::where('qb_question_id', $this->mcqs[0]->id)->update(['is_correct' => false]);
        QbQuestionOption::where('qb_question_id', $this->mcqs[0]->id)->where('sort_order', 3)->update(['is_correct' => true]);
        $after = $this->printed($host, $admin, $id, 'C', true);
        $this->assertSame($before['answer_key'], $after['answer_key']);
        $this->assertSame(array_map(fn ($it) => array_column($it['question']['options'], 'content_text'), $before['sections'][0]['items']),
            array_map(fn ($it) => array_column($it['question']['options'], 'content_text'), $after['sections'][0]['items']), 'the same order every time');
        $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=F&format=json", $admin)->assertStatus(422)->assertJsonPath('error', 'qb_no_such_set');
    }

    public function test_the_print_accepts_qbo1_layout_settings(): void
    {
        [$host, $admin, $id, $i] = $this->paper(1);
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
        $print = function (array $q) use ($fake, $admin, $id) {
            $request = \Illuminate\Http\Request::create('/', 'GET', $q);
            $request->setUserResolver(fn () => $admin);
            app(\App\Http\Controllers\QuestionBank\QbPaperController::class)->pdf($request, $id, $fake);
            return $fake->html;
        };
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin)->assertOk();
        $layout = $print(['set' => 'A', 'columns' => '4', 'paper' => 'a5', 'orientation' => 'landscape']);
        $this->assertStringContainsString('class="cols-4"', $layout);
        $this->assertStringContainsString('data-paper="a5"', $layout);
        $this->assertStringContainsString('data-orientation="landscape"', $layout);
        $this->assertStringContainsString('page-break', $layout);

        $auto = $print(['set' => 'A', 'columns' => 'auto', 'paper' => 'letter', 'orientation' => 'portrait']);
        $this->assertStringContainsString('class="cols-auto"', $auto);
        $this->assertStringContainsString('font-size: clamp', $auto);
    }

    public function test_qbanks_capacity_check_limits_the_sets(): void
    {
        [$host, $admin, $id] = $this->paper(3, [$this->mcqs[0]]);         // one question: serial has 1 order, options has 4! = 24
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'serial'])->assertStatus(422)
            ->assertJsonPath('error', 'qb_sets_capacity');
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'options'])->assertOk();
        [$host2, $admin2] = $this->paper(1);
        $this->api('POST', $host2, 'question-bank/papers', $admin2, ['title' => 'x', 'sets_count' => 256,   // D173 (owner-approved 2026-10-28): the cap is now 255
           
            'sections' => [['title' => 'ক', 'items' => [['qb_question_id' => $this->mcqs[0]->id, 'marks' => '1']]]]])->assertStatus(422);
    }

    public function test_serial_keeps_options_and_options_keeps_questions(): void
    {
        [$host, $admin, $id] = $this->paper(2);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'serial'])->assertOk();
        $b = $this->printed($host, $admin, $id, 'B')['sections'][0]['items'];
        foreach ($b as $it) $this->assertSame(self::RIGHT[$it['question']['question_text']], $it['question']['options'][0]['content_text'], 'serial: the options stay as written');
        $this->assertNotSame(['২ + ২ = ?', '৩ × ৩ = ?', '১০ ÷ ২ = ?'], array_column(array_column($b, 'question'), 'question_text'), 'serial: the questions move');

        [$host, $admin, $id] = $this->paper(3, array_slice($this->mcqs, 0, 2));
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'options'])->assertOk();
        $c = $this->printed($host, $admin, $id, 'C')['sections'][0]['items'];
        $this->assertSame(['২ + ২ = ?', '৩ × ৩ = ?'], array_column(array_column($c, 'question'), 'question_text'), 'options: the questions stay in place');
    }

    /** D126 (4): the printed set carries its code, two columns on request, and its own answer key on the answers copy */
    public function test_the_print_shows_the_set_code_columns_and_the_answer_key(): void
    {
        [$host, $admin, $id, $i] = $this->paper(2);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['set_names' => 'bangla'])->assertOk();
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
        $print = function (array $q) use ($fake, $admin, $id) {
            $request = \Illuminate\Http\Request::create('/', 'GET', $q);
            $request->setUserResolver(fn () => $admin);
            app(\App\Http\Controllers\QuestionBank\QbPaperController::class)->pdf($request, $id, $fake);
            return $fake->html;
        };
        $plain = $print(['set' => 'B', 'columns' => '2']);
        $this->assertStringContainsString('সেট: খ', $plain);
        $this->assertStringContainsString('class="cols-2"', $plain);
        $this->assertStringNotContainsString('উত্তরমালা', $plain);
        $withKey = $print(['set' => 'B', 'answers' => '1']);
        $this->assertStringContainsString('উত্তরমালা — সেট খ', $withKey);
        $this->assertStringNotContainsString('class="cols-2"', $withKey);
    }

    // qbank's "create subsets" on a final paper (QuestionSetController::storeSubsets): more sets after the frozen ones
    public function test_more_sets_are_added_to_a_final_paper_without_changing_the_printed_ones(): void
    {
        [$host, $admin, $id, $i] = $this->paper(1);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'both'])->assertOk();
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'both'])->assertStatus(422)->assertJsonPath('error', 'qb_paper_final');   // without a count it is still "already final"
        $a = $this->printed($host, $admin, $id, 'A', true);

        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['count' => 2, 'strategy' => 'both'])->assertOk()->assertJsonPath('data.sets_count', 3);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['count' => 1, 'strategy' => 'options'])->assertOk()->assertJsonPath('data.sets_count', 4);
        $variants = Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->get());
        $this->assertSame(['A', 'B', 'C', 'D'], $variants->pluck('code')->all());
        $this->assertSame(['both', 'both', 'both', 'options'], $variants->pluck('strategy')->all());
        $again = $this->printed($host, $admin, $id, 'A', true);
        $this->assertSame([$a['sections'], $a['answer_key'], $a['set_code']], [$again['sections'], $again['answer_key'], $again['set_code']], 'set A prints exactly as before');

        $orders = [];
        foreach (['A', 'B', 'C', 'D'] as $set) {
            $d = $this->printed($host, $admin, $id, $set, true);
            $items = $d['sections'][0]['items'];
            $orders[] = json_encode(array_map(fn ($it) => [$it['question']['question_text'], array_column($it['question']['options'], 'content_text')], $items));
            foreach ($items as $it) {
                $right = collect($it['question']['options'])->firstWhere('content_text', self::RIGHT[$it['question']['question_text']]);
                $this->assertSame([$right['label']], collect($d['answer_key'])->firstWhere('no', $it['no'])['correct'], "set {$set}");
            }
        }
        $this->assertCount(4, array_unique($orders), 'an added set never repeats an earlier order');
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['count' => 300, 'strategy' => 'both'])->assertStatus(422);   // D173 (owner-approved 2026-10-28): past the 255 cap
    }

    public function test_sets_are_not_added_once_an_omr_sheet_is_scanned_and_not_on_another_institutions_paper(): void
    {
        [$host, $admin, $id, $i] = $this->paper(1);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'both'])->assertOk();
        [$otherHost, $otherAdmin] = $this->paper(2);
        $this->api('POST', $otherHost, "question-bank/papers/{$id}/finalize", $otherAdmin, ['count' => 1, 'strategy' => 'both'])->assertNotFound();

        $form = Tenancy::as($i, fn () => QbOmrForm::create(['qb_paper_id' => $id, 'code' => 'F1', 'settings_json' => ['is_generated' => true], 'locked_at' => now()]));
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['count' => 1, 'strategy' => 'both'])->assertOk();
        $this->assertNull(Tenancy::as($i, fn () => $form->fresh()->locked_at), 'a generated OMR layout is unlocked to be rebuilt with the new set');

        Tenancy::as($i, fn () => QbOmrScan::create(['qb_omr_form_id' => $form->id, 'layout_version' => 1, 'status' => 'pending_review', 'source' => 'upload']));
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['count' => 1, 'strategy' => 'both'])->assertStatus(422)->assertJsonPath('error', 'qb_paper_scanned');
        $this->assertSame(2, Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->count()));
    }

    // D157: one or more sets deleted together; the main set stays; the rest are renamed in order and keep their own order and key
    public function test_sets_are_deleted_together_and_the_rest_renamed_in_order(): void
    {
        [$host, $admin, $id, $i] = $this->paper(5);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'both', 'set_names' => 'bangla'])->assertOk();
        $before = [];
        foreach (['A', 'B', 'C', 'D', 'E'] as $set) $before[$set] = $this->printed($host, $admin, $id, $set, true);

        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['remove' => [1]])->assertStatus(422)->assertJsonPath('error', 'qb_set_main');
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['remove' => [9]])->assertStatus(422)->assertJsonPath('error', 'qb_no_such_set');
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['remove' => [2, 4]])->assertOk()
            ->assertJsonPath('data.sets_count', 3)->assertJsonPath('data.sets.1.code', 'খ')->assertJsonPath('data.sets.2.code', 'গ');

        // old গ (C) is now খ (B), old ঙ (E) is now গ (C): the same questions, options and key, only the name moved
        foreach (['B' => 'C', 'C' => 'E'] as $now => $was) {
            $after = $this->printed($host, $admin, $id, $now, true);
            $this->assertSame([$before[$was]['sections'], $before[$was]['answer_key']], [$after['sections'], $after['answer_key']], "old {$was} is new {$now}");
        }
        $this->assertSame($before['A']['sections'], $this->printed($host, $admin, $id, 'A', true)['sections']);
        $this->assertSame(['ক', 'খ', 'গ'], Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->pluck('code')->all()));
        $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=D&format=json", $admin)->assertStatus(422)->assertJsonPath('error', 'qb_no_such_set');

        // a new set after a deletion takes the next name and never repeats a kept order
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['count' => 1, 'strategy' => 'both'])->assertOk()->assertJsonPath('data.sets.3.code', 'ঘ');

        [$otherHost, $otherAdmin] = $this->paper(2);
        $this->api('POST', $otherHost, "question-bank/papers/{$id}/finalize", $otherAdmin, ['remove' => [2]])->assertNotFound();
        $form = Tenancy::as($i, fn () => QbOmrForm::create(['qb_paper_id' => $id, 'code' => 'F2', 'settings_json' => ['is_generated' => true], 'locked_at' => now()]));
        Tenancy::as($i, fn () => QbOmrScan::create(['qb_omr_form_id' => $form->id, 'layout_version' => 1, 'status' => 'pending_review', 'source' => 'upload']));
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['remove' => [2]])->assertStatus(422)->assertJsonPath('error', 'qb_paper_scanned');
    }
}
