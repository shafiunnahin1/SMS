<?php

namespace Tests\Feature\Sms;

use App\Exceptions\BusinessException;
use App\Jobs\SendSmsJob;
use App\Models\{AuditLog, PlatformSetting, SmsCreditTransaction, SmsLog};
use App\Services\Sms\SmsGateway;
use App\Services\SmsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB};
use Tests\TestCase;

// docs/TESTING.md "SmsRouteTest" (D57/D59): universal on + own off -> universal API, charged; own on -> the institution's own
// BulkSMSBD key and sender, never charged; own fails + universal on -> one fallback, charged, fallback_used; both off -> not
// sent; keys stored encrypted, never returned in full.
class SmsRouteTest extends TestCase
{
    use RefreshDatabase;

    private function gateway(array $refuse = []): FakeGateway
    {
        $g = new FakeGateway($refuse);
        $this->app->instance(SmsGateway::class, $g);
        $this->app->forgetInstance(SmsService::class);
        return $g;
    }

    private function institution(array $attrs)
    {
        $i = $this->makeInstitution('route' . substr(md5(json_encode($attrs)), 0, 6));
        $i->forceFill($attrs + ['sms_balance' => '10.00', 'settings' => ['sms_short_name' => 'Rt']])->save();
        $this->bindTenant($i->fresh());
        return $i;
    }

    public function test_universal_route_uses_the_platform_key_and_sender_and_charges(): void
    {
        $g = $this->gateway();
        PlatformSetting::write('sms_universal_api_key', Crypt::encryptString('platform-key-1234'));
        PlatformSetting::write('sms_universal_sender_id', 'EDUSAAS');
        $i = $this->institution(['sms_own_enabled' => false, 'sms_universal_enabled' => true, 'sms_api_key' => 'own-key-5678', 'sms_sender_id' => 'OWNID']);

        $this->assertTrue(app(SmsService::class)->send('01711111111', 'hello'));
        $this->assertSame([['phone' => '01711111111', 'text' => 'hello -Rt', 'senderId' => 'EDUSAAS', 'apiKey' => 'platform-key-1234']], $g->sent,
            'own switched off: the stored own key is not used');
        $log = SmsLog::first();
        $this->assertSame(['universal', '0.40', false], [$log->route, $log->cost, (bool) $log->fallback_used]);
        $this->assertSame('9.60', $i->fresh()->sms_balance);
    }

    public function test_own_route_uses_the_institutions_key_and_is_never_charged(): void
    {
        $g = $this->gateway();
        $i = $this->institution(['sms_own_enabled' => true, 'sms_universal_enabled' => true, 'sms_api_key' => 'own-key-5678', 'sms_sender_id' => 'OWNID', 'sms_balance' => '0.00']);

        $this->assertTrue(app(SmsService::class)->send('01711111111', str_repeat('ক', 200)), 'an empty wallet does not matter on the own API');
        $this->assertSame(['OWNID', 'own-key-5678', str_repeat('ক', 200)], [$g->sent[0]['senderId'], $g->sent[0]['apiKey'], $g->sent[0]['text']], 'no suffix');
        $this->assertSame(['own', '0.00', 'sent'], [SmsLog::first()->route, SmsLog::first()->cost, SmsLog::first()->status]);
        $this->assertSame(['0.00', 0], [$i->fresh()->sms_balance, SmsCreditTransaction::count()]);

        // switched on but incomplete (no key) -> treated as off: the universal API, charged
        $this->gateway();
        $j = $this->institution(['sms_own_enabled' => true, 'sms_universal_enabled' => true, 'sms_api_key' => null, 'sms_sender_id' => 'OWNID']);
        app(SmsService::class)->send('01711111111', 'hi');
        $this->assertSame(['universal', '9.60'], [SmsLog::latest('id')->first()->route, $j->fresh()->sms_balance]);
    }

    public function test_own_failing_falls_back_once_through_universal_and_is_charged(): void
    {
        $g = $this->gateway(['OWNID']);
        $i = $this->institution(['sms_own_enabled' => true, 'sms_universal_enabled' => true, 'sms_api_key' => 'own-key-5678', 'sms_sender_id' => 'OWNID']);

        $this->assertTrue(app(SmsService::class)->send('01711111111', 'hello'));
        $this->assertSame(['OWNID', (string) config('services.ssl_wireless.sid')], array_column($g->sent, 'senderId'), 'exactly one fallback');
        $this->assertSame([null], array_slice(array_column($g->sent, 'apiKey'), 1), 'the fallback uses the platform key, not the own one');
        $log = SmsLog::first();
        $this->assertSame(['sent', 'universal', true, 'hello -Rt', '0.40'], [$log->status, $log->route, (bool) $log->fallback_used, $log->message, $log->cost]);
        $this->assertSame('9.60', $i->fresh()->sms_balance);

        // universal switched off: no fallback, the failure is logged on the own route, nothing charged
        $g = $this->gateway(['OWNID']);
        $j = $this->institution(['sms_own_enabled' => true, 'sms_universal_enabled' => false, 'sms_api_key' => 'own-key-5678', 'sms_sender_id' => 'OWNID']);
        $this->assertFalse(app(SmsService::class)->send('01711111111', 'hello'));
        $this->assertCount(1, $g->sent);
        $log = SmsLog::latest('id')->first();
        $this->assertSame(['failed', 'own', false, '0.00'], [$log->status, $log->route, (bool) $log->fallback_used, $log->cost]);
        $this->assertSame('10.00', $j->fresh()->sms_balance);

        // universal on but the wallet cannot pay: no fallback either
        $g = $this->gateway(['OWNID']);
        $this->institution(['sms_own_enabled' => true, 'sms_universal_enabled' => true, 'sms_api_key' => 'own-key-5678', 'sms_sender_id' => 'OWNID', 'sms_balance' => '0.10']);
        $this->assertFalse(app(SmsService::class)->send('01711111111', 'hello'));
        $this->assertCount(1, $g->sent);
    }

    public function test_both_switched_off_sends_nothing_and_a_job_does_not_fail(): void
    {
        $g = $this->gateway();
        $i = $this->institution(['sms_own_enabled' => false, 'sms_universal_enabled' => false]);
        try {
            app(SmsService::class)->send('01711111111', 'hello');
            $this->fail('expected sms_disabled');
        } catch (BusinessException $e) {
            $this->assertSame(['sms_disabled', 409], [$e->errorCode, $e->status]);
        }
        SendSmsJob::dispatchSync('01711111111', 'automatic', $i->id);
        $this->assertSame([[], 0], [$g->sent, SmsLog::count()]);
    }

    public function test_the_settings_endpoint_keeps_the_key_encrypted_and_never_returns_it(): void
    {
        $this->gateway();
        $i = $this->makeInstitution('routeapi');
        $host = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');

        $res = $this->api('GET', $host, 'admin/settings/sms-sender', $admin)->assertOk();
        $this->assertSame([true, false, false, 'universal'], [$res->json('data.universal_enabled'), $res->json('data.own_enabled'), $res->json('data.api_key_set'), $res->json('data.effective')]);

        $this->api('PUT', $host, 'admin/settings/sms-sender', $admin, ['own_enabled' => true])->assertStatus(422)->assertJsonPath('error', 'sms_own_incomplete');
        $res = $this->api('PUT', $host, 'admin/settings/sms-sender', $admin, ['own_enabled' => true, 'sender_id' => 'MYSCHOOL', 'api_key' => 'secret-key-9876'])->assertOk();
        $this->assertSame(['own', '••••9876', 'MYSCHOOL'], [$res->json('data.effective'), $res->json('data.api_key_hint'), $res->json('data.sender_id')]);
        $this->assertStringNotContainsString('secret-key-9876', $res->getContent());

        $raw = DB::table('institutions')->where('id', $i->id)->value('sms_api_key');
        $this->assertNotSame('secret-key-9876', $raw, 'stored encrypted');
        $this->assertSame('secret-key-9876', Crypt::decryptString($raw));
        $this->assertStringNotContainsString('secret-key-9876', json_encode($i->fresh()->toArray()), 'hidden from serialisation');
        $this->assertStringNotContainsString('secret-key-9876', (string) \App\Support\Tenancy::as($i, fn () => AuditLog::where('action', 'sms_sender.updated')->get()->toJson()), 'never in the audit log');

        $this->assertSame(1, \App\Support\Tenancy::as($i, fn () => AuditLog::where('action', 'sms_sender.updated')->count()), 'the change is audited');

        // an empty key keeps the stored one; both switches off -> "off"
        $res = $this->api('PUT', $host, 'admin/settings/sms-sender', $admin, ['api_key' => '', 'own_enabled' => false, 'universal_enabled' => false])->assertOk();
        $this->assertSame([true, 'off'], [$res->json('data.api_key_set'), $res->json('data.effective')]);

        $res = $this->api('DELETE', $host, 'admin/settings/sms-sender', $admin)->assertOk();
        $this->assertSame([false, null, false], [$res->json('data.api_key_set'), $res->json('data.sender_id'), $res->json('data.own_enabled')]);

        $this->api('GET', $host, 'admin/settings/sms-sender', $this->makeUser($i, 'accountant'))->assertForbidden();
        $this->api('PUT', $host, 'admin/settings/sms-sender', $admin, ['sender_id' => str_repeat('A', 21)])->assertStatus(422);
    }
}
