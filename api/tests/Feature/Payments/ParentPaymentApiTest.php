<?php

namespace Tests\Feature\Payments;

use App\Models\{FeeCategory, FeePayment, InstitutionPaymentGateway, OnlinePayment};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Queue};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D217 OPAY.2: the parent's API - the options (none where no gateway is switched on), starting a payment for the own child's
// dues by key only (an amount in the request is ignored), polling settles a paid QR, and nobody else can read the payment.
class ParentPaymentApiTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_options_create_poll_and_access(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('ppay');
        $h = $s['host'];
        $parent = $s['parent'];
        Tenancy::as($s['i'], function () use ($s) {
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 500, 'frequency' => 'monthly']);
            $s['mine']->enrollments()->update(['enrolled_at' => '2026-10-05']);
        });

        // nothing switched on: no option, and a create is refused
        $this->api('GET', $h, 'parent/fees/payment-options', $parent)->assertOk()->assertJsonPath('data', []);
        $keys = array_column($this->api('GET', $h, "parent/fees?student_id={$s['mine']->id}", $parent)->assertOk()->json('data.lines'), 'key');
        $this->assertCount(2, $keys);
        $this->api('POST', $h, 'fees/payment/fakeqr/create', $parent, ['student_id' => $s['mine']->id, 'dues' => $keys])->assertStatus(422)->assertJsonPath('error', 'payment_gateway_unavailable');
        Tenancy::as($s['i'], fn () => InstitutionPaymentGateway::create(['gateway' => 'fakeqr', 'credentials' => [], 'status' => 'active']));
        $this->api('GET', $h, 'parent/fees/payment-options', $parent)->assertOk()->assertJsonPath('data.0.gateway', 'fakeqr')->assertJsonPath('data.0.flow', 'qr');

        // who may: only a parent; only the own child; a known gateway; well-formed keys
        $this->api('GET', $h, 'parent/fees/payment-options', $s['admin'])->assertForbidden();
        $this->api('POST', $h, 'fees/payment/fakeqr/create', $s['admin'], ['student_id' => $s['mine']->id, 'dues' => $keys])->assertForbidden();
        $this->api('POST', $h, 'fees/payment/bkash/create', $parent, ['student_id' => $s['mine']->id, 'dues' => $keys])->assertNotFound();
        $this->api('POST', $h, 'fees/payment/fakeqr/create', $parent, ['student_id' => $s['other']->id, 'dues' => $keys])->assertNotFound();
        $this->api('POST', $h, 'fees/payment/fakeqr/create', $parent, ['student_id' => $s['mine']->id, 'dues' => ['1; drop']])->assertStatus(422);
        $this->api('POST', $h, 'fees/payment/fakeqr/create', $parent, ['student_id' => $s['mine']->id, 'dues' => ['9999:1:2026-10']])->assertStatus(422);

        // an amount sent by the client is ignored: the server charges the dues
        $r = $this->api('POST', $h, 'fees/payment/fakeqr/create', $parent, ['student_id' => $s['mine']->id, 'dues' => [$keys[0]], 'amount' => 1])->assertCreated()->json('data');
        $this->assertSame('qr', $r['flow']);
        $this->assertStringEndsWith('|500.00', $r['qr_payload']);
        $this->assertSame('500.00', Tenancy::as($s['i'], fn () => OnlinePayment::value('amount')));

        // polling: open (the QR can be redrawn), then paid -> success with the receipt, the QR gone
        $st = $this->api('GET', $h, "parent/online-payments/{$r['ref']}", $parent)->assertOk()->json('data');
        $this->assertSame(['initiated', $r['qr_payload']], [$st['status'], $st['qr_payload']]);
        $this->assertNotNull($st['expires_at']);
        Cache::put("fakeqr:{$r['ref']}", ['amount' => '500.00'], 600);
        $st = $this->api('GET', $h, "parent/online-payments/{$r['ref']}", $parent)->assertOk()->json('data');
        $this->assertSame(['success', null, null], [$st['status'], $st['qr_payload'], $st['expires_at']]);
        $this->assertSame($st['receipt_no'], Tenancy::as($s['i'], fn () => FeePayment::value('receipt_no')));
        $this->assertCount(1, $this->api('GET', $h, "parent/fees?student_id={$s['mine']->id}", $parent)->json('data.lines'));

        // another parent, another role and another institution cannot read it
        $otherParent = $this->makeUser($s['i'], 'parent');
        $this->api('GET', $h, "parent/online-payments/{$r['ref']}", $otherParent)->assertNotFound();
        $this->api('GET', $h, "parent/online-payments/{$r['ref']}", $s['admin'])->assertForbidden();
        $t = $this->school('ppay2');
        $this->api('GET', $t['host'], "parent/online-payments/{$r['ref']}", $t['parent'])->assertNotFound();
    }
}
