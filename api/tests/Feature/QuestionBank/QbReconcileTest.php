<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{PlatformSetting, QbPrice, QbQuestion, QbQuestionType, QbStudentOrder, QbStudentUnlock, QbSubject, QbWriterEarning, QbWriterWallet, User};
use App\Services\QbEarningService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

// D191 R2.1.8: the bKash order callback grants a paid item once even when a second callback slips past the order lock, refuses a
// foreign invoice ref, and `qb:reconcile` (read-only) passes on clean data and names each planted mismatch with ids only.
class QbReconcileTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private QbQuestion $q;
    private ?array $execute = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = config('tenancy.central_domains')[0];
        config(['services.bkash' => ['base_url' => 'https://bkash.sandbox.test/v1', 'app_key' => 'k', 'app_secret' => 's', 'username' => 'u', 'password' => 'p', 'sandbox' => true],
            'app.url' => 'https://' . $this->central]);
        Http::fake([
            'bkash.sandbox.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.sandbox.test/v1/tokenized/checkout/create' => fn ($req) => Http::response(['paymentID' => 'PAY-' . $req['merchantInvoiceNumber'], 'bkashURL' => 'https://sandbox.bkash.test/pay']),
            'bkash.sandbox.test/v1/tokenized/checkout/execute' => fn ($req) => Http::response($this->execute ?? ['paymentID' => $req['paymentID'], 'trxID' => 'TRX1',
                'transactionStatus' => 'Completed', 'amount' => '1.10', 'merchantInvoiceNumber' => substr($req['paymentID'], 4)]),
        ]);
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000019', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01700000018', 'password' => 'Writer-pass-2026', 'is_active' => true]);
        PlatformSetting::write(QbEarningService::SHARE_KEY, '30.00', $super->id);
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        QbPrice::create(['audience' => 'student', 'item_kind' => 'question_answer', 'qb_question_type_id' => $type, 'amount' => '1.10', 'effective_from' => now()->subDay(), 'created_by' => $super->id]);
        $this->q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => '2+2?', 'answer_text' => 'A',
            'status' => 'published', 'created_by' => $writer->id, 'published_at' => now()]);
    }

    private function order($i, User $s): string
    {
        return $this->api('POST', $this->hostOf($i), 'student/qb/orders', $s, ['items' => [['item_type' => 'question', 'item_id' => $this->q->id]]])->assertOk()->json('data.ref');
    }

    private function back(string $ref)
    {
        return $this->get("http://{$this->central}/api/v1/qb/student-orders/bkash/callback?ref={$ref}&paymentID=PAY-{$ref}&status=success");
    }

    public function test_grants_once_past_the_lock_refuses_a_foreign_ref_and_reconciles(): void
    {
        $i = $this->makeInstitution('qbrec');
        $s = User::create(['institution_id' => $i->id, 'name' => 'stu', 'username' => 'STU-R', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);

        $ref = $this->order($i, $s);
        $this->back($ref)->assertRedirect();
        // a second callback that read the order before the first committed: the per-order grant check still grants nothing twice
        Tenancy::as($i, fn () => DB::table('qb_student_orders')->where('ref', $ref)->update(['status' => 'pending']));
        $this->back($ref)->assertRedirect();
        $this->assertSame(1, Tenancy::as($i, fn () => QbStudentUnlock::count()));
        $this->assertSame(1, QbWriterEarning::count());
        $this->assertSame('0.33', (string) QbWriterWallet::sole()->balance);                       // 30% of 1.10

        $this->artisan('qb:reconcile')->expectsOutputToContain('0 mismatches')->assertSuccessful();

        // bKash answers for another invoice: refused, nothing granted
        $s2 = User::create(['institution_id' => $i->id, 'name' => 'stu2', 'username' => 'STU-R2', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
        $ref2 = $this->order($i, $s2);
        $this->execute = ['paymentID' => "PAY-{$ref2}", 'trxID' => 'TRX2', 'transactionStatus' => 'Completed', 'amount' => '1.10', 'merchantInvoiceNumber' => 'OTHERREF'];
        $this->back($ref2)->assertRedirect('http://' . $this->hostOf($i) . "/student/question-bank?payment=failed&ref={$ref2}");
        $this->assertSame('failed', Tenancy::as($i, fn () => QbStudentOrder::where('ref', $ref2)->value('status')));
        $this->assertSame(1, Tenancy::as($i, fn () => QbStudentUnlock::count()));
    }

    public function test_reconcile_names_each_planted_mismatch_with_ids_only(): void
    {
        $i = $this->makeInstitution('qbrec2');
        $s = User::create(['institution_id' => $i->id, 'name' => 'Rahim Uddin', 'username' => 'STU-P', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
        $ref = $this->order($i, $s);
        $this->back($ref)->assertRedirect();
        $orderId = Tenancy::as($i, fn () => QbStudentOrder::where('ref', $ref)->value('id'));
        $unlockId = Tenancy::as($i, fn () => QbStudentUnlock::sole()->id);

        // planted (direct writes - only a test may do this): a price change, a grant for an unpaid order, an earning and a wallet off
        DB::table('qb_student_unlocks')->where('id', $unlockId)->update(['price' => '1.00']);
        Tenancy::as($i, fn () => QbStudentUnlock::create(['student_user_id' => $s->id, 'item_type' => 'question', 'item_id' => 999, 'price' => '1.10', 'reason' => 'paid',
            'qb_student_order_id' => Tenancy::as($i, fn () => QbStudentOrder::create(['student_user_id' => $s->id, 'ref' => 'QBPEND1', 'items' => [], 'amount' => '1.10', 'status' => 'pending'])->id)]));
        DB::table('qb_writer_wallets')->update(['balance' => '9.99']);

        $out = $this->artisan('qb:reconcile');
        $out->assertFailed();
        $out->expectsOutputToContain('"code":"grant_price_differs"');
        $out->expectsOutputToContain('"code":"grant_without_paid_order"');
        $out->expectsOutputToContain('"code":"earning_sale_differs"');
        $out->expectsOutputToContain('"code":"wallet_balance_differs_from_ledger"');
        $out->doesntExpectOutputToContain('Rahim');
        $out->doesntExpectOutputToContain('1.10');
        $out->run();
        $this->assertSame('pending', Tenancy::as($i, fn () => QbStudentOrder::where('ref', 'QBPEND1')->value('status')), 'read-only: nothing changed');
    }
}
