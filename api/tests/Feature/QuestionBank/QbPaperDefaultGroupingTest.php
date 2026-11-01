<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbQuestion, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D178 QBG.1: a new paper with questions of more than one subject is grouped by subject (D128), subjects in the order first met;
// an explicit `group_by_subject: false` is kept; a single-subject paper is left as sent
class QbPaperDefaultGroupingTest extends TestCase
{
    use RefreshDatabase;

    private array $q = [];
    private array $subjects = [];

    protected function setUp(): void
    {
        parent::setUp();
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000041', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        foreach (['গণিত' => 'Maths', 'বাংলা' => 'Bangla'] as $bn => $en) $this->subjects[] = QbSubject::create(['name_bn' => $bn, 'name_en' => $en])->id;
        foreach ([1, 0, 1] as $k => $s) $this->q[] = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $this->subjects[$s], 'question_text' => "Q{$k}?", 'status' => 'published', 'created_by' => $super->id])->id;
    }

    private function create($i, User $t, array $ids, ?array $instructions = null)
    {
        return $this->api('POST', $this->hostOf($i), 'question-bank/papers', $t, ['title' => 'P', 'instructions_json' => $instructions,
            'sections' => [['title' => 'S', 'items' => array_map(fn ($id) => ['qb_question_id' => $id, 'marks' => '1'], $ids)]]])->assertCreated()->json('data');
    }

    public function test_a_new_multi_subject_paper_is_grouped_unless_told_not_to(): void
    {
        $i = $this->makeInstitution('qb-default-group');
        $t = $this->makeUser($i, 'teacher');
        Tenancy::as($i, fn () => array_map(fn ($id) => QbUnlock::create(['item_type' => 'question', 'item_id' => $id, 'unlocked_by' => $t->id, 'price' => '0.00', 'reason' => 'free']), $this->q));

        $two = $this->create($i, $t, $this->q, ['text' => 'Read all', 'group_by_subject' => null]);
        $this->assertTrue($two['instructions_json']['group_by_subject']);
        $this->assertSame([$this->subjects[1], $this->subjects[0]], $two['instructions_json']['subject_order'], 'subjects in the order first met');
        $this->assertSame('Read all', $two['instructions_json']['text']);

        $off = $this->create($i, $t, $this->q, ['group_by_subject' => false]);
        $this->assertFalse($off['instructions_json']['group_by_subject']);

        $one = $this->create($i, $t, [$this->q[0], $this->q[2]]);
        $this->assertNull($one['instructions_json']);
    }
}
