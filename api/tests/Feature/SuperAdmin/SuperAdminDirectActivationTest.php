<?php

namespace Tests\Feature\SuperAdmin;

use App\Models\{AccountActivationRequest, AuditLog, Institution, InstitutionRegistration, OtpToken, User};
use App\Services\Auth\{ActivationDelivery, PrincipalProvisioningService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

// D170 (3): the Super Admin's separate "activate directly" action for an EXISTING pending Super Admin-created first admin (the shape of a
// pre-D170 record such as local institution #4: inactive, approved super_admin registration, an open OTP request, never logged in).
// It works once, cancels the open request and its code, sets a one-time hashed temporary password with a forced change, and audits
// without secrets or contact data. Public, rejected, already or previously active accounts are refused unchanged; only an active
// Super Admin on the central host may call it; afterwards the admin has exactly the role / module / tenant rights it always had.
class SuperAdminDirectActivationTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $super;
    private object $delivery;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->super = $this->makeUser(null, 'super_admin');
        $this->delivery = new class extends ActivationDelivery {
            public array $codes = [];
            public function send(string $channel, string $contact, string $code): bool { $this->codes[] = $code; return true; }
        };
        app()->instance(ActivationDelivery::class, $this->delivery);
    }

    /** a pending first admin created before D170: the D90 path (an OTP request), then marked as the Super Admin's approved registration */
    private function legacyPending(string $slug, string $source = 'super_admin', string $review = 'approved'): Institution
    {
        $state = app(PrincipalProvisioningService::class)->provision(['name' => 'Legacy', 'slug' => $slug, 'institution_type' => 'school'],
            ['name' => 'Principal', 'contact' => ['channel' => 'phone', 'value' => '+8801712345678'], 'password' => 'Secure-private-42', 'password_confirmation' => 'Secure-private-42']);
        $i = Institution::findOrFail($state['institution_id']);
        Tenancy::as($i, fn () => InstitutionRegistration::query()->update(['source' => $source, 'review_status' => $review, 'reviewed_by' => $this->super->id, 'reviewed_at' => now()]));
        return $i;
    }

    private function admin(Institution $i): User
    {
        return User::where('institution_id', $i->id)->where('role', 'admin')->sole();
    }

    private function activate(Institution $i, ?User $as = null, ?string $host = null)
    {
        $this->app['auth']->forgetGuards();
        return $this->api('POST', $host ?? $this->central, "super/institutions/{$i->id}/direct-activation", $as ?? $this->super);
    }

    public function test_an_eligible_pending_account_activates_once_without_otp(): void
    {
        $i = $this->legacyPending('legacy-four');
        $oldCode = end($this->delivery->codes);
        $this->assertSame(['eligible' => true, 'reason' => null], $this->api('GET', $this->central, "super/institutions/{$i->id}", $this->super)->json('data.direct_activation'));

        $res = $this->activate($i)->assertOk();
        $this->assertStringContainsString('no-store', (string) $res->headers->get('Cache-Control'));
        $temporary = $res->json('data.credentials.temporary_password');
        $admin = $this->admin($i);
        $this->assertSame(['active', true, true], [$i->fresh()->status, (bool) $admin->is_active, (bool) $admin->must_change_password]);
        $this->assertTrue(Hash::check($temporary, $admin->password));
        $this->assertFalse(Hash::check('Secure-private-42', $admin->password), 'the earlier password no longer works');

        Tenancy::as($i, function () use ($i, $admin, $temporary) {
            $requests = AccountActivationRequest::where('user_id', $admin->id)->get();
            $this->assertSame(['cancelled'], $requests->pluck('status')->unique()->values()->all(), 'the open request is cancelled, never "verified"');
            $this->assertTrue($requests->every(fn ($r) => $r->contact_verified_at === null), 'no fake OTP verification');
            $this->assertSame(0, OtpToken::where('user_id', $admin->id)->whereNull('used_at')->count(), 'its code is used up');
            $log = AuditLog::where('institution_id', $i->id)->where('action', 'institution.activated')->sole();
            $this->assertSame(['super_admin_provisioning', $admin->id, $this->super->id], [$log->new_data['reason'], $log->new_data['first_admin_id'], $log->user_id]);
            $all = json_encode(AuditLog::where('institution_id', $i->id)->get()->toArray());
            foreach ([$temporary, '01712345678', 'Secure-private-42'] as $secret) $this->assertStringNotContainsString($secret, $all);
        });
        // the old OTP code cannot be replayed
        $public = Tenancy::as($i, fn () => AccountActivationRequest::where('user_id', $admin->id)->orderByDesc('generation')->first()->public_id);
        try { app(PrincipalProvisioningService::class)->verify($i->id, $public, $oldCode); $this->fail('an old code activated again'); }
        catch (\App\Exceptions\BusinessException) { $this->assertTrue(true); }

        // a retry is refused and changes nothing; the detail no longer offers it and never shows the password again
        $hash = $admin->fresh()->password;
        $this->activate($i)->assertStatus(409);
        $this->assertSame($hash, $admin->fresh()->password);
        $detail = $this->api('GET', $this->central, "super/institutions/{$i->id}", $this->super)->json('data');
        $this->assertSame(['eligible' => false, 'reason' => 'already_active'], $detail['direct_activation']);
        $this->assertArrayNotHasKey('credentials', $detail);
        // the Super Admin can still suspend and re-activate it like any other institution
        $this->api('PATCH', $this->central, "super/institutions/{$i->id}/toggle", $this->super)->assertOk()->assertJsonPath('data.status', 'suspended');
        $this->api('PATCH', $this->central, "super/institutions/{$i->id}/toggle", $this->super)->assertOk()->assertJsonPath('data.status', 'active');
    }

    public function test_ineligible_accounts_are_refused_unchanged(): void
    {
        $cases = [
            'not_super_admin_created' => $this->legacyPending('public-pending', 'public', 'pending'),
            'not_approved' => $this->legacyPending('rejected-one', 'super_admin', 'rejected'),
        ];
        $previously = $this->legacyPending('was-active');
        $this->admin($previously)->forceFill(['last_login_at' => now()->subDay()])->save();   // active once, then deactivated
        $cases['previously_active'] = $previously;
        $audited = $this->legacyPending('was-active-2');
        Tenancy::as($audited, fn () => AuditLog::create(['institution_id' => $audited->id, 'user_id' => $this->super->id, 'action' => 'institution.suspended', 'model' => 'Institution', 'model_id' => $audited->id]));
        $cases['previously_active '] = $audited;

        foreach ($cases as $reason => $i) {
            $before = [$i->fresh()->status, $this->admin($i)->is_active, $this->admin($i)->password];
            $this->assertSame(['eligible' => false, 'reason' => trim($reason)], $this->api('GET', $this->central, "super/institutions/{$i->id}", $this->super)->json('data.direct_activation'), $reason);
            $this->activate($i)->assertStatus(409);
            $this->assertSame($before, [$i->fresh()->status, $this->admin($i)->is_active, $this->admin($i)->password], "{$reason}: nothing changed");
        }
        // D170 (1): the public path still needs contact proof and an explicit review
        $public = $cases['not_super_admin_created'];
        $this->assertSame(['inactive', false], [$public->fresh()->status, (bool) $this->admin($public)->is_active]);
    }

    public function test_only_an_active_super_admin_on_the_central_host_may_call_it(): void
    {
        $i = $this->legacyPending('guarded');
        $other = $this->makeInstitution('someone-else', 'school');
        $this->activate($i, $this->makeUser($other, 'admin'))->assertForbidden();
        $this->activate($i, $this->makeUser($other, 'accountant'))->assertForbidden();
        $this->activate($i, null, $this->hostOf($other))->assertNotFound();
        $this->super->forceFill(['is_active' => false])->save();
        $this->app['auth']->forgetGuards();
        $this->assertContains($this->activate($i, $this->super->fresh())->status(), [401, 403]);
        $this->assertSame('inactive', $i->fresh()->status);
    }

    public function test_after_activation_the_admin_keeps_only_its_existing_rights(): void
    {
        $i = $this->legacyPending('rights-check');
        $temporary = $this->activate($i)->assertOk()->json('data.credentials.temporary_password');
        $admin = $this->admin($i);
        $this->app['auth']->forgetGuards();
        $this->api('GET', $this->hostOf($i), 'students', $admin->fresh())->assertStatus(403)->assertJsonPath('error', 'must_change_password');
        $this->api('PATCH', $this->hostOf($i), 'auth/change-password', $admin->fresh(), ['current_password' => $temporary,
            'password' => 'Strong-own-pass-42', 'password_confirmation' => 'Strong-own-pass-42'])->assertOk();
        $this->api('GET', $this->hostOf($i), 'students', $admin->fresh())->assertOk();                     // its own role's work
        $this->api('GET', $this->central, 'super/institutions', $admin->fresh())->assertForbidden();         // no platform power
        $other = $this->makeInstitution('foreign-school', 'school');
        $this->api('GET', $this->hostOf($other), 'students', $admin->fresh())->assertStatus(403);            // no other tenant
        $i->forceFill(['enabled_modules' => array_replace($i->enabled_modules ?? [], ['students' => false])])->save();
        $this->api('GET', $this->hostOf($i), 'students', $admin->fresh())->assertForbidden();                 // a module off stays off
    }
}
