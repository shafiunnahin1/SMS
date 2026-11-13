<?php

namespace Tests\Feature\Admission;

use App\Models\{AdmissionCycle, AdmissionLead, AuditLog, LeadPayment};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D209 ACY.2: the application fee - methods per institution (cash default; online only a saved choice), cash at the office for
// the cycle's own fee with an APP- receipt, never twice, a reversal is a new negative row (D32), money moves only while the cycle
// is open, and at the freeze only paid applications take part and get test rolls in the order they applied.
class AdmissionFeeTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_cash_fee_receipts_reversal_and_test_rolls(): void
    {
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('acyfee');
        $h = $s['host'];
        $admin = $s['admin'];
        $acct = $this->makeUser($s['i'], 'accountant');
        [$cycleId, $a, $b, $c] = Tenancy::as($s['i'], function () use ($s) {
            $cy = AdmissionCycle::create(['name' => 'C', 'program_id' => $s['p']->id, 'seats' => 2, 'apply_from' => '2030-01-01', 'apply_until' => '2030-12-31',
                'application_fee' => '250.00', 'status' => 'open', 'rule' => ['mode' => 'merit', 'waiting' => 1]]);
            $mk = fn ($n, $no) => AdmissionLead::create(['name' => $n, 'phone' => '0171100040' . strlen($n), 'cycle_id' => $cy->id, 'application_no' => $no])->id;
            return [$cy->id, $mk('A', 'A30-AAAAA'), $mk('BB', 'A30-BBBBB'), $mk('CCC', 'A30-CCCCC')];
        });

        $this->api('GET', $h, 'admission/fee-methods', $admin)->assertOk()->assertJsonPath('data.methods', ['cash'])->assertJsonPath('data.online_available', false);
        $this->api('PUT', $h, 'admission/fee-methods', $admin, ['methods' => ['bkash']])->assertStatus(422);
        $this->api('PUT', $h, 'admission/fee-methods', $acct, ['methods' => ['online']])->assertForbidden();

        // the accountant takes cash: the cycle's fee, whatever the client sends; never twice
        $r = $this->api('POST', $h, "admission/leads/{$a}/payments", $acct, ['amount' => '1.00'])->assertCreated();
        $this->assertSame(['cash', '250.00', 'APP-2030-00001'], [$r->json('data.method'), $r->json('data.amount'), $r->json('data.receipt_no')]);
        $this->api('POST', $h, "admission/leads/{$a}/payments", $acct)->assertStatus(409)->assertJsonPath('error', 'fee_already_paid');
        $pb = $this->api('POST', $h, "admission/leads/{$b}/payments", $admin)->assertCreated()->assertJsonPath('data.receipt_no', 'APP-2030-00002')->json('data.id');

        // a reversal: admin only, a new negative row with its own receipt; the original stays; not twice
        $this->api('POST', $h, "admission/lead-payments/{$pb}/reverse", $acct, ['reason' => 'wrong person'])->assertForbidden();
        $this->api('POST', $h, "admission/lead-payments/{$pb}/reverse", $admin, ['reason' => 'wrong person'])->assertCreated()
            ->assertJsonPath('data.amount', '-250.00')->assertJsonPath('data.receipt_no', 'APP-2030-00003');
        $this->api('POST', $h, "admission/lead-payments/{$pb}/reverse", $admin, ['reason' => 'again'])->assertStatus(422)->assertJsonPath('error', 'payment_not_reversible');
        Tenancy::as($s['i'], function () {
            $this->assertSame(3, LeadPayment::count());
        });
        Tenancy::as($s['i'], function () {
            try { LeadPayment::first()->delete(); $this->fail('a payment was deleted'); } catch (\LogicException) {}
            try { LeadPayment::first()->update(['amount' => '1.00']); $this->fail('a payment was changed'); } catch (\LogicException) {}
        });

        $list = $this->api('GET', $h, "admission/cycles/{$cycleId}/applications", $acct)->assertOk();
        $this->assertSame([true, false, false], array_column($list->json('data'), 'paid'));
        $this->assertSame(['250.00', '0.00', '0.00'], array_column($list->json('data'), 'paid_amount'));

        // cash switched off: refused
        $this->api('PUT', $h, 'admission/fee-methods', $admin, ['methods' => ['online']])->assertOk()->assertJsonPath('data.methods', ['online']);
        $this->api('POST', $h, "admission/leads/{$c}/payments", $admin)->assertStatus(422)->assertJsonPath('error', 'fee_method_off');
        $this->api('PUT', $h, 'admission/fee-methods', $admin, ['methods' => ['cash', 'online']])->assertOk()->assertJsonPath('data.methods', ['cash', 'online']);
        $this->api('POST', $h, "admission/leads/{$c}/payments", $admin)->assertCreated();

        // the freeze: only the paid (A and C) take part; rolls in application order
        $this->api('POST', $h, "admission/cycles/{$cycleId}/freeze", $admin)->assertOk();
        Tenancy::as($s['i'], fn () => $this->assertSame(['0001', null, '0002'], AdmissionLead::orderBy('id')->pluck('test_roll')->all()));
        // after the freeze no money moves
        $this->api('POST', $h, "admission/leads/{$b}/payments", $admin)->assertStatus(422)->assertJsonPath('error', 'cycle_wrong_state');
        Tenancy::as($s['i'], function () {
            $this->assertSame(1, AuditLog::where('action', 'lead_payment.reversed')->count());
            $this->assertStringNotContainsString('01711', json_encode(AuditLog::get()->toArray()));   // no phone in the audit (G9)
        });
        $this->api('GET', $h, "admission/cycles/{$cycleId}/applications", $s['karimUser'])->assertForbidden();
    }
}
