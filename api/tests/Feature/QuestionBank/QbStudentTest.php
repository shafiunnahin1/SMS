<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbPrice, QbPriceRule, QbQuestion, QbQuestionType, QbStudentOrder, QbStudentUnlock, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// QB.9 (D65/D66, docs/modules/question-bank.md §4.1, §4.2): a student reads questions free, pays once with bKash (the platform
// merchant, sandbox fake) to see an answer, and another student - or the institution's own purchase - never opens it for them;
// a failed, cancelled or tampered payment unlocks nothing; the callback is safe to repeat.
class QbStudentTest extends TestCase
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
                'transactionStatus' => 'Completed', 'amount' => '1.00', 'merchantInvoiceNumber' => substr($req['paymentID'], 4)]),
        ]);
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        QbPrice::create(['audience' => 'student', 'item_kind' => 'question_answer', 'qb_question_type_id' => $type, 'amount' => '1.00', 'effective_from' => now()->subDay(), 'created_by' => $super->id]);
        QbPrice::create(['audience' => 'institution', 'item_kind' => 'question_answer', 'qb_question_type_id' => $type, 'amount' => '0.50', 'effective_from' => now()->subDay(), 'created_by' => $super->id]);
        $this->q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $subject, 'question_text' => '2+2?', 'answer_text' => 'SECRET-ANSWER',
            'status' => 'published', 'created_by' => $super->id, 'published_at' => now()]);
    }

    private function student($i, string $name): User
    {
        return User::create(['institution_id' => $i->id, 'name' => $name, 'username' => strtoupper($name), 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
    }

    private function pay($host, User $s): string
    {
        $r = $this->api('POST', $host, 'student/qb/orders', $s, ['items' => [['item_type' => 'question', 'item_id' => $this->q->id]]])->assertOk();
        $this->assertSame(['1.00', false], [$r->json('data.amount'), $r->json('data.paid')]);
        return $r->json('data.ref');
    }

    private function back(string $ref, string $status = 'success', ?string $payment = null)
    {
        return $this->get("http://{$this->central}/api/v1/qb/student-orders/bkash/callback?ref={$ref}&paymentID=" . ($payment ?? "PAY-{$ref}") . "&status={$status}");
    }

    public function test_a_student_reads_free_pays_once_and_only_they_get_the_answer(): void
    {
        $i = $this->makeInstitution('qbstud');
        $host = $this->hostOf($i);
        [$a, $b] = [$this->student($i, 'stu-a'), $this->student($i, 'stu-b')];
        Tenancy::as($i, fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $this->q->id, 'unlocked_by' => $a->id, 'price' => '0.50', 'reason' => 'paid']));   // the institution's own purchase

        $free = $this->api('GET', $host, "student/qb/questions/{$this->q->id}", $a)->assertOk()->json('data');
        $this->assertSame([false, '1.00'], [$free['unlocked'], $free['price']], "the institution's purchase is not the student's");
        $this->assertStringNotContainsString('SECRET-ANSWER', $this->api('GET', $host, 'student/qb/questions', $a)->getContent());

        $ref = $this->pay($host, $a);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/checkout/create') && $r['amount'] === '1.00'
            && $r['callbackURL'] === "https://{$this->central}/api/v1/qb/student-orders/bkash/callback?ref={$ref}");
        $this->back($ref)->assertRedirect('http://' . $host . "/student/question-bank?payment=success&ref={$ref}");
        $this->back($ref)->assertRedirect('http://' . $host . "/student/question-bank?payment=success&ref={$ref}");   // repeated: nothing twice
        $this->assertSame(1, Tenancy::as($i, fn () => QbStudentUnlock::count()));

        $this->assertSame('SECRET-ANSWER', $this->api('GET', $host, "student/qb/questions/{$this->q->id}", $a)->json('data.answer_text'));
        $this->assertFalse($this->api('GET', $host, "student/qb/questions/{$this->q->id}", $b)->json('data.unlocked'), 'another student does not get it');
        $this->api('GET', $host, "student/qb/orders/{$ref}", $a)->assertOk()->assertJsonPath('data.status', 'paid');
        $this->api('GET', $host, "student/qb/orders/{$ref}", $b)->assertNotFound();
        $this->api('GET', $host, "student/qb/questions/{$this->q->id}", $this->makeUser($i, 'teacher'))->assertForbidden();
    }

    public function test_failed_cancelled_or_tampered_payments_unlock_nothing(): void
    {
        $i = $this->makeInstitution('qbstud2');
        $host = $this->hostOf($i);
        $s = $this->student($i, 'stu-c');

        $ref = $this->pay($host, $s);
        $this->back($ref, 'success', 'PAY-OTHER')->assertRedirect();                       // not our payment
        $this->execute = ['paymentID' => "PAY-{$ref}", 'transactionStatus' => 'Completed', 'amount' => '0.01', 'merchantInvoiceNumber' => $ref];
        $this->back($ref)->assertRedirect('http://' . $host . "/student/question-bank?payment=failed&ref={$ref}");   // tampered amount
        $ref2 = $this->pay($host, $s);
        $this->back($ref2, 'cancel')->assertRedirect('http://' . $host . "/student/question-bank?payment=cancelled&ref={$ref2}");
        $this->assertSame(0, Tenancy::as($i, fn () => QbStudentUnlock::count()));
        $this->assertSame(['failed', 'failed'], Tenancy::as($i, fn () => QbStudentOrder::orderBy('id')->pluck('status')->all()));
        $this->get("http://{$this->central}/api/v1/qb/student-orders/bkash/callback?ref=NOPE&status=success")->assertNotFound();
        $this->api('POST', $host, 'student/qb/orders', $s, ['items' => [['item_type' => 'question', 'item_id' => $this->q->id]], 'amount' => '0.01'])->assertStatus(422);
    }

    public function test_a_free_item_opens_without_payment_and_unpriced_items_are_refused(): void
    {
        $i = $this->makeInstitution('qbstud3');
        $host = $this->hostOf($i);
        $s = $this->student($i, 'stu-d');
        $rule = QbPriceRule::create(['target_type' => 'item', 'target_ref' => "question:{$this->q->id}", 'method' => 'free', 'audience' => 'student', 'created_by' => 1]);
        $this->api('POST', $host, 'student/qb/orders', $s, ['items' => [['item_type' => 'question', 'item_id' => $this->q->id]]])->assertOk()
            ->assertJsonPath('data.paid', true)->assertJsonPath('data.opened', 1);
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/checkout/create'));
        $this->assertTrue($this->api('GET', $host, "student/qb/questions/{$this->q->id}", $s)->json('data.unlocked'));

        $rule->update(['is_active' => false]);
        QbPrice::where('audience', 'student')->delete();
        $s2 = $this->student($i, 'stu-e');
        $this->api('POST', $host, 'student/qb/orders', $s2, ['items' => [['item_type' => 'question', 'item_id' => $this->q->id]]])->assertStatus(422)->assertJsonPath('error', 'qb_not_for_sale');
    }
}
