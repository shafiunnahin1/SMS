<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbPrice, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D126 (3), R2.1.5: qbank's assessment blueprints - the Super Admin writes the rules (the total is the server's sum); a teacher's
// plan picks, in fixed order, only eligible questions (published, the rule's type and chapter, bought by the institution or free)
// and reports a rule without enough as short; another eligible question can be swapped in; inactive blueprints are not offered.
class QbBlueprintTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private array $q = [];
    private int $mcq;
    private int $creative;
    private int $subject;
    private int $algebra;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $this->mcq = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $this->creative = QbQuestionType::create(['slug' => 'creative', 'name_bn' => 'সৃজনশীল', 'name_en' => 'Creative', 'family' => 'creative'])->id;
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        $this->algebra = QbChapter::create(['qb_subject_id' => $this->subject, 'name_bn' => 'বীজগণিত', 'name_en' => 'Algebra'])->id;
        $geometry = QbChapter::create(['qb_subject_id' => $this->subject, 'name_bn' => 'জ্যামিতি', 'name_en' => 'Geometry'])->id;
        QbPrice::create(['audience' => 'institution', 'item_kind' => 'question_answer', 'qb_question_type_id' => $this->mcq, 'amount' => '0.50', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $make = function (string $key, string $status, int $chapter) {
            $q = QbQuestion::create(['qb_question_type_id' => $this->mcq, 'qb_subject_id' => $this->subject, 'qb_chapter_id' => $chapter, 'question_text' => "{$key}?", 'status' => $status, 'created_by' => $this->super->id]);
            QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => 'a', 'is_correct' => true]);
            $this->q[$key] = $q->id;
        };
        $make('bought1', 'published', $this->algebra);
        $make('unbought', 'published', $this->algebra);
        $make('draft', 'draft', $this->algebra);
        $make('geometry', 'published', $geometry);
        $make('bought2', 'published', $this->algebra);
        $make('bought3', 'published', $this->algebra);
    }

    private function blueprint(array $extra = []): int
    {
        return $this->api('POST', 'admin.' . config('tenancy.base_domain'), 'super/qb/blueprints', $this->super, $extra + ['name_bn' => 'অর্ধবার্ষিক গণিত', 'qb_subject_id' => $this->subject,
            'duration_minutes' => 90, 'items' => [
                ['section_title' => 'ক-বিভাগ', 'qb_question_type_id' => $this->mcq, 'question_count' => 2, 'marks_each' => '1', 'qb_chapter_id' => $this->algebra],
                ['section_title' => 'খ-বিভাগ', 'qb_question_type_id' => $this->creative, 'question_count' => 1, 'marks_each' => '10'],
            ]])->assertCreated()->json('data.id');
    }

    public function test_the_super_admin_writes_blueprints_and_the_server_sums_them(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $id = $this->blueprint();
        $this->api('GET', $central, 'super/qb/blueprints', $this->super)->assertOk()->assertJsonPath('data.0.total_marks', '12.00')->assertJsonCount(2, 'data.0.items');
        $this->api('POST', $central, 'super/qb/blueprints', $this->super, ['name_bn' => 'x', 'qb_subject_id' => $this->subject, 'total_marks' => '99',
            'items' => [['section_title' => 'ক', 'qb_question_type_id' => $this->mcq, 'question_count' => 1, 'marks_each' => '1']]])->assertStatus(422);
        $this->api('PUT', $central, "super/qb/blueprints/{$id}", $this->super, ['name_bn' => 'বার্ষিক', 'qb_subject_id' => $this->subject,
            'items' => [['section_title' => 'ক', 'qb_question_type_id' => $this->mcq, 'question_count' => 3, 'marks_each' => '2.50']]])->assertOk()->assertJsonPath('data.total_marks', '7.50');
        $i = $this->makeInstitution('bp0');
        $this->api('POST', $this->hostOf($i), 'super/qb/blueprints', $this->makeUser($i, 'admin'), ['name_bn' => 'x'])->assertStatus(404);
    }

    public function test_a_plan_picks_only_eligible_questions_and_reports_short_rules(): void
    {
        $id = $this->blueprint();
        $i = $this->makeInstitution('bp1');
        $teacher = $this->makeUser($i, 'teacher');
        Tenancy::as($i, function () use ($teacher) {
            foreach (['bought1', 'bought2', 'bought3', 'geometry', 'draft'] as $k) QbUnlock::create(['item_type' => 'question', 'item_id' => $this->q[$k], 'unlocked_by' => $teacher->id, 'price' => '0.50', 'reason' => 'paid']);
        });
        $host = $this->hostOf($i);
        $this->api('GET', $host, 'question-bank/blueprints', $teacher)->assertOk()->assertJsonCount(1, 'data');
        $plan = $this->api('POST', $host, "question-bank/blueprints/{$id}/plan", $teacher)->assertOk()->json('data');
        $this->assertSame([$this->q['bought1'], $this->q['bought2']], array_column($plan['sections'][0]['items'], 'qb_question_id'), 'oldest eligible first: not unbought, draft or another chapter');
        $this->assertSame('1.00', $plan['sections'][0]['items'][0]['marks']);
        $this->assertSame([[0, 2, 2, 0]], array_map(fn ($r) => array_values($r), array_map(fn ($r) => ['rule' => $r['rule'], 'wanted' => $r['wanted'], 'found' => $r['found'], 'short' => $r['short']], $plan['sections'][0]['rules'])));
        $this->assertSame([], $plan['sections'][1]['items']);
        $this->assertSame(1, $plan['short'], 'no creative question: short, never filled from elsewhere');

        $swap = $this->api('GET', $host, "question-bank/blueprints/{$id}/candidates?rule=0&used[]={$this->q['bought1']}&used[]={$this->q['bought2']}", $teacher)->assertOk()->json('data');
        $this->assertSame([$this->q['bought3']], array_column($swap, 'id'));
        $again = $this->api('POST', $host, "question-bank/blueprints/{$id}/plan", $teacher, ['exclude_ids' => [$this->q['bought1']]])->json('data');
        $this->assertSame([$this->q['bought2'], $this->q['bought3']], array_column($again['sections'][0]['items'], 'qb_question_id'));

        // the plan is saved as an ordinary paper (QB.8)
        $sections = array_map(fn ($s) => ['title' => $s['title'], 'items' => array_map(fn ($it) => ['qb_question_id' => $it['qb_question_id'], 'marks' => $it['marks']], $s['items'])],
            array_values(array_filter($plan['sections'], fn ($s) => $s['items'])));
        $this->api('POST', $host, 'question-bank/papers', $teacher, ['title' => 'অর্ধবার্ষিক গণিত', 'sections' => $sections])->assertCreated()->assertJsonPath('data.total_marks', '2.00');

        $this->api('PUT', 'admin.' . config('tenancy.base_domain'), "super/qb/blueprints/{$id}", $this->super, ['name_bn' => 'x', 'qb_subject_id' => $this->subject, 'is_active' => false,
            'items' => [['section_title' => 'ক', 'qb_question_type_id' => $this->mcq, 'question_count' => 1, 'marks_each' => '1']]])->assertOk();
        $this->api('GET', $host, 'question-bank/blueprints', $teacher)->assertOk()->assertJsonCount(0, 'data');
        $this->api('POST', $host, "question-bank/blueprints/{$id}/plan", $teacher)->assertNotFound();
    }
}
