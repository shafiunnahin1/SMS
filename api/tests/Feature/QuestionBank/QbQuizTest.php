<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbPrice, QbQuestion, QbQuestionItem, QbQuestionOption, QbQuestionType, QbQuiz, QbQuizAttempt, QbQuizPackage, QbStudentPackageAccess, QbSubject, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// QB.10 (D66, docs/modules/question-bank.md §3ছ, §5): quizzes - free for every student, a package's only while its access lasts
// (expired: closed, past results readable), public ones also without login (nothing saved, no right answers). Marking is on the
// server: the student's own score is refused, answers after the deadline are ignored, and the server submits forgotten attempts.
class QbQuizTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $super;
    private int $subject;
    private QbQuestion $mcq;
    private QbQuestion $gap;
    private QbQuestion $match;
    private QbQuestion $creative;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        config(['services.bkash' => ['base_url' => 'https://bkash.sandbox.test/v1', 'app_key' => 'k', 'app_secret' => 's', 'username' => 'u', 'password' => 'p', 'sandbox' => true],
            'app.url' => 'https://' . config('tenancy.central_domains')[0]]);
        Http::fake([
            'bkash.sandbox.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.sandbox.test/v1/tokenized/checkout/create' => fn ($req) => Http::response(['paymentID' => 'PAY-' . $req['merchantInvoiceNumber'], 'bkashURL' => 'https://sandbox.bkash.test/pay']),
            'bkash.sandbox.test/v1/tokenized/checkout/execute' => fn ($req) => Http::response(['paymentID' => $req['paymentID'], 'trxID' => 'TRX9',
                'transactionStatus' => 'Completed', 'amount' => '20.00', 'merchantInvoiceNumber' => substr($req['paymentID'], 4)]),
        ]);
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = fn ($slug, $family, $ui = null) => QbQuestionType::create(['slug' => $slug, 'name_bn' => $slug, 'name_en' => $slug, 'family' => $family, 'ui_config' => $ui])->id;
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        $q = fn ($t, $text, array $extra = []) => QbQuestion::create(array_merge(['qb_question_type_id' => $t, 'qb_subject_id' => $this->subject, 'question_text' => $text,
            'status' => 'published', 'created_by' => $this->super->id, 'published_at' => now()], $extra));
        $this->mcq = $q($type('mcq', 'mcq'), '২+২ = ?', ['marks' => '2']);
        foreach (['ক' => ['3', false], 'খ' => ['4', true], 'গ' => ['5', false]] as $label => [$text, $ok]) {
            QbQuestionOption::create(['qb_question_id' => $this->mcq->id, 'label' => $label, 'content_text' => $text, 'is_correct' => $ok]);
        }
        $this->gap = $q($type('fill_in_the_blank', 'fill_gap'), 'বাংলাদেশের রাজধানী ___', ['answer_text' => 'Dhaka']);
        $this->match = $q($type('matching', 'matching', ['structure' => 'match']), 'মিলাও', ['marks' => '2']);
        foreach (['গরু' => 'ঘাস', 'বাঘ' => 'মাংস'] as $left => $right) QbQuestionItem::create(['qb_question_id' => $this->match->id, 'item_type' => 'match_pair', 'prompt_text' => $left, 'answer_json' => ['right' => $right]]);
        $this->creative = $q($type('creative', 'creative'), 'সৃজনশীল');
    }

    private function student($i, string $name): User
    {
        return User::create(['institution_id' => $i->id, 'name' => $name, 'username' => strtoupper($name), 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
    }

    private function quiz(array $extra = []): int
    {
        return $this->api('POST', $this->central, 'super/qb/quizzes', $this->super, array_merge(['title' => 'সাপ্তাহিক কুইজ', 'access' => 'free', 'duration_minutes' => 10,
            'rule' => 'fixed', 'question_ids' => [$this->mcq->id, $this->gap->id, $this->match->id], 'pass_mark' => '3'], $extra))->assertCreated()->json('data.id');
    }

    public function test_a_free_quiz_is_marked_on_the_server_and_answers_show_only_after_submitting(): void
    {
        $this->api('POST', $this->central, 'super/qb/quizzes', $this->super, ['title' => 'x', 'access' => 'free', 'duration_minutes' => 5, 'rule' => 'fixed',
            'question_ids' => [$this->mcq->id, $this->creative->id]])->assertStatus(422)->assertJsonValidationErrors('question_ids');   // creative is not auto-marked
        $id = $this->quiz();
        $this->assertSame(3, $this->api('GET', $this->central, "super/qb/quizzes/{$id}", $this->super)->json('data.question_count'));

        $i = $this->makeInstitution('quizfree');
        $host = $this->hostOf($i);
        $s = $this->student($i, 'qz-a');
        $this->assertTrue(collect($this->api('GET', $host, 'student/qb/quizzes', $s)->assertOk()->json('data'))->firstWhere('id', $id)['may_take']);
        $start = $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $s)->assertCreated();
        $json = $start->getContent();
        foreach (['Dhaka', 'ঘাস"', 'is_correct', 'answer_text'] as $secret) $this->assertStringNotContainsString($secret, $json, "no {$secret} during the quiz");
        $attempt = $start->json('data.id');
        $this->assertSame($attempt, $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $s)->json('data.id'), 'a running attempt is resumed');

        $answers = [(string) $this->mcq->id => 'খ', (string) $this->gap->id => '  dhaka ', (string) $this->match->id => ['ঘাস', 'ঘাস']];
        $this->api('POST', $host, "student/qb/attempts/{$attempt}/submit", $s, ['answers' => $answers, 'score' => '99'])->assertStatus(422);
        $r = $this->api('POST', $host, "student/qb/attempts/{$attempt}/submit", $s, ['answers' => $answers])->assertOk()->json('data');
        $this->assertSame(['4.00', '5.00', true], [$r['score'], $r['total'], $r['passed']]);          // 2 + 1 + half of 2
        $this->assertSame(['খ'], $r['review'][0]['right']);
        $this->assertSame('Dhaka', $r['review'][1]['question']['answer_text'], 'the answer after submitting');

        $again = $this->api('POST', $host, "student/qb/attempts/{$attempt}/submit", $s, ['answers' => []])->assertOk()->json('data.score');
        $this->assertSame('4.00', $again, 'a second submit changes nothing');
        $other = $this->student($i, 'qz-b');
        $this->api('GET', $host, "student/qb/attempts/{$attempt}", $other)->assertNotFound();
        $this->api('GET', $host, 'student/qb/quizzes', $this->makeUser($i, 'teacher'))->assertForbidden();
    }

    public function test_a_package_quiz_opens_with_the_package_and_closes_when_it_expires(): void
    {
        $package = QbQuizPackage::create(['title' => 'SSC প্যাকেজ', 'validity_days' => 30]);
        QbPrice::create(['audience' => 'student', 'item_kind' => 'quiz_package', 'amount' => '20.00', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $id = $this->quiz(['access' => 'package', 'qb_quiz_package_id' => $package->id]);
        $this->api('POST', $this->central, 'super/qb/quizzes', $this->super, ['title' => 'x', 'access' => 'free', 'qb_quiz_package_id' => $package->id, 'duration_minutes' => 5,
            'rule' => 'fixed', 'question_ids' => [$this->mcq->id]])->assertStatus(422);                                  // a free quiz has no package
        $i = $this->makeInstitution('quizpack');
        $host = $this->hostOf($i);
        $s = $this->student($i, 'qz-c');
        $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $s)->assertForbidden()->assertJsonPath('error', 'qb_package_needed');
        $this->assertSame('20.00', collect($this->api('GET', $host, 'student/qb/quiz-packages', $s)->json('data'))->firstWhere('id', $package->id)['price']);

        $buy = $this->api('POST', $host, "student/qb/quiz-packages/{$package->id}/buy", $s)->assertOk()->json('data');
        $this->assertSame(['20.00', false], [$buy['amount'], $buy['paid']]);
        $this->get("http://{$this->central}/api/v1/qb/student-orders/bkash/callback?ref={$buy['ref']}&paymentID=PAY-{$buy['ref']}&status=success")
            ->assertRedirect('http://' . $host . "/student/quizzes?payment=success&ref={$buy['ref']}");
        $access = Tenancy::as($i, fn () => QbStudentPackageAccess::firstOrFail());
        $this->assertSame(now()->addDays(30)->toDateString(), $access->expires_at->toDateString());

        $attempt = $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $s)->assertCreated()->json('data.id');
        $this->api('POST', $host, "student/qb/attempts/{$attempt}/submit", $s, ['answers' => [(string) $this->mcq->id => 'খ']])->assertOk()->assertJsonPath('data.score', '2.00');

        $this->travel(31)->days();
        $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $s)->assertForbidden()->assertJsonPath('error', 'qb_package_expired');
        $this->assertFalse(collect($this->api('GET', $host, 'student/qb/quizzes', $s)->json('data'))->firstWhere('id', $id)['may_take']);
        $this->api('GET', $host, "student/qb/attempts/{$attempt}", $s)->assertOk()->assertJsonPath('data.score', '2.00');   // the past result stays
        $this->assertSame(1, Tenancy::as($i, fn () => QbStudentPackageAccess::count()));
    }

    public function test_after_the_deadline_late_answers_are_ignored_and_the_server_submits(): void
    {
        $id = $this->quiz(['duration_minutes' => 5]);
        $i = $this->makeInstitution('quiztime');
        $host = $this->hostOf($i);
        [$a, $b, $c] = [$this->student($i, 'qz-d'), $this->student($i, 'qz-e'), $this->student($i, 'qz-g')];
        $one = $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $a)->json('data.id');
        $two = $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $b)->json('data.id');
        $three = $this->api('POST', $host, "student/qb/quizzes/{$id}/attempts", $c)->json('data.id');
        $this->api('PUT', $host, "student/qb/attempts/{$one}", $a, ['answers' => [(string) $this->mcq->id => 'ক']])->assertOk();   // wrong, saved
        $this->api('PUT', $host, "student/qb/attempts/{$two}", $b, ['answers' => [(string) $this->mcq->id => 'খ']])->assertOk();   // right, saved

        $this->travel(6)->minutes();
        $this->api('PUT', $host, "student/qb/attempts/{$one}", $a, ['answers' => [(string) $this->mcq->id => 'খ']])->assertStatus(422)->assertJsonPath('error', 'qb_quiz_time_over');
        $this->api('POST', $host, "student/qb/attempts/{$one}/submit", $a, ['answers' => [(string) $this->mcq->id => 'খ']])->assertOk()->assertJsonPath('data.score', '0.00');

        $this->api('POST', $host, "student/qb/attempts/{$three}/submit", $c, ['answers' => [(string) $this->mcq->id => 'খ']])->assertOk()
            ->assertJsonPath('data.score', '0.00');                                                    // a late submit counts only what was saved (nothing)
        $this->artisan('qb:close-quiz-attempts')->assertSuccessful();
        $row = Tenancy::as($i, fn () => QbQuizAttempt::findOrFail($two));
        $this->assertNotNull($row->submitted_at);
        $this->assertSame('2.00', (string) $row->score, 'the saved answer was marked');
    }

    public function test_public_quizzes_work_without_login_and_never_give_the_answers(): void
    {
        $public = $this->quiz(['access' => 'public']);
        $free = $this->quiz(['access' => 'free']);
        $list = $this->api('GET', $this->central, 'public/qb/quizzes')->assertOk()->json('data');
        $this->assertSame([$public], array_column($list, 'id'));
        $this->api('GET', $this->central, "public/qb/quizzes/{$free}")->assertNotFound();

        $show = $this->api('GET', $this->central, "public/qb/quizzes/{$public}")->assertOk();
        foreach (['Dhaka', 'is_correct', 'answer_text'] as $secret) $this->assertStringNotContainsString($secret, $show->getContent());
        $check = $this->api('POST', $this->central, "public/qb/quizzes/{$public}/check", null, ['question_ids' => [$this->mcq->id, $this->gap->id, $this->creative->id],
            'answers' => [(string) $this->mcq->id => 'ক', (string) $this->gap->id => 'Dhaka']])->assertOk();
        $this->assertSame(['1.00', '3.00', false], [$check->json('data.score'), $check->json('data.total'), $check->json('data.saved')]);   // the creative is not in the quiz
        $this->assertFalse($check->json("data.marks.{$this->mcq->id}.correct"));
        foreach (['"right"', 'answer_text', 'is_correct', 'ঘাস'] as $secret) $this->assertStringNotContainsString($secret, $check->getContent(), "the check never gives {$secret}");
        $this->assertArrayNotHasKey('review', $check->json('data'));

        $i = $this->makeInstitution('quizpub');
        $s = $this->student($i, 'qz-f');
        $this->api('POST', $this->hostOf($i), "student/qb/quizzes/{$public}/attempts", $s)->assertCreated();   // a student can take it and keep the result
        QbQuiz::whereKey($public)->update(['closes_at' => now()->subMinute()]);
        $this->api('GET', $this->central, "public/qb/quizzes/{$public}")->assertStatus(422)->assertJsonPath('error', 'qb_quiz_closed');
    }
}
