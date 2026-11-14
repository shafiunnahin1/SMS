<?php

namespace Tests\Feature\Payments;

use App\Models\{AuditLog, FeeCategory, FeePayment, InstitutionPaymentGateway, OnlinePayment};
use App\Services\Payments\{GatewayRegistry, OnlinePaymentService, PaymentRouter};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Queue};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D217 OPAY.1 (docs/modules/online-fee-payment.md "Tests"): no real provider - the registry offers only the fake gateway and
// nothing at all in production; the amount comes from the dues; the notification is authenticated; success writes ONE receipt with
// a line per due; a wrong amount, a late payment and an already-paid due go to review and credit nothing; the reconcile job
// settles a lost notification and cancels an expired attempt; finalize is idempotent; another institution's ref is not found.
class OnlinePaymentTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function ready(string $slug): array
    {
        $s = $this->school($slug);
        Tenancy::as($s['i'], function () use ($s) {
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 500, 'frequency' => 'monthly']);
            $s['mine']->enrollments()->update(['enrolled_at' => '2026-10-05']);   // dues: 2026-10 and 2026-11
            InstitutionPaymentGateway::create(['gateway' => 'fakeqr', 'credentials' => [], 'status' => 'active']);
        });
        return $s;
    }

    private function keys(array $s): array
    {
        return Tenancy::as($s['i'], fn () => app(\App\Services\FeeService::class)->dueLines($s['mine']->fresh())->pluck('key')->all());
    }

    private function start(array $s, array $keys): array
    {
        return Tenancy::as($s['i'], fn () => app(OnlinePaymentService::class)->initiate($s['parent'], $s['mine']->fresh(), $keys, 'fakeqr'));
    }

    private function central(): string
    {
        return config('tenancy.central_domains')[0] ?? ('www.' . config('tenancy.base_domain'));
    }

    public function test_registry_router_and_production(): void
    {
        $s = $this->ready('opay0');
        $this->assertSame(['fakeqr'], GatewayRegistry::enabledKeys(), 'no real provider is registered');
        $this->assertSame([['gateway' => 'fakeqr', 'label' => config('payments.gateways.fakeqr.label'), 'mode' => 'institution', 'flow' => 'qr']], app(PaymentRouter::class)->options($s['i']));
        $other = $this->school('opay0b');
        $this->assertSame([], app(PaymentRouter::class)->options($other['i']), 'an institution that did not switch a gateway on has no option');
        $this->app->detectEnvironment(fn () => 'production');
        $this->assertSame([], GatewayRegistry::enabledKeys(), 'production: nothing is offered');
        $this->assertSame([], app(PaymentRouter::class)->options($s['i']));
    }

    public function test_pay_two_dues_one_receipt_notify_auth_and_idempotence(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->ready('opay1');
        $keys = $this->keys($s);
        $this->assertCount(2, $keys);
        $r = $this->start($s, $keys);
        $this->assertSame(['qr', 'institution'], [$r['flow'], $r['mode']]);
        $this->assertMatchesRegularExpression('/^F[A-Z0-9]{19}$/', $r['ref']);
        $this->assertSame("FAKEQR|{$r['ref']}|1000.00", $r['qr_payload']);
        $p = Tenancy::as($s['i'], fn () => OnlinePayment::first());
        $this->assertSame(['1000.00', 'initiated', 'institution', 'qr'], [$p->amount, $p->status, $p->collected_by, $p->flow]);

        // a second attempt on the same dues is refused while this one is open
        try { $this->start($s, [$keys[0]]); $this->fail('expected payment_in_progress'); } catch (\App\Exceptions\BusinessException $e) { $this->assertSame('payment_in_progress', $e->errorCode); }

        $host = $this->central();
        // the notification: unknown gateway 404, no ref 404, wrong secret 403, nothing paid yet -> still initiated
        $this->postJson("http://{$host}/api/v1/fees/payment/bkash/notify", ['ref' => $r['ref']])->assertNotFound();
        $this->postJson("http://{$host}/api/v1/fees/payment/fakeqr/notify", [])->assertNotFound();
        $this->postJson("http://{$host}/api/v1/fees/payment/fakeqr/notify", ['ref' => $r['ref']], ['X-Fake-Secret' => 'wrong'])->assertForbidden();
        $this->postJson("http://{$host}/api/v1/fees/payment/fakeqr/notify", ['ref' => $r['ref']], ['X-Fake-Secret' => config('app.key')])->assertOk()->assertJsonPath('status', 'initiated');

        // the customer pays (simulator): one receipt, two lines, the dues are gone
        $this->postJson("http://{$host}/api/v1/dev/fakeqr/pay", ['ref' => $r['ref']])->assertOk()->assertJsonPath('data.status', 'success');
        Tenancy::as($s['i'], function () use ($s, $r) {
            $p = OnlinePayment::first();
            $lines = FeePayment::where('online_payment_id', $p->id)->orderBy('line_no')->get();
            $this->assertSame(['success', 'banglaqr', 'FAKE-' . $r['ref']], [$p->status, $p->channel, $p->trx_id]);
            $this->assertSame([[1, '500.00', 'fakeqr', $p->receipt_no], [2, '500.00', 'fakeqr', $p->receipt_no]], $lines->map(fn ($l) => [$l->line_no, $l->paid_amount, $l->payment_method, $l->receipt_no])->all());
            $this->assertNotNull($p->receipt_no);
            $this->assertSame([], app(\App\Services\FeeService::class)->dueLines($s['mine']->fresh())->all());
        });
        // again and again: nothing more is written
        $this->postJson("http://{$host}/api/v1/dev/fakeqr/pay", ['ref' => $r['ref']])->assertOk()->assertJsonPath('data.status', 'success');
        $this->postJson("http://{$host}/api/v1/fees/payment/fakeqr/notify", ['ref' => $r['ref']], ['X-Fake-Secret' => config('app.key')])->assertOk();
        $this->assertSame(2, Tenancy::as($s['i'], fn () => FeePayment::count()));
        Tenancy::as($s['i'], fn () => $this->assertSame(['online_payment.initiated', 'online_payment.success'], AuditLog::where('action', 'like', 'online_payment.%')->orderBy('id')->pluck('action')->all()));
    }

    public function test_the_client_cannot_choose_the_amount_or_another_students_due(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->ready('opay2');
        $keys = $this->keys($s);
        foreach ([['999:1:2026-10'], [], ['x'], [Tenancy::as($s['i'], fn () => $s['other']->enrollments()->value('id')) . ':1:2026-11']] as $bad) {
            try { $this->start($s, $bad); $this->fail('expected a validation error'); } catch (\Illuminate\Validation\ValidationException $e) { $this->assertArrayHasKey('dues', $e->errors()); }
        }
        // not this parent's child
        try {
            Tenancy::as($s['i'], fn () => app(OnlinePaymentService::class)->initiate($s['parent'], $s['other']->fresh(), $keys, 'fakeqr'));
            $this->fail('expected 404');
        } catch (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException) { $this->assertTrue(true); }
        // a gateway that is not switched on
        Tenancy::as($s['i'], fn () => InstitutionPaymentGateway::query()->update(['status' => 'disabled']));
        try { $this->start($s, $keys); $this->fail('expected unavailable'); } catch (\App\Exceptions\BusinessException $e) { $this->assertSame('payment_gateway_unavailable', $e->errorCode); }
        $this->assertSame(0, Tenancy::as($s['i'], fn () => OnlinePayment::count()));
    }

    public function test_wrong_amount_late_payment_duplicate_review_and_reconcile(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->ready('opay3');
        $host = $this->central();
        [$oct, $nov] = $this->keys($s);
        $svc = app(OnlinePaymentService::class);

        // (1) a different amount was paid: review, nothing credited
        $a = $this->start($s, [$oct]);
        $this->postJson("http://{$host}/api/v1/dev/fakeqr/pay", ['ref' => $a['ref'], 'amount' => '400'])->assertOk()->assertJsonPath('data.status', 'review')->assertJsonPath('data.failure_reason', 'amount_mismatch');
        $this->assertSame(0, Tenancy::as($s['i'], fn () => FeePayment::count()));
        $rowA = Tenancy::as($s['i'], fn () => OnlinePayment::where('gateway_ref', $a['ref'])->first());
        try { $svc->resolveReview($rowA, 'accept_as_paid'); $this->fail('a wrong amount cannot be accepted'); } catch (\App\Exceptions\BusinessException $e) { $this->assertSame('payment_cannot_accept', $e->errorCode); }
        $this->assertSame('refunded', $svc->resolveReview($rowA, 'mark_refunded', 'ফেরত দেওয়া হয়েছে')->status);

        // (2) the reconcile job settles a payment whose notification was lost
        $b = $this->start($s, [$oct]);
        Cache::put("fakeqr:{$b['ref']}", ['amount' => '500.00'], 600);
        $this->artisan('payments:reconcile')->assertSuccessful();
        $this->assertSame('success', Tenancy::as($s['i'], fn () => OnlinePayment::where('gateway_ref', $b['ref'])->value('status')));
        $this->assertSame(1, Tenancy::as($s['i'], fn () => FeePayment::count()));

        // (3) an attempt nobody paid: cancelled after expiry + grace; money arriving after that is a late payment -> review,
        //     and the Super Admin may accept it while the due is still unpaid
        $c = $this->start($s, [$nov]);
        $this->travelTo('2026-11-14 10:20:00');
        $this->artisan('payments:reconcile')->assertSuccessful();
        $this->assertSame('initiated', Tenancy::as($s['i'], fn () => OnlinePayment::where('gateway_ref', $c['ref'])->value('status')), 'inside the grace time it still listens');
        $this->travelTo('2026-11-14 10:40:00');
        $this->artisan('payments:reconcile')->assertSuccessful();
        $this->assertSame('cancelled', Tenancy::as($s['i'], fn () => OnlinePayment::where('gateway_ref', $c['ref'])->value('status')));
        $this->postJson("http://{$host}/api/v1/dev/fakeqr/pay", ['ref' => $c['ref']])->assertOk()->assertJsonPath('data.status', 'review')->assertJsonPath('data.failure_reason', 'late_payment');
        $rowC = Tenancy::as($s['i'], fn () => OnlinePayment::where('gateway_ref', $c['ref'])->first());
        $this->assertSame('success', $svc->resolveReview($rowC, 'accept_as_paid')->status);
        $this->assertSame(2, Tenancy::as($s['i'], fn () => FeePayment::count()));
        try { $svc->resolveReview($rowC->fresh(), 'mark_refunded'); $this->fail('not in review any more'); } catch (\App\Exceptions\BusinessException $e) { $this->assertSame('payment_not_in_review', $e->errorCode); }

        // (4) the due was paid at the counter while the QR was open: the online money goes to review as a duplicate
        Tenancy::as($s['i'], fn () => $s['mine']->enrollments()->update(['enrolled_at' => '2026-09-05']));   // one more due: 2026-09
        $sep = $this->keys($s);
        $this->assertCount(1, $sep);
        $d = $this->start($s, $sep);
        $this->actingAs($s['admin']);
        Tenancy::as($s['i'], fn () => app(\App\Services\FeeService::class)->collect($s['mine']->fresh(), [['key' => $sep[0]]], 'cash'));
        $this->postJson("http://{$host}/api/v1/dev/fakeqr/pay", ['ref' => $d['ref']])->assertOk()->assertJsonPath('data.status', 'review')->assertJsonPath('data.failure_reason', 'duplicate');
        $this->assertSame(3, Tenancy::as($s['i'], fn () => FeePayment::count()), 'no second line for the same due');

        // another institution cannot see or finish this institution's payment by guessing; an unknown ref is 404
        $this->postJson("http://{$host}/api/v1/dev/fakeqr/pay", ['ref' => 'FXXXXXXXXXXXXXXXXXXX'])->assertNotFound();
    }
}
