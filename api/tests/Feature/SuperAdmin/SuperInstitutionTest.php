<?php

namespace Tests\Feature\SuperAdmin;

use App\Models\{AuditLog, Batch, Institution, PlatformSetting, Program, SmsCreditTransaction, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, Hash};
use Tests\TestCase;

// docs/TESTING.md "SuperInstitutionTest" (5.3, D55): only super_admin on the central host; create an institution with its admin;
// suspend / activate; a module override changes that tenant's menu at once; another role or host is refused. Plus the
// Super Admin's wallet adjustment (D58) and the universal SMS settings (D57).
class SuperInstitutionTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->super = $this->makeUser(null, 'super_admin');
    }

    public function test_only_the_super_admin_on_the_central_host(): void
    {
        $i = $this->makeInstitution('guarded');
        $admin = $this->makeUser($i, 'admin');
        $this->api('GET', $this->central, 'super/institutions', $this->super)->assertOk();
        $this->api('GET', $this->hostOf($i), 'super/institutions', $this->super)->assertNotFound();
        $this->api('GET', $this->central, 'super/institutions', $admin)->assertForbidden();
        $this->api('GET', $this->central, 'super/institutions')->assertUnauthorized();
        $this->api('POST', $this->central, "super/institutions/{$i->id}/sms-credits", $admin, ['amount' => 100, 'note' => 'x'])->assertForbidden();
        $this->assertSame('0.00', $i->fresh()->sms_balance);
        $this->api('PUT', $this->central, 'super/sms-settings', $admin, ['rate' => '0.10'])->assertForbidden();
    }

    public function test_opening_an_institution_creates_its_admin_and_its_type_defaults(): void
    {
        $res = $this->api('POST', $this->central, 'super/institutions', $this->super, ['name' => 'Alo Coaching', 'slug' => 'alo-coaching', 'institution_type' => 'school',
            'admin' => ['name' => 'Rina', 'phone' => '+8801712345678', 'password' => 'first-pass-1']])->assertCreated();
        $i = Institution::where('slug', 'alo-coaching')->firstOrFail();
        $this->assertSame(['active', 'school', null], [$i->status, $i->institution_type, $i->subscription_plan_id], 'D55: active, no plan');
        $this->assertSame('alo-coaching.' . config('tenancy.base_domain'), $res->json('data.host'));

        $admin = User::where('institution_id', $i->id)->where('role', 'admin')->firstOrFail();
        $this->assertSame(['01712345678', true], [$admin->phone, (bool) $admin->must_change_password]);
        $this->assertTrue(Hash::check('first-pass-1', $admin->password));
        $this->assertSame(10, Tenancy::as($i, fn () => Program::count()), 'school onboarding defaults: Class 1-10');
        $this->assertSame(1, Tenancy::as($i, fn () => AuditLog::where('action', 'institution.created')->count()));

        // the new admin can log in on the institution's own host
        $this->json('POST', 'http://' . $res->json('data.host') . '/api/v1/auth/login', ['login' => '01712345678', 'password' => 'first-pass-1'])->assertOk();

        $this->api('POST', $this->central, 'super/institutions', $this->super, ['name' => 'X', 'slug' => 'alo-coaching', 'institution_type' => 'school',
            'admin' => ['name' => 'A', 'phone' => '01712345679', 'password' => 'xxxxxxxx']])->assertStatus(422)->assertJsonValidationErrors('slug');
        $this->api('POST', $this->central, 'super/institutions', $this->super, ['name' => 'X', 'slug' => 'admin', 'institution_type' => 'school',
            'admin' => ['name' => 'A', 'phone' => '01712345679', 'password' => 'xxxxxxxx']])->assertStatus(422)->assertJsonValidationErrors('slug');
        $this->assertSame(1, Institution::count(), 'nothing half-created');
    }

    public function test_suspend_and_activate(): void
    {
        $i = $this->makeInstitution('susp');
        $admin = $this->makeUser($i, 'admin');
        $this->api('GET', $this->hostOf($i), 'admin/dashboard', $admin)->assertOk();

        $this->api('PATCH', $this->central, "super/institutions/{$i->id}/toggle", $this->super)->assertOk()->assertJsonPath('data.status', 'suspended');
        $this->api('GET', $this->hostOf($i), 'admin/dashboard', $admin)->assertForbidden()->assertJsonPath('error', 'institution_suspended');

        $this->api('PATCH', $this->central, "super/institutions/{$i->id}/toggle", $this->super)->assertOk()->assertJsonPath('data.status', 'active');
        $this->api('GET', $this->hostOf($i), 'admin/dashboard', $admin)->assertOk();

        $this->api('DELETE', $this->central, "super/institutions/{$i->id}", $this->super)->assertStatus(409)->assertJsonPath('error', 'institution_delete_refused');
        $this->assertNotNull($i->fresh());
    }

    public function test_a_module_override_changes_the_tenants_menu_at_once(): void
    {
        $i = $this->makeInstitution('mods', 'coaching');
        $host = $this->hostOf($i);
        $this->assertContains('exams', $this->json('GET', "http://{$host}/api/v1/bootstrap")->json('data.modules'));    // cached now

        $d = $this->api('PUT', $this->central, "super/institutions/{$i->id}", $this->super, ['modules' => ['exams' => false]])->assertOk()->json('data.modules');
        $this->assertSame([false, false], [collect($d)->firstWhere('key', 'exams')['override'], collect($d)->firstWhere('key', 'exams')['enabled']]);
        $this->assertNotContains('exams', $this->json('GET', "http://{$host}/api/v1/bootstrap")->json('data.modules'), 'the cache was dropped');
        $admin = $this->makeUser($i, 'admin');
        $this->api('GET', $host, 'exams', $admin)->assertForbidden();

        $this->api('PUT', $this->central, "super/institutions/{$i->id}", $this->super, ['modules' => ['exams' => null]])->assertOk();
        $this->assertNull($i->fresh()->enabled_modules, 'null = back to the type default');
        $this->assertContains('exams', $this->json('GET', "http://{$host}/api/v1/bootstrap")->json('data.modules'));

        $this->api('PUT', $this->central, "super/institutions/{$i->id}", $this->super, ['modules' => ['hostel' => true]])->assertStatus(422);
    }

    public function test_the_list_filters_and_counts(): void
    {
        $a = $this->makeInstitution('alpha', 'school');
        $this->makeInstitution('beta', 'coaching', 'suspended');
        Tenancy::as($a, fn () => app(\App\Services\StudentService::class)->create(['name' => 'S', 'guardian_phone' => '01711111111'],
            Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'B'])));

        $all = $this->api('GET', $this->central, 'super/institutions', $this->super)->assertOk();
        $this->assertSame(2, $all->json('meta.total'));
        $this->assertSame(1, collect($all->json('data'))->firstWhere('slug', 'alpha')['students']);
        $this->assertSame(['beta'], array_column($this->api('GET', $this->central, 'super/institutions?status=suspended', $this->super)->json('data'), 'slug'));
        $this->assertSame(['alpha'], array_column($this->api('GET', $this->central, 'super/institutions?q=alp', $this->super)->json('data'), 'slug'));
        $this->assertSame(['beta'], array_column($this->api('GET', $this->central, 'super/institutions?type=coaching', $this->super)->json('data'), 'slug'));
    }

    public function test_the_super_admin_adjusts_the_wallet_with_a_ledger_row(): void
    {
        $i = $this->makeInstitution('adj');
        $this->api('POST', $this->central, "super/institutions/{$i->id}/sms-credits", $this->super, ['amount' => '500', 'note' => 'cash received'])
            ->assertOk()->assertJsonPath('data.balance', '500.00');
        $this->api('POST', $this->central, "super/institutions/{$i->id}/sms-credits", $this->super, ['amount' => '-20.50', 'note' => 'correction'])
            ->assertOk()->assertJsonPath('data.balance', '479.50');
        $this->api('POST', $this->central, "super/institutions/{$i->id}/sms-credits", $this->super, ['amount' => '-480', 'note' => 'too much'])
            ->assertStatus(422)->assertJsonPath('error', 'sms_balance_negative');
        $this->api('POST', $this->central, "super/institutions/{$i->id}/sms-credits", $this->super, ['amount' => '1.234', 'note' => 'x'])->assertStatus(422);
        $this->api('POST', $this->central, "super/institutions/{$i->id}/sms-credits", $this->super, ['amount' => '0', 'note' => 'x'])->assertStatus(422);

        $this->assertSame('479.50', $i->fresh()->sms_balance);
        $rows = Tenancy::as($i, fn () => SmsCreditTransaction::orderBy('id')->get());
        $this->assertSame([['adjustment', '500.00', '500.00', $this->super->id], ['adjustment', '-20.50', '479.50', $this->super->id]],
            $rows->map(fn ($t) => [$t->type, $t->amount, $t->balance_after, (int) $t->created_by])->all());
        $this->assertSame(['479.50', 2], [$this->api('GET', $this->central, "super/institutions/{$i->id}", $this->super)->json('data.sms.balance'),
            count($this->api('GET', $this->central, "super/institutions/{$i->id}", $this->super)->json('data.sms.transactions'))]);
    }

    public function test_universal_sms_settings_keep_the_key_encrypted_and_set_the_rate(): void
    {
        $d = $this->api('GET', $this->central, 'super/sms-settings', $this->super)->assertOk()->json('data');
        $this->assertSame(['0.40', false], [$d['rate'], $d['api_key_set']]);

        $res = $this->api('PUT', $this->central, 'super/sms-settings', $this->super, ['rate' => '0.35', 'sender_id' => 'EDUSAAS', 'api_key' => 'platform-key-4321'])->assertOk();
        $this->assertSame(['0.35', 'EDUSAAS', true, '••••4321', 'panel'], [$res->json('data.rate'), $res->json('data.effective_sender'), $res->json('data.api_key_set'),
            $res->json('data.api_key_hint'), $res->json('data.api_key_source')]);
        $this->assertStringNotContainsString('platform-key-4321', $res->getContent());
        $stored = PlatformSetting::read('sms_universal_api_key');
        $this->assertNotSame('platform-key-4321', $stored);
        $this->assertSame('platform-key-4321', Crypt::decryptString($stored));

        $this->api('PUT', $this->central, 'super/sms-settings', $this->super, ['rate' => '0'])->assertStatus(422);
        $this->api('PUT', $this->central, 'super/sms-settings', $this->super, ['rate' => '0.333'])->assertStatus(422);
        $this->assertFalse($this->api('PUT', $this->central, 'super/sms-settings', $this->super, ['clear_api_key' => true])->json('data.api_key_set'));
    }
}
