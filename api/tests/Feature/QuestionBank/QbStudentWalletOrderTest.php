<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbPrice, QbQuestion, QbQuestionType, QbQuizPackage, QbStudentOrder, QbStudentPackageAccess, QbStudentUnlock, QbSubject, User, UserWallet, UserWalletTransaction};
use App\Services\Wallet\StudentWalletService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// D218 (6) WAL.4: a student's question-bank order is paid from the student's own wallet in one transaction - the order is paid, the
// wallet has one purchase row and the item opens, or (short balance) nothing at all happens; buying again takes nothing; the
// retired bKash checkout answers 410 use_wallet for a NEW order; nobody pays from another student's wallet.
class QbStudentWalletOrderTest extends TestCase
{
    use RefreshDatabase;

    private QbQuestion $q;
    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake();
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        QbPrice::create(['audience' => 'student', 'item_kind' => 'question_answer', 'qb_question_type_id' => $type, 'amount' => '1.50', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $this->q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => '2+2?', 'answer_text' => 'SECRET-ANSWER',
            'status' => 'published', 'created_by' => $this->super->id, 'published_at' => now()]);
    }

    private function student($i, string $name): User
    {
        return User::create(['institution_id' => $i->id, 'name' => $name, 'username' => strtoupper($name), 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
    }

    private function topUp($i, User $s, string $paisa): void
    {
        Tenancy::as($i, fn () => app(StudentWalletService::class)->move($s, 'recharge', (int) $paisa, null, null));
    }

    public function test_an_order_is_paid_from_the_wallet_once_and_opens_the_answer(): void
    {
        $i = $this->makeInstitution('qbwal');
        $host = $this->hostOf($i);
        [$a, $b] = [$this->student($i, 'wal-a'), $this->student($i, 'wal-b')];
        $items = ['items' => [['item_type' => 'question', 'item_id' => $this->q->id]]];

        $this->api('POST', $host, 'student/qb/wallet-orders', $a, $items)->assertStatus(422)->assertJsonPath('error', 'wallet_insufficient');
        $this->assertSame([0, 0, 0], Tenancy::as($i, fn () => [QbStudentOrder::count(), QbStudentUnlock::count(), UserWalletTransaction::where('type', 'purchase')->count()]), 'a short balance changes nothing');

        $this->topUp($i, $a, '200');
        $r = $this->api('POST', $host, 'student/qb/wallet-orders', $a, $items + ['amount' => '0.01'])->assertStatus(422);   // never a client amount
        $r = $this->api('POST', $host, 'student/qb/wallet-orders', $a, $items)->assertOk()->json('data');
        $this->assertSame([true, 1, '1.50', '0.50'], [$r['paid'], $r['opened'], $r['amount'], $r['balance']]);
        $this->assertSame('SECRET-ANSWER', $this->api('GET', $host, "student/qb/questions/{$this->q->id}", $a)->json('data.answer_text'));
        $this->api('GET', $host, "student/qb/orders/{$r['ref']}", $a)->assertOk()->assertJsonPath('data.status', 'paid');
        $this->api('GET', $host, "student/qb/orders/{$r['ref']}", $b)->assertNotFound();

        $again = $this->api('POST', $host, 'student/qb/wallet-orders', $a, $items)->assertOk()->json('data');   // owned: nothing taken
        $this->assertSame([0, '0.50'], [$again['opened'], $again['balance']]);
        Tenancy::as($i, function () use ($a) {
            $this->assertSame('0.50', (string) UserWallet::where('user_id', $a->id)->value('balance'));
            $this->assertSame(['-1.50'], UserWalletTransaction::where('type', 'purchase')->pluck('amount')->map(fn ($x) => (string) $x)->all());
        });
        $this->assertFalse($this->api('GET', $host, "student/qb/questions/{$this->q->id}", $b)->json('data.unlocked'), 'another student does not get it');
        $this->api('POST', $host, 'student/qb/wallet-orders', $this->makeUser($i, 'teacher'), $items)->assertForbidden();
    }

    public function test_the_direct_bkash_checkout_is_retired_for_new_orders(): void
    {
        $i = $this->makeInstitution('qbwal2');
        $host = $this->hostOf($i);
        $s = $this->student($i, 'wal-c');
        $this->api('POST', $host, 'student/qb/orders', $s, ['items' => [['item_type' => 'question', 'item_id' => $this->q->id]]])->assertStatus(410)->assertJsonPath('error', 'use_wallet');
        $this->assertSame(0, Tenancy::as($i, fn () => QbStudentUnlock::count()));
        Http::assertNothingSent();
    }

    public function test_a_quiz_package_is_bought_from_the_wallet(): void
    {
        $package = QbQuizPackage::create(['title' => 'SSC প্যাকেজ', 'validity_days' => 30]);
        QbPrice::create(['audience' => 'student', 'item_kind' => 'quiz_package', 'amount' => '20.00', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $i = $this->makeInstitution('qbwal3');
        $host = $this->hostOf($i);
        $s = $this->student($i, 'wal-d');
        $this->api('POST', $host, "student/qb/quiz-packages/{$package->id}/buy", $s)->assertStatus(410)->assertJsonPath('error', 'use_wallet');
        $this->topUp($i, $s, '2000');
        $r = $this->api('POST', $host, "student/qb/quiz-packages/{$package->id}/wallet-buy", $s)->assertOk()->json('data');
        $this->assertSame(['20.00', '0.00'], [$r['amount'], $r['balance']]);
        $this->assertSame(now()->addDays(30)->toDateString(), Tenancy::as($i, fn () => QbStudentPackageAccess::firstOrFail()->expires_at->toDateString()));
        $this->api('POST', $host, "student/qb/quiz-packages/{$package->id}/wallet-buy", $s)->assertStatus(422)->assertJsonPath('error', 'wallet_insufficient');
    }
}
