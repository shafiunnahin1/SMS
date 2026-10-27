<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbPaperVariant, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Services\QbPaperSets;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D173 SETC.1: set codes use only the OMR's A-J (or ক-ঞ) letters, one letter up to 10 sets, two up to 100, three above (cap 255 for
// now); every code of a paper has the same length; adding or deleting sets renames all of them for the new total while each set
// keeps its order and answer key - a paper made before D173 with K-Z sets too, whose OMR is refused until then; sets are printed by
// number (old A-Z links still work) and the OMR set box has one column per code letter.
class QbSetCodesTest extends TestCase
{
    use RefreshDatabase;

    private array $mcqs = [];

    protected function setUp(): void
    {
        parent::setUp();
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000039', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        foreach (range(1, 4) as $n) {
            $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => "Q{$n}", 'status' => 'published', 'created_by' => $super->id]);
            foreach (range(0, 3) as $k) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => "o{$n}{$k}", 'is_correct' => $k === 0, 'sort_order' => $k]);
            $this->mcqs[] = $q;
        }
    }

    private function paper(string $slug, int $sets): array
    {
        $i = $this->makeInstitution($slug);
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, fn () => array_map(fn ($q) => QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']), $this->mcqs));
        $id = $this->api('POST', $this->hostOf($i), 'question-bank/papers', $admin, ['title' => 'Codes', 'sets_count' => $sets,
            'sections' => [['title' => 'MCQ', 'items' => array_map(fn ($q) => ['qb_question_id' => $q->id, 'marks' => '1'], $this->mcqs)]]])->assertCreated()->json('data.id');
        return [$i, $admin, $id];
    }

    private function codes($i, int $id): array
    {
        return Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->pluck('code')->all());
    }

    private function layouts($i, int $id): array
    {
        return Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->pluck('layout_json')->map(fn ($l) => json_encode($l))->all());
    }

    public function test_codes_are_numbers_written_with_a_to_j(): void
    {
        $this->assertSame(['A', 'J'], [QbPaperSets::code(1, 1), QbPaperSets::code(10, 10)]);
        $this->assertSame(['AA', 'BE', 'JJ'], [QbPaperSets::code(1, 15), QbPaperSets::code(15, 15), QbPaperSets::code(100, 100)]);
        $this->assertSame(['AAA', 'BAA', 'CFE'], [QbPaperSets::code(1, 101), QbPaperSets::code(101, 101), QbPaperSets::code(255, 255)]);
        $this->assertSame(['ক', 'খঙ'], [QbPaperSets::code(1, 3, true), QbPaperSets::code(15, 15, true)]);
        $this->assertTrue(QbPaperSets::legacy('K'));
        $this->assertTrue(QbPaperSets::legacy('ট'));
        $this->assertFalse(QbPaperSets::legacy('BE'));
        $this->assertFalse(QbPaperSets::legacy('খঙ'));
    }

    public function test_adding_and_deleting_sets_renames_every_code_and_keeps_each_sets_order(): void
    {
        [$i, $admin, $id] = $this->paper('codes-grow', 10);
        $host = $this->hostOf($i);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'both'])->assertOk();
        $this->assertSame(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], $this->codes($i, $id));
        $before = $this->layouts($i, $id);

        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['count' => 5, 'strategy' => 'both'])->assertOk();
        $codes = $this->codes($i, $id);
        $this->assertSame(['AA', 'AB', 'AC'], array_slice($codes, 0, 3));
        $this->assertSame('BE', end($codes), 'set 15 of 15');
        $this->assertSame($before, array_slice($this->layouts($i, $id), 0, 10), 'each earlier set keeps its frozen order and key');

        // the 12th set prints by its number and by its old letter, with its new code
        $this->assertSame('BB', $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=12&format=json", $admin)->assertOk()->json('data.set_code'));
        $this->assertSame('BB', $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=L&format=json", $admin)->assertOk()->json('data.set_code'));
        $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=16&format=json", $admin)->assertStatus(422);

        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['remove' => range(11, 15)])->assertOk();
        $this->assertSame(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], $this->codes($i, $id), 'back to one letter');
        $this->assertSame($before, $this->layouts($i, $id));
    }

    public function test_a_pre_d173_paper_gets_no_omr_until_its_sets_change(): void
    {
        [$i, $admin, $id] = $this->paper('codes-legacy', 12);
        $host = $this->hostOf($i);
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'both'])->assertOk();
        $legacy = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];        // how D126 named them
        Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->get()->each(fn ($v, $k) => $v->update(['code' => $legacy[$k]])));
        $settings = ['settings' => ['title' => 'OMR', 'roll_digits' => 4, 'option_count' => 4, 'option_language' => 'latin',
            'info_boxes' => ['class' => false, 'roll' => true, 'subject' => true, 'set' => true], 'page_size' => 'a4', 'page_orientation' => 'portrait',
            'answer_columns' => 'auto', 'question_mark' => '1.00', 'negative_mark_enabled' => false, 'negative_mark' => '0.00', 'multiple_answer_policy' => 'wrong']];
        $this->api('PUT', $host, "question-bank/papers/{$id}/omr-form", $admin, $settings)->assertStatus(422)->assertJsonPath('error', 'qb_omr_legacy_set_codes');
        $this->assertSame($legacy, $this->codes($i, $id), 'nothing is renamed by itself');

        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['remove' => [12]])->assertOk();
        $this->assertSame(['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'BA'], $this->codes($i, $id));
        $saved = $this->api('PUT', $host, "question-bank/papers/{$id}/omr-form", $admin, $settings)->assertOk()->json('data.settings');
        $this->assertSame(2, $saved['info_boxes']['set']['digits'], 'one A-J column per code letter');
    }
}
