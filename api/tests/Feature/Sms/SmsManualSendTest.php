<?php

namespace Tests\Feature\Sms;

use App\Models\{AuditLog, PlatformSetting, SmsLog};
use App\Services\Sms\SmsGateway;
use App\Services\SmsService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

// D208 SMSC.3: the admin's per-event switch (GET/PUT /admin/settings/sms-events) and the manual SMS in the history - send one,
// discard one, send several; the pending row itself becomes sent (no second row); only pending rows; admin + accountant only
class SmsManualSendTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_sets_event_modes_and_only_admin(): void
    {
        $i = $this->makeInstitution('smsev');
        $host = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');

        $r = $this->api('GET', $host, 'admin/settings/sms-events', $admin)->assertOk();
        $this->assertSame('auto', $r->json('data.events.attendance_absent'));
        $this->assertSame('off', $r->json('data.events.admission_result'));

        $r = $this->api('PUT', $host, 'admin/settings/sms-events', $admin, ['events' => ['attendance_absent' => 'manual', 'admission_result' => 'auto']])->assertOk();
        $this->assertSame(['manual', 'auto', 'auto'], [$r->json('data.events.attendance_absent'), $r->json('data.events.admission_result'), $r->json('data.events.fee_paid')]);
        $this->assertSame(1, Tenancy::as($i, fn () => AuditLog::where('action', 'sms_events.updated')->count()));

        $this->api('PUT', $host, 'admin/settings/sms-events', $admin, ['events' => ['fee_paid' => 'loud']])->assertStatus(422);
        $this->api('PUT', $host, 'admin/settings/sms-events', $admin, ['events' => ['nope' => 'off']])->assertStatus(422);
        $this->api('PUT', $host, 'admin/settings/sms-events', $this->makeUser($i, 'accountant'), ['events' => ['fee_paid' => 'off']])->assertForbidden();
        $this->api('GET', $host, 'admin/settings/sms-events', $this->makeUser($i, 'teacher'))->assertForbidden();
        $this->assertSame('manual', app(\App\Services\Sms\SmsEventPolicy::class)->mode('attendance_absent', $i->fresh()));
    }

    public function test_pending_sms_is_sent_or_discarded_by_hand(): void
    {
        $g = new FakeGateway();
        $this->app->instance(SmsGateway::class, $g);
        $this->app->forgetInstance(SmsService::class);
        PlatformSetting::write('sms_universal_api_key', Crypt::encryptString('platform-key-1234'));
        PlatformSetting::write('sms_universal_sender_id', 'EDUSAAS');
        $i = $this->makeInstitution('smsman');
        $i->forceFill(['sms_universal_enabled' => true, 'sms_balance' => '10.00', 'settings' => ['sms_short_name' => 'Mn']])->save();
        $host = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');
        $mk = fn ($n) => Tenancy::as($i, fn () => SmsLog::create(['to_phone' => "0171100002{$n}", 'message' => "m{$n}", 'status' => 'pending', 'event_key' => 'fee_paid',
            'segments' => 1, 'encoding' => 'gsm', 'cost' => '0.00'])->id);
        [$a, $b, $c, $d] = [$mk(1), $mk(2), $mk(3), $mk(4)];

        $list = $this->api('GET', $host, 'sms-logs?status=pending', $admin)->assertOk();
        $this->assertCount(4, $list->json('data'));
        $this->assertSame('fee_paid', $list->json('data.0.event_key'));

        $this->api('POST', $host, "sms-logs/{$a}/send", $admin)->assertOk()->assertJsonPath('data.status', 'sent');
        $this->assertSame(['phone' => '01711000021', 'text' => 'm1 -Mn'], array_intersect_key($g->sent[0], ['phone' => 1, 'text' => 1]));
        Tenancy::as($i, function () use ($a) {
            $this->assertSame(4, SmsLog::count(), 'the pending row became the sent record');
            $row = SmsLog::find($a);
            $this->assertSame(['sent', 'fee_paid'], [$row->status, $row->event_key]);
            $this->assertNotNull($row->sent_at);
        });
        $this->api('POST', $host, "sms-logs/{$a}/send", $admin)->assertStatus(409);

        $this->api('POST', $host, "sms-logs/{$b}/discard", $this->makeUser($i, 'accountant'))->assertOk()->assertJsonPath('data.status', 'discarded');
        $this->api('POST', $host, "sms-logs/{$b}/send", $admin)->assertStatus(409);

        $r = $this->api('POST', $host, 'sms-logs/send-pending', $admin, ['ids' => [$a, $b, $c, $d, 999999]])->assertOk();
        $this->assertSame(['sent' => 2, 'failed' => 0, 'skipped' => 3], $r->json('data'));
        $this->assertCount(3, $g->sent);
        Tenancy::as($i, function () {
            $this->assertSame(3, AuditLog::where('action', 'sms.sent_manually')->count());
            $this->assertSame(1, AuditLog::where('action', 'sms.discarded')->count());
            $this->assertStringNotContainsString('0171100002', json_encode(AuditLog::get()->toArray()));   // no phone in the audit (G9)
        });

        $this->api('POST', $host, "sms-logs/{$c}/send", $this->makeUser($i, 'teacher'))->assertForbidden();
    }
}
