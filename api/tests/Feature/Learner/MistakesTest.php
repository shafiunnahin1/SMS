<?php

namespace Tests\Feature\Learner;

use App\Models\{LearnerProfile, QbChapter, QbClassLevel, QbPrice, QbQuestion, QbQuestionType, QbQuiz, QbQuizAttempt, QbSubject, User};
use App\Services\Learner\LearnerRegistrationService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D238 MST.1: "my mistakes" from the student's own practice rounds and quizzes - the latest answered try decides, unanswered is not a
// mistake, only open questions, never the right answer in the list; a practice round from the list; another student sees nothing.
class MistakesTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private QbSubject $math;
    private QbChapter $ch1;
    private QbChapter $ch2;
    private int $type;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = $this->makeUser(null, 'super_admin');
        $this->math = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $this->ch1 = QbChapter::create(['qb_subject_id' => $this->math->id, 'name_bn' => '১', 'name_en' => 'Ch 1']);
        $this->ch2 = QbChapter::create(['qb_subject_id' => $this->math->id, 'name_bn' => '২', 'name_en' => 'Ch 2']);
        $this->type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        foreach (['chapter_pack' => '0.00', 'resource_pdf' => '20.00'] as $kind => $amount) {
            QbPrice::create(['audience' => 'student', 'item_kind' => $kind, 'amount' => $amount, 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        }
    }

    private function mcq(QbChapter $c, string $right = 'ক'): QbQuestion
    {
        $q = QbQuestion::create(['qb_question_type_id' => $this->type, 'qb_subject_id' => $this->math->id, 'qb_chapter_id' => $c->id, 'question_text' => '2+2?',
            'explanation_text' => 'EXPLAINED', 'status' => 'published', 'created_by' => $this->super->id, 'published_at' => now()]);
        foreach (['ক', 'খ'] as $i => $l) $q->options()->create(['label' => $l, 'content_text' => (string) ($i + 4), 'is_correct' => $l === $right, 'sort_order' => $i]);
        return $q;
    }

    private function learner(): User
    {
        $i = LearnerRegistrationService::institution();
        $u = User::create(['institution_id' => $i->id, 'name' => 'L', 'phone' => '0171' . random_int(1000000, 9999999), 'role' => 'student', 'password' => 'Learner@2026', 'is_active' => true]);
        $class = QbClassLevel::firstOrCreate(['name_en' => 'C9'], ['name_bn' => '৯', 'education_level' => 'secondary', 'is_active' => true])->id;
        Tenancy::as($i, fn () => LearnerProfile::create(['user_id' => $u->id, 'qb_class_level_id' => $class]));
        return $u;
    }

    public function test_mistakes_come_and_go_and_feed_a_practice_round(): void
    {
        $this->travelTo('2026-11-21 10:00:00');
        $a = $this->mcq($this->ch1, 'ক');
        $b = $this->mcq($this->ch1, 'খ');
        $c = $this->mcq($this->ch1, 'ক');
        $closed = $this->mcq($this->ch2, 'ক');
        $host = LearnerRegistrationService::host();
        $u = $this->learner();
        $this->api('POST', $host, 'student/qb/orders', $u, ['items' => [['item_type' => 'chapter_pack', 'item_id' => $this->ch1->id]]])->assertOk();
        $this->assertSame([], $this->api('GET', $host, 'student/qb/mistakes', $u)->assertOk()->json('data'));
        $this->api('POST', $host, 'student/qb/mistakes/practice', $u, ['qb_subject_id' => $this->math->id])->assertStatus(422)->assertJsonPath('error', 'mistakes_none');

        // a practice round: a wrong, b right, c left empty (not a mistake)
        $r1 = $this->api('POST', $host, 'student/qb/practice', $u, ['qb_subject_id' => $this->math->id, 'qb_chapter_id' => $this->ch1->id])->json('data.id');
        $this->api('POST', $host, "student/qb/practice/{$r1}/submit", $u, ['answers' => [$a->id => 'খ', $b->id => 'খ']])->assertOk();
        // a quiz an hour later: b wrong; the closed chapter's question wrong too
        $this->travel(1)->hours();
        $quiz = QbQuiz::create(['access' => 'free', 'title' => 'Q', 'duration_minutes' => 10, 'question_count' => 2, 'rule' => 'fixed', 'is_active' => true]);
        Tenancy::as(\App\Models\Institution::find($u->institution_id), fn () => QbQuizAttempt::create(['student_user_id' => $u->id, 'qb_quiz_id' => $quiz->id, 'started_at' => now()->subMinutes(5),
            'submitted_at' => now(), 'score' => '0.00', 'total' => '2.00', 'answers' => ['q' => [$b->id, $closed->id], 'given' => [(string) $b->id => 'ক', (string) $closed->id => 'খ'],
                'marks' => [(string) $b->id => ['score' => '0.00', 'total' => '1.00', 'correct' => false], (string) $closed->id => ['score' => '0.00', 'total' => '1.00', 'correct' => false]]]]));

        $list = $this->api('GET', $host, 'student/qb/mistakes', $u)->assertOk();
        $this->assertSame([$b->id, $a->id], array_column(array_column($list->json('data'), 'question'), 'id'), 'latest first; c unanswered and the closed question are left out');
        $this->assertSame(['ক', 1, true], [$list->json('data.0.your_answer'), $list->json('data.0.times_wrong'), $list->json('data.0.can_practise')]);
        foreach (['is_correct', 'EXPLAINED', 'explanation_text'] as $hidden) $this->assertStringNotContainsString($hidden, $list->getContent(), "{$hidden} in the list");
        $this->assertSame([], $this->api('GET', $host, 'student/qb/mistakes', $u, ['qb_chapter_id' => $this->ch2->id])->json('data'));
        $this->assertSame([], $this->api('GET', $host, 'student/qb/mistakes', $this->learner())->json('data'), 'only the student\'s own');

        // practise them: a now right leaves the list, b wrong again stays (twice wrong)
        $this->travel(1)->hours();
        $round = $this->api('POST', $host, 'student/qb/mistakes/practice', $u, ['qb_subject_id' => $this->math->id])->assertCreated();
        $this->assertEqualsCanonicalizing([$a->id, $b->id], array_column($round->json('data.questions'), 'id'));
        foreach (['is_correct', 'EXPLAINED'] as $hidden) $this->assertStringNotContainsString($hidden, $round->getContent());
        $this->api('POST', $host, 'student/qb/practice/' . $round->json('data.id') . '/submit', $u, ['answers' => [$a->id => 'ক', $b->id => 'ক']])->assertOk();
        $after = $this->api('GET', $host, 'student/qb/mistakes', $u)->json('data');
        $this->assertSame([$b->id], array_column(array_column($after, 'question'), 'id'));
        $this->assertSame(2, $after[0]['times_wrong']);

        // wrong again later: a comes back
        $this->travel(1)->hours();
        $r3 = $this->api('POST', $host, 'student/qb/practice', $u, ['qb_subject_id' => $this->math->id, 'qb_chapter_id' => $this->ch1->id])->json('data.id');
        $this->api('POST', $host, "student/qb/practice/{$r3}/submit", $u, ['answers' => [$a->id => 'খ', $b->id => 'খ', $c->id => 'ক']])->assertOk();
        $this->assertSame([$a->id], array_column(array_column($this->api('GET', $host, 'student/qb/mistakes', $u)->json('data'), 'question'), 'id'));
    }
}
