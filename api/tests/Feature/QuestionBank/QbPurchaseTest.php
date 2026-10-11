<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{Institution, QbChapter, QbPrice, QbPriceRule, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, SmsCreditTransaction, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// QB.7 (D66, docs/modules/question-bank.md §4.2, §4.4): an institution buys from its taka wallet once for all its teachers; two
// buyers at once pay once; an empty wallet is 402; a teacher's monthly cap is 422; another institution's purchase never helps
// (a private batch buys again); the head teacher's spending report and caps.
class QbPurchaseTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private int $mcq;
    private int $subject;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $this->mcq = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        QbPrice::create(['audience' => 'institution', 'item_kind' => 'question_answer', 'qb_question_type_id' => $this->mcq, 'amount' => '0.50', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
    }

    private function question(string $status = 'published'): QbQuestion
    {
        $q = QbQuestion::create(['qb_question_type_id' => $this->mcq, 'qb_subject_id' => $this->subject, 'question_text' => '2+2?', 'answer_text' => 'SECRET-ANSWER',
            'status' => $status, 'created_by' => $this->super->id, 'published_at' => now()]);
        QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'ক', 'content_text' => '4', 'is_correct' => true]);
        QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'খ', 'content_text' => '5', 'is_correct' => false]);
        return $q;
    }

    private function school(string $slug, string $balance, string $type = 'school'): array
    {
        $i = $this->makeInstitution($slug, $type);
        $i->forceFill(['sms_balance' => $balance])->save();
        return [$i, $this->hostOf($i), $this->makeUser($i, 'admin'), $this->makeUser($i, 'teacher')];
    }

    private function teacherRow(Institution $i, User $u): Teacher
    {
        return Tenancy::as($i, fn () => Teacher::firstOrCreate(['user_id' => $u->id], ['employee_id' => 'T' . $u->id, 'status' => 'active']));
    }

    private function balance(Institution $i): string
    {
        return $i->fresh()->sms_balance;
    }

    public function test_one_purchase_for_all_teachers_from_the_wallet(): void
    {
        $q = $this->question();
        [$i, $host, , $t1] = $this->school('qbbuy', '1.00');
        $t2 = User::create(['institution_id' => $i->id, 'name' => 't2', 'email' => 't2-qbbuy@example.test', 'role' => 'teacher', 'password' => 'Teacher-pass-26', 'is_active' => true]);

        $locked = $this->api('GET', $host, "question-bank/questions/{$q->id}", $t1)->assertOk()->json('data');
        $this->assertSame([false, '0.50'], [$locked['unlocked'], $locked['quote']['price']]);
        $this->assertArrayNotHasKey('answer_text', $locked);

        $this->api('POST', $host, 'question-bank/buy', $t1, ['item_type' => 'question', 'item_id' => $q->id])->assertCreated()
            ->assertJsonPath('data.charged', '0.50')->assertJsonPath('data.balance', '0.50')->assertJsonPath('data.reason', 'paid');
        $this->api('POST', $host, 'question-bank/buy', $t2, ['item_type' => 'question', 'item_id' => $q->id])->assertOk()
            ->assertJsonPath('data.already_owned', true)->assertJsonPath('data.charged', '0.00');
        $this->assertSame('0.50', $this->balance($i));
        $open = $this->api('GET', $host, "question-bank/questions/{$q->id}", $t2)->assertOk()->json('data');
        $this->assertSame(['SECRET-ANSWER', true], [$open['answer_text'], $open['unlocked']]);

        $ledger = Tenancy::as($i, fn () => SmsCreditTransaction::where('type', 'qb_purchase')->get());
        $this->assertSame([1, '-0.50', '0.50', "qb:question:{$q->id}"], [$ledger->count(), $ledger[0]->amount, $ledger[0]->balance_after, $ledger[0]->reference]);
        $this->api('POST', $host, 'question-bank/buy', $t1, ['item_type' => 'question', 'item_id' => $q->id, 'price' => '0.01'])->assertStatus(422);   // never a client amount
    }

    public function test_two_buyers_at_the_same_moment_pay_once(): void
    {
        $q = $this->question();
        [$i, $host, $admin, $t1] = $this->school('qbrace', '5.00');
        // the other teacher's purchase commits just before this one takes the institution lock (simulated at the lock query)
        $done = false;
        DB::listen(function (QueryExecuted $e) use (&$done, $i, $q, $admin) {
            if ($done || !str_contains($e->sql, 'for update') || !str_contains($e->sql, 'institutions')) return;
            $done = true;
            Tenancy::as($i, fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $q->id, 'unlocked_by' => $admin->id, 'price' => '0.50', 'reason' => 'paid']));
        });
        $this->api('POST', $host, 'question-bank/buy', $t1, ['item_type' => 'question', 'item_id' => $q->id])->assertOk()->assertJsonPath('data.already_owned', true);
        $this->assertTrue($done);
        $this->assertSame('5.00', $this->balance($i), 'the second buyer is not charged');
        $this->assertSame(0, Tenancy::as($i, fn () => SmsCreditTransaction::where('type', 'qb_purchase')->count()));
    }

    public function test_empty_wallet_is_402_and_writes_nothing(): void
    {
        $q = $this->question();
        [$i, $host, , $t] = $this->school('qbpoor', '0.49');
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $q->id])->assertStatus(402)->assertJsonPath('error', 'wallet_balance_too_low');
        $this->assertSame('0.49', $this->balance($i));
        $this->assertSame(0, Tenancy::as($i, fn () => QbUnlock::count()));
    }

    public function test_the_monthly_cap_per_teacher(): void
    {
        $a = $this->question();
        $b = $this->question();
        [$i, $host, $admin, $t] = $this->school('qbcap', '10.00');
        $row = $this->teacherRow($i, $t);
        $this->api('PUT', $host, 'question-bank/caps', $admin, ['default_cap' => '0.60'])->assertOk();
        $this->api('PUT', $host, 'question-bank/caps', $t, ['default_cap' => '99'])->assertForbidden();
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $a->id])->assertCreated();
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $b->id])->assertStatus(422)->assertJsonPath('error', 'qb_teacher_cap_reached');
        $this->api('PUT', $host, 'question-bank/caps', $admin, ['teachers' => [['id' => $row->id, 'cap' => '1.00']]])->assertOk();   // the head teacher raises it
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $b->id])->assertCreated();
        $this->assertSame('9.00', $this->balance($i));
        $c = $this->question();
        $this->api('POST', $host, 'question-bank/buy', $admin, ['item_type' => 'question', 'item_id' => $c->id])->assertCreated();   // the head teacher has no cap

        $report = $this->api('GET', $host, 'question-bank/spending', $admin)->assertOk()->json();
        $this->assertSame(['1.50', '0.60'], [$report['meta']['total'], $report['meta']['default_cap']]);
        $mine = collect($report['data'])->firstWhere('user_id', $t->id);
        $this->assertSame(['1.00', 2, '1.00'], [$mine['total'], $mine['count'], $mine['cap']]);
        $this->api('GET', $host, 'question-bank/spending', $t)->assertForbidden();
    }

    public function test_another_institution_never_helps_and_a_private_batch_buys_again(): void
    {
        $q = $this->question();
        [$i, $host, , $t] = $this->school('qbschoolx', '5.00');
        [$pb, $pbHost, $tutor] = $this->school('qbtutorx', '5.00', 'private_batch');
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $q->id])->assertCreated();
        $this->assertFalse($this->api('GET', $pbHost, "question-bank/questions/{$q->id}", $tutor)->json('data.unlocked'));
        $this->assertStringNotContainsString('SECRET-ANSWER', $this->api('GET', $pbHost, 'question-bank/questions', $tutor)->getContent());
        $this->assertSame([], $this->api('GET', $pbHost, 'question-bank/spending', $tutor)->json('data'));
        $this->api('POST', $pbHost, 'question-bank/buy', $tutor, ['item_type' => 'question', 'item_id' => $q->id])->assertCreated()->assertJsonPath('data.charged', '0.50');
        $this->assertSame(['4.50', '4.50'], [$this->balance($i), $this->balance($pb)]);
    }

    public function test_free_rules_unpriced_and_unpublished_items(): void
    {
        $q = $this->question();
        [$i, $host, , $t] = $this->school('qbfree', '0.00');
        QbPriceRule::create(['target_type' => 'item', 'target_ref' => "question:{$q->id}", 'method' => 'free', 'audience' => 'institution', 'created_by' => $this->super->id]);
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $q->id])->assertCreated()
            ->assertJsonPath('data.reason', 'free')->assertJsonPath('data.charged', '0.00');
        $this->assertSame(0, Tenancy::as($i, fn () => SmsCreditTransaction::count()), 'a free unlock writes no ledger row');

        $draft = $this->question('draft');
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $draft->id])->assertNotFound();
        $this->api('GET', $host, "question-bank/questions/{$draft->id}", $t)->assertNotFound();
        QbPrice::query()->delete();
        $other = $this->question();
        $this->api('POST', $host, 'question-bank/buy', $t, ['item_type' => 'question', 'item_id' => $other->id])->assertStatus(422)->assertJsonPath('error', 'qb_not_for_sale');
        $this->api('GET', $host, 'question-bank/questions', $this->makeUser($i, 'accountant'))->assertForbidden();
    }
}
