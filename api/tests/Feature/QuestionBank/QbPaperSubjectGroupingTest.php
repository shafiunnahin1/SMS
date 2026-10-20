<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbOmrForm, QbPaperVariant, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D128: a multi-subject paper grouped by subject in the teacher's order; sets shuffle only inside a subject; numbering continuous;
// the OMR sheet heads each subject's bubbles with the same row numbers; frozen sets keep the grouping.
class QbPaperSubjectGroupingTest extends TestCase
{
    use RefreshDatabase;

    private array $q = [];
    private array $subjects = [];

    protected function setUp(): void
    {
        parent::setUp();
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $this->subjects = [QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id, QbSubject::create(['name_bn' => 'বিজ্ঞান', 'name_en' => 'Science'])->id];
        foreach (range(0, 7) as $n) {                                 // interleaved: maths, science, maths, science ...
            $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $this->subjects[$n % 2], 'question_text' => "Q{$n}", 'status' => 'published', 'created_by' => $super->id]);
            foreach (range(0, 3) as $k) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => "o{$k}", 'is_correct' => $k === 0, 'sort_order' => $k]);
            $this->q[] = $q;
        }
    }

    public function test_subject_blocks_in_teacher_order_shuffle_only_inside_and_reach_the_omr_sheet(): void
    {
        $i = $this->makeInstitution('grouping');
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, function () use ($admin) {
            foreach ($this->q as $q) QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $host = $this->hostOf($i);
        [$maths, $science] = $this->subjects;
        $id = $this->api('POST', $host, 'question-bank/papers', $admin, ['title' => 'মিশ্র', 'sets_count' => 4,
            'instructions_json' => ['group_by_subject' => true, 'subject_order' => [$science, $maths]],
            'sections' => [['title' => 'MCQ', 'items' => array_map(fn ($q) => ['qb_question_id' => $q->id, 'marks' => '1'], $this->q)]]])
            ->assertCreated()->assertJsonPath('data.subjects.0.id', $science)->assertJsonPath('data.subjects.1.name', 'গণিত')->json('data.id');
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin, ['strategy' => 'serial'])->assertOk();

        $subjectOf = collect($this->q)->mapWithKeys(fn ($q) => [$q->id => $q->qb_subject_id]);
        $orders = [];
        foreach (Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->get()) as $v) {
            $items = $v->layout_json[0]['items'];
            $this->assertSame([$science, $science, $science, $science, $maths, $maths, $maths, $maths], array_column($items, 'qb_subject_id'), "set {$v->code}: science block first");
            foreach ($items as $it) $this->assertSame($subjectOf[$it['qb_question_id']], $it['qb_subject_id']);
            $orders[] = json_encode(array_column($items, 'qb_question_id'));
        }
        $this->assertCount(4, array_unique($orders), 'sets differ, only inside the blocks');

        $printed = $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=B&format=json", $admin)->assertOk()->json('data.sections.0.items');
        $this->assertSame(range(1, 8), array_column($printed, 'no'), 'numbering runs on across subjects');
        $this->assertSame(['বিজ্ঞান', null, null, null, 'গণিত', null, null, null], array_column($printed, 'subject'));

        $this->api('PUT', $host, "question-bank/papers/{$id}/omr-form", $admin, ['settings' => [
            'title' => 'OMR', 'roll_digits' => 4, 'option_count' => 4, 'option_language' => 'bangla',
            'info_boxes' => ['class' => true, 'roll' => true, 'subject' => true, 'set' => true], 'page_size' => 'a4', 'page_orientation' => 'portrait',
            'answer_columns' => '2', 'question_mark' => '1.00', 'negative_mark_enabled' => false, 'negative_mark' => '0.00', 'multiple_answer_policy' => 'wrong',
        ]])->assertOk();
        $this->api('POST', $host, "question-bank/papers/{$id}/omr-form/generate", $admin)->assertOk();
        $settings = Tenancy::as($i, fn () => QbOmrForm::where('qb_paper_id', $id)->first()->settings_json);
        $this->assertSame([[$science, 0, 4, 'বিজ্ঞান'], [$maths, 4, 4, 'গণিত']], array_map(fn ($b) => [$b['subject_id'], $b['start'], $b['count'], $b['name']], $settings['subject_blocks']));
        $columns = $settings['geometry']['answers']['columns'];
        $this->assertSame(range(0, 7), collect($columns)->flatMap(fn ($c) => array_column($c['rows'], 'question_index'))->all(), 'rows keep their numbers');
        $headings = collect($columns)->flatMap(fn ($c) => $c['headings'] ?? []);
        $this->assertSame(['বিজ্ঞান', 'গণিত'], $headings->pluck('label')->all());
        foreach ($columns as $c) {
            $tops = array_merge(array_map(fn ($r) => round($r['number']['top'], 6), $c['rows']), array_map(fn ($h) => round($h['rect']['top'], 6), $c['headings'] ?? []));
            $this->assertSame(count($tops), count(array_unique($tops)), 'a heading never overlaps a row');
            if (isset($c['headings'])) $this->assertNotSame(max($tops), round(end($c['headings'])['rect']['top'], 6), 'a heading never ends a column');
        }
    }

    public function test_an_ungrouped_paper_keeps_its_layout(): void
    {
        $i = $this->makeInstitution('nogroup');
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, function () use ($admin) {
            foreach ($this->q as $q) QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']);
        });
        $host = $this->hostOf($i);
        $id = $this->api('POST', $host, 'question-bank/papers', $admin, ['title' => 'সাধারণ', 'sets_count' => 2,
            'sections' => [['title' => 'MCQ', 'items' => array_map(fn ($q) => ['qb_question_id' => $q->id, 'marks' => '1'], $this->q)]]])->assertCreated()->json('data.id');
        $this->api('POST', $host, "question-bank/papers/{$id}/finalize", $admin)->assertOk();
        $first = Tenancy::as($i, fn () => QbPaperVariant::where('qb_paper_id', $id)->orderBy('variant_number')->first()->layout_json[0]['items']);
        $this->assertSame(array_map(fn ($q) => $q->id, $this->q), array_column($first, 'qb_question_id'));
        $this->assertArrayNotHasKey('qb_subject_id', $first[0]);
        $printed = $this->api('GET', $host, "question-bank/papers/{$id}/pdf?set=A&format=json", $admin)->assertOk()->json('data.sections.0.items');
        $this->assertSame(array_fill(0, 8, null), array_column($printed, 'subject'));
    }
}
