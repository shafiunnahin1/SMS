<?php

namespace Tests\Feature\Payments;

use App\Models\{AuditLog, FeeCategory, FeePayment, InstitutionPaymentGateway, OnlinePayment, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Hash, Queue};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D217 OPAY.3: the admin switches the test gateway on (password re-auth, saved pending, "test" makes it active) and off; the
// credentials are never returned; the admin and the accountant read the payments; the Super Admin sees every institution's review
// queue, accepts a late payment (credits the fee) or marks a wrong-amount one refunded, and may ask the provider again.
class PaymentAdminTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_settings_list_and_the_super_admin_review(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-14 10:00:00');
        $s = $this->school('padm');
        $h = $s['host'];
        $admin = $s['admin'];
        $admin->forceFill(['password' => Hash::make('Secret#123')])->save();
        $accountant = $this->makeUser($s['i'], 'accountant');
        Tenancy::as($s['i'], function () use ($s) {
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 500, 'frequency' => 'monthly']);
            $s['mine']->enrollments()->update(['enrolled_at' => '2026-10-05']);
        });

        // settings: the registry offers only the test gateway; switching on needs the admin's password
        $st = $this->api('GET', $h, 'admin/settings/payments', $admin)->assertOk()->json('data');
        $this->assertSame(['fakeqr'], array_column($st['available_gateways'], 'key'));
        $this->assertSame([[], [], ['fakeqr' => null], false], [$st['available_gateways'][0]['credential_fields'], $st['gateways'], $st['effective_mode'], $st['real_gateways']]);
        $this->api('GET', $h, 'admin/settings/payments', $accountant)->assertForbidden();
        $this->api('PUT', $h, 'admin/settings/payments/gateways/fakeqr', $admin, ['password' => 'wrong'])->assertStatus(422)->assertJsonPath('error', 'payment_password_wrong');
        $this->api('PUT', $h, 'admin/settings/payments/gateways/bkash', $admin, ['password' => 'Secret#123'])->assertNotFound();
        $st = $this->api('PUT', $h, 'admin/settings/payments/gateways/fakeqr', $admin, ['password' => 'Secret#123'])->assertOk()->json('data');
        $this->assertSame(['pending', null], [$st['gateways'][0]['status'], $st['effective_mode']['fakeqr']]);
        $this->assertSame([], $this->api('GET', $h, 'parent/fees/payment-options', $s['parent'])->json('data'), 'pending is not offered yet');
        $st = $this->api('POST', $h, 'admin/settings/payments/gateways/fakeqr/test', $admin)->assertOk()->json('data');
        $this->assertSame(['active', 'institution'], [$st['gateways'][0]['status'], $st['effective_mode']['fakeqr']]);
        $this->assertArrayNotHasKey('credentials', $st['gateways'][0]);
        $this->assertCount(1, $this->api('GET', $h, 'parent/fees/payment-options', $s['parent'])->json('data'));

        // two payments: one late (accepted later), one of a wrong amount (refunded later)
        $keys = array_column($this->api('GET', $h, "parent/fees?student_id={$s['mine']->id}", $s['parent'])->json('data.lines'), 'key');
        $central = config('tenancy.central_domains')[0] ?? ('www.' . config('tenancy.base_domain'));
        $late = $this->api('POST', $h, 'fees/payment/fakeqr/create', $s['parent'], ['student_id' => $s['mine']->id, 'dues' => [$keys[0]]])->assertCreated()->json('data.ref');
        $wrong = $this->api('POST', $h, 'fees/payment/fakeqr/create', $s['parent'], ['student_id' => $s['mine']->id, 'dues' => [$keys[1]]])->assertCreated()->json('data.ref');
        $this->postJson("http://{$central}/api/v1/dev/fakeqr/pay", ['ref' => $wrong, 'amount' => '5'])->assertOk()->assertJsonPath('data.status', 'review');
        $this->travelTo('2026-11-14 10:40:00');
        $this->artisan('payments:reconcile')->assertSuccessful();
        $this->postJson("http://{$central}/api/v1/dev/fakeqr/pay", ['ref' => $late])->assertOk()->assertJsonPath('data.failure_reason', 'late_payment');

        // the institution reads its payments (admin and accountant), nobody else
        $list = $this->api('GET', $h, 'admin/payments?status=review', $accountant)->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$late, $wrong], array_column($list, 'ref'));
        $one = $this->api('GET', $h, "admin/payments/{$list[0]['id']}", $admin)->assertOk()->json('data');
        $this->assertSame('500.00', $one['items'][0]['amount']);
        $this->assertArrayNotHasKey('raw_response', $one);
        $this->api('GET', $h, 'admin/payments', $s['karimUser'])->assertForbidden();
        $this->api('GET', $h, 'admin/payments', $s['parent'])->assertForbidden();

        // the Super Admin's queue (central host)
        $super = User::create(['name' => 'Root', 'email' => 'root@example.test', 'password' => Hash::make('x'), 'role' => 'super_admin', 'institution_id' => null]);
        $this->api('GET', $central, 'super/online-payments', $admin)->assertForbidden();
        $q = $this->api('GET', $central, 'super/online-payments?status=review', $super)->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$late, $wrong], array_column($q, 'ref'));
        $this->assertSame($s['i']->name, $q[0]['institution']['name']);
        $id = fn (string $ref) => collect($q)->firstWhere('ref', $ref)['id'];
        $this->api('POST', $central, "super/online-payments/{$id($wrong)}/resolve", $super, ['action' => 'accept_as_paid'])->assertStatus(422)->assertJsonPath('error', 'payment_cannot_accept');
        $this->api('POST', $central, "super/online-payments/{$id($wrong)}/resolve", $super, ['action' => 'mark_refunded', 'note' => 'ফেরত'])->assertOk()->assertJsonPath('data.status', 'refunded');
        $this->api('POST', $central, "super/online-payments/{$id($late)}/verify", $super)->assertOk()->assertJsonPath('data.status', 'review');
        $this->api('POST', $central, "super/online-payments/{$id($late)}/resolve", $super, ['action' => 'accept_as_paid'])->assertOk()->assertJsonPath('data.status', 'success');
        $this->api('POST', $central, "super/online-payments/{$id($late)}/resolve", $super, ['action' => 'mark_refunded'])->assertStatus(422)->assertJsonPath('error', 'payment_not_in_review');
        Tenancy::as($s['i'], function () use ($super) {
            $this->assertSame(1, FeePayment::count(), 'only the accepted payment credited a fee');
            $this->assertSame($super->id, AuditLog::where('action', 'online_payment.review_accept_as_paid')->value('user_id'));
        });

        // switched off: no option for parents; the rows stay
        $this->api('DELETE', $h, 'admin/settings/payments/gateways/fakeqr', $admin)->assertOk()->assertJsonPath('data.gateways.0.status', 'disabled');
        $this->assertSame([], $this->api('GET', $h, 'parent/fees/payment-options', $s['parent'])->json('data'));
        $this->assertSame(2, Tenancy::as($s['i'], fn () => OnlinePayment::count()));
        $this->assertSame(1, Tenancy::as($s['i'], fn () => InstitutionPaymentGateway::count()));
    }
}
