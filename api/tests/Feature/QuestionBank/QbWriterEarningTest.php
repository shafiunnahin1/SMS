<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{PlatformSetting, QbPrice, QbQuestion, QbQuestionOption, QbQuestionType, QbQuiz, QbQuizPackage, QbQuizQuestion, QbSubject, QbUnlock,
    QbWithdrawalRequest, QbWriterEarning, QbWriterWallet, QbWriterWalletTxn, User};
use App\Services\QbEarningService;
use App\Http\Controllers\QuestionBank\QbStudentController;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// QB.10b (D66, docs/modules/question-bank.md §৪.৫): every sale credits the item's writer their share to the paisa, in the sale's
// own transaction (a failed booking undoes the sale); a quiz package is split among its writers exactly; a withdrawal request
// holds its amount, paying takes it once, rejecting releases it; only the writer and the Super Admin see the payout account.
class QbWriterEarningTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $super;
    private User $w1;
    private User $w2;
    private int $type;
    private int $subject;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $this->w1 = User::create(['institution_id' => null, 'name' => 'Writer One', 'role' => 'content_writer', 'phone' => '01700000011', 'password' => 'Writer-pass-2026', 'is_active' => true]);
        $this->w2 = User::create(['institution_id' => null, 'name' => 'Writer Two', 'role' => 'content_writer', 'phone' => '01700000012', 'password' => 'Writer-pass-2026', 'is_active' => true]);
        $this->type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        QbPrice::create(['audience' => 'institution', 'item_kind' => 'question_answer', 'qb_question_type_id' => $this->type, 'amount' => '0.55', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $this->api('PUT', $this->central, 'super/qb/writer-settings', $this->super, ['share_percent' => '30', 'min_withdrawal' => '1.00'])->assertOk()
            ->assertJsonPath('data.share_percent', '30.00');
    }

    private function question(User $by): QbQuestion
    {
        $q = QbQuestion::create(['qb_question_type_id' => $this->type, 'qb_subject_id' => $this->subject, 'question_text' => '2+2?', 'status' => 'published', 'created_by' => $by->id, 'published_at' => now()]);
        QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'ক', 'content_text' => '4', 'is_correct' => true]);
        return $q;
    }

    private function balance(User $w): array
    {
        $wallet = QbWriterWallet::where('writer_user_id', $w->id)->first();
        return [(string) ($wallet->balance ?? '0.00'), (string) ($wallet->held ?? '0.00')];
    }

    public function test_an_institution_purchase_credits_the_writer_in_the_same_transaction(): void
    {
        $i = $this->makeInstitution('earn1');
        $i->forceFill(['sms_balance' => '10.00'])->save();
        $admin = $this->makeUser($i, 'admin');
        $mine = $this->question($this->w1);
        $platforms = $this->question($this->super);

        $this->api('POST', $this->hostOf($i), 'question-bank/buy', $admin, ['item_type' => 'question', 'item_id' => $mine->id])->assertCreated();
        $e = QbWriterEarning::firstOrFail();
        $this->assertSame(['institution_unlock', '0.55', '30.00', '0.17'], [$e->source, (string) $e->sale_amount, (string) $e->share_percent, (string) $e->amount]);   // 0.165 half up
        $this->assertSame(['0.17', '0.00'], $this->balance($this->w1));
        $this->assertSame('0.17', (string) QbWriterWalletTxn::where('writer_user_id', $this->w1->id)->value('balance_after'));

        $this->api('POST', $this->hostOf($i), 'question-bank/buy', $admin, ['item_type' => 'question', 'item_id' => $platforms->id])->assertCreated();
        $this->assertSame(1, QbWriterEarning::count(), "the Super Admin's own item earns nobody");

        // a booking that fails undoes the sale: no unlock, no charge
        $other = $this->question($this->w2);
        $this->app->instance(QbEarningService::class, new class extends QbEarningService {
            public function credit(string $source, int $sourceId, string $itemType, int $itemId, string $saleAmount): void { throw new \RuntimeException('booking failed'); }
        });
        $this->withoutExceptionHandling();
        try { $this->api('POST', $this->hostOf($i), 'question-bank/buy', $admin, ['item_type' => 'question', 'item_id' => $other->id]); $this->fail('no exception'); }
        catch (\RuntimeException $ex) { $this->assertSame('booking failed', $ex->getMessage()); }
        $this->assertSame(0, Tenancy::as($i, fn () => QbUnlock::where('item_id', $other->id)->count()));
        $this->assertSame('8.90', $i->fresh()->sms_balance);
    }

    public function test_student_sales_and_a_quiz_package_split_exactly(): void
    {
        $i = $this->makeInstitution('earn2');
        $student = User::create(['institution_id' => $i->id, 'name' => 'st', 'username' => 'ST-1', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
        $q = $this->question($this->w2);
        Tenancy::as($i, fn () => QbStudentController::unlock($student, ['item_type' => 'question', 'item_id' => $q->id, 'price' => '1.00', 'reason' => 'paid'], null));
        $this->assertSame(['0.30', '0.00'], $this->balance($this->w2));
        Tenancy::as($i, fn () => QbStudentController::unlock($student, ['item_type' => 'question', 'item_id' => $q->id, 'price' => '1.00', 'reason' => 'paid'], null));
        $this->assertSame(1, QbWriterEarning::where('source', 'student_unlock')->count(), 'a repeated unlock is not a second sale');

        $package = QbQuizPackage::create(['title' => 'p', 'validity_days' => 30]);
        $quiz = QbQuiz::create(['qb_quiz_package_id' => $package->id, 'access' => 'package', 'title' => 'q', 'duration_minutes' => 5, 'question_count' => 3, 'rule' => 'fixed']);
        foreach ([$this->question($this->w1), $this->question($this->w1), $this->question($this->w2)] as $n => $x) QbQuizQuestion::create(['qb_quiz_id' => $quiz->id, 'qb_question_id' => $x->id, 'sort_order' => $n]);
        Tenancy::as($i, fn () => QbStudentController::unlock($student, ['item_type' => 'quiz_package', 'item_id' => $package->id, 'price' => '0.35', 'reason' => 'paid'], null));
        $parts = QbWriterEarning::where('source', 'quiz_package')->pluck('amount', 'writer_user_id')->map(fn ($v) => (string) $v)->all();
        $this->assertSame(['0.07', '0.04'], [$parts[$this->w1->id], $parts[$this->w2->id]]);   // share 0.11 (0.105 half up): 2/3 and 1/3, the remainder to the larger rest
        $this->assertSame('0.11', number_format(array_sum(array_map('floatval', $parts)), 2), 'the parts add up to the share');

        $txns = QbWriterWalletTxn::count();
        $free = $this->question($this->w2);
        Tenancy::as($i, fn () => QbStudentController::unlock($student, ['item_type' => 'question', 'item_id' => $free->id, 'price' => '0.00', 'reason' => 'free'], null));
        $this->assertSame('0.00', (string) QbWriterEarning::where('item_id', $free->id)->value('amount'), 'a free item is a sale that earns 0');
        $this->assertSame($txns, QbWriterWalletTxn::count(), 'and moves no money');
    }

    public function test_a_withdrawal_holds_paying_takes_once_rejecting_releases(): void
    {
        DB::transaction(fn () => app(QbEarningService::class)->move($this->w1->id, 'earning', 500, 'test', null));   // 5.00
        $this->api('POST', $this->central, 'writer/withdrawals', $this->w1, ['amount' => '0.50', 'payout_method' => 'bkash', 'payout_account' => '01711111111'])
            ->assertStatus(422)->assertJsonPath('error', 'qb_withdrawal_below_minimum');
        $a = $this->api('POST', $this->central, 'writer/withdrawals', $this->w1, ['amount' => '3.00', 'payout_method' => 'bkash', 'payout_account' => '01711111111'])->assertCreated()->json('data.id');
        $this->assertSame(['5.00', '3.00'], $this->balance($this->w1));
        $this->api('POST', $this->central, 'writer/withdrawals', $this->w1, ['amount' => '2.50', 'payout_method' => 'bank', 'payout_account' => 'Sonali 1234567'])
            ->assertStatus(422)->assertJsonPath('error', 'qb_withdrawal_too_much');                                      // only 2.00 is free
        $b = $this->api('POST', $this->central, 'writer/withdrawals', $this->w1, ['amount' => '2.00', 'payout_method' => 'bank', 'payout_account' => 'Sonali 1234567'])->assertCreated()->json('data.id');
        $this->assertStringNotContainsString('Sonali', (string) DB::table('qb_withdrawal_requests')->where('id', $b)->value('payout_account'), 'stored encrypted');

        $this->api('GET', $this->central, 'writer/withdrawals', $this->w2)->assertOk()->assertJsonCount(0, 'data');
        $this->api('POST', $this->central, "super/qb/withdrawals/{$a}/pay", $this->w1, ['bank_transaction_id' => 'X'])->assertForbidden();
        $queue = $this->api('GET', $this->central, 'super/qb/withdrawals?status=pending', $this->super)->assertOk()->json('data');
        $this->assertSame(['Writer One', '01711111111'], [$queue[1]['writer'], $queue[1]['payout_account']]);

        $this->api('POST', $this->central, "super/qb/withdrawals/{$a}/pay", $this->super, ['bank_transaction_id' => 'BKX123'])->assertOk()->assertJsonPath('data.status', 'paid');
        $this->assertSame(['2.00', '2.00'], $this->balance($this->w1));
        $this->api('POST', $this->central, "super/qb/withdrawals/{$a}/pay", $this->super, ['bank_transaction_id' => 'BKX123'])->assertStatus(422)->assertJsonPath('error', 'qb_withdrawal_processed');
        $this->assertSame(['2.00', '2.00'], $this->balance($this->w1), 'paid once');
        $this->assertSame('-3.00', (string) QbWriterWalletTxn::where('type', 'withdrawal')->value('amount'));
        $this->assertStringContainsString('BKX123', (string) QbWriterWalletTxn::where('type', 'withdrawal')->value('reference'));

        $this->api('POST', $this->central, "super/qb/withdrawals/{$b}/reject", $this->super, ['note' => 'wrong account'])->assertOk()->assertJsonPath('data.status', 'rejected');
        $this->assertSame(['2.00', '0.00'], $this->balance($this->w1));
        $summary = $this->api('GET', $this->central, 'writer/earnings', $this->w1)->assertOk()->json('data');
        $this->assertSame(['2.00', '0.00', '2.00'], [$summary['balance'], $summary['held'], $summary['available']]);
        $this->assertSame(['paid', 'rejected'], QbWithdrawalRequest::orderBy('id')->pluck('status')->all());
        $this->assertSame('0.00', $this->api('GET', $this->central, 'writer/earnings', $this->w2)->json('data.balance'), "another writer sees only their own");
        $moderator = User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01700000013', 'password' => 'Writer-pass-2026', 'is_active' => true]);
        $this->api('GET', $this->central, 'writer/earnings', $moderator)->assertForbidden();
    }
}
