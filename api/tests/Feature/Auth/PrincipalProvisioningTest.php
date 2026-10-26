<?php

namespace Tests\Feature\Auth;

use App\Exceptions\BusinessException;
use App\Models\{AccountActivationRequest, AuditLog, DepartmentDutyAssignment, Institution, InstitutionDepartment, InstitutionRegistration, OtpToken, StaffMember, User};
use App\Services\Auth\{ActivationDelivery, PrincipalProvisioningService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Hash, Log};
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class PrincipalProvisioningTest extends TestCase
{
    use RefreshDatabase;

    private ActivationDelivery $delivery;

    protected function setUp(): void
    {
        parent::setUp();
        $this->delivery = new class extends ActivationDelivery {
            public array $messages = [];
            public bool $fail = false;
            public function send(string $channel, string $contact, string $code): bool
            {
                if ($this->fail) throw new \RuntimeException('transport contains private credentials');
                $this->messages[] = compact('channel', 'contact', 'code');
                return true;
            }
        };
        $this->app->instance(ActivationDelivery::class, $this->delivery);
    }

    private function service(): PrincipalProvisioningService { return app(PrincipalProvisioningService::class); }

    private function provision(string $slug = 'principal-fixture', ?User $actor = null, string $type = 'school'): array
    {
        $principal = ['name' => 'Recipient', 'contact' => ['channel' => 'phone', 'value' => '+8801712345678']];
        if (!$actor) $principal += ['password' => 'Secure-private-42', 'password_confirmation' => 'Secure-private-42'];
        return $this->service()->provision(['name' => 'Institution fixture', 'slug' => $slug, 'institution_type' => $type], $principal, $actor);
    }

    private function code(): string { return $this->delivery->messages[array_key_last($this->delivery->messages)]['code']; }
    private function user(array $state): User { return User::where('institution_id', $state['institution_id'])->where('role', 'admin')->sole(); }
    private function request(array $state): AccountActivationRequest
    {
        return Tenancy::as(Institution::findOrFail($state['institution_id']), fn () => AccountActivationRequest::where('public_id', $state['public_id'])->sole());
    }
    private function refused(callable $fn, string $code = 'activation_invalid'): void
    {
        try { $fn(); $this->fail('Operation was accepted'); }
        catch (BusinessException $e) { $this->assertSame($code, $e->errorCode); }
    }

    public function test_public_proof_waits_for_review_and_survives_code_expiry(): void
    {
        $state = $this->provision(); $user = $this->user($state); $actor = $this->makeUser(null, 'super_admin');
        $this->assertFalse($user->is_active);
        $this->assertSame('inactive', Institution::find($state['institution_id'])->status);
        $this->refused(fn () => $this->service()->review($state['institution_id'], $actor, 'approve'), 'activation_conflict');
        $verified = $this->service()->verify($state['institution_id'], $state['public_id'], $this->code());
        $this->assertSame('verified', $verified['status']);
        $this->assertFalse($user->fresh()->is_active);
        $this->travel(2)->days();
        $approved = $this->service()->review($state['institution_id'], $actor, 'approve');
        $this->assertSame('consumed', $approved['status']);
        $this->assertSame('active', Institution::find($state['institution_id'])->status);
        $this->assertTrue($user->fresh()->is_active);
        $this->assertSame($approved, $this->service()->review($state['institution_id'], $actor, 'approve'));
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $this->code()));
        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_super_admin_provisioning_activates_directly_with_a_one_time_password_in_every_type(): void
    {
        // D170 (2) amends D90 for this path only: active at once, no OTP request or token, a hashed one-time password, change at first login
        $actor = $this->makeUser(null, 'super_admin');
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $state = $this->provision('principal-'.str_replace('_', '-', $type), $actor, $type);
            $this->assertSame('activated', $state['status']);
            $temporary = $state['temporary_password'];
            $this->assertGreaterThanOrEqual(16, strlen($temporary));
            $i = Institution::findOrFail($state['institution_id']);
            $this->assertSame('active', $i->status);
            Tenancy::as($i, function () use ($actor, $temporary, $i) {
                $registration = InstitutionRegistration::sole();
                $this->assertSame(['super_admin', 'approved', $actor->id], [$registration->source, $registration->review_status, $registration->reviewed_by]);
                $user = User::findOrFail($registration->first_admin_id);
                $this->assertSame([true, true], [(bool) $user->is_active, (bool) $user->must_change_password]);
                $this->assertTrue(Hash::check($temporary, $user->password));
                $this->assertSame(0, AccountActivationRequest::count(), 'no OTP request and no fake verification');
                $this->assertSame(0, \App\Models\OtpToken::where('user_id', $user->id)->count());
                $log = AuditLog::where('institution_id', $i->id)->where('action', 'institution.activated')->sole();
                $this->assertSame('super_admin_provisioning', $log->new_data['reason']);
                $this->assertSame($actor->id, $log->user_id);
                $this->assertStringNotContainsString($temporary, json_encode(AuditLog::where('institution_id', $i->id)->get()->toArray()));
                $this->assertStringNotContainsString('01712345678', json_encode($log->new_data), 'no contact in the audit');
                $this->assertSame([0, 0, 0], [InstitutionDepartment::count(), DepartmentDutyAssignment::count(), StaffMember::count()]);
            });
        }
        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_resend_invalidates_old_generation_and_requires_current_contact_and_tracking(): void
    {
        $state = $this->provision(); $oldCode = $this->code();
        $contact = ['channel' => 'phone', 'value' => '01712345678'];
        $this->assertNull($this->service()->resend($state['institution_id'], $state['public_id'], ['channel' => 'phone', 'value' => '01999999999']));
        $this->assertNull($this->service()->resend($state['institution_id'], 'wrong-tracking', $contact));
        $next = $this->service()->resend($state['institution_id'], $state['public_id'], $contact);
        $this->assertSame(2, $next['generation']);
        $this->assertSame('cancelled', $this->request($state)->status);
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $oldCode));
        $this->assertSame('verified', $this->service()->verify($next['institution_id'], $next['public_id'], $this->code())['status']);
        $this->assertFalse($this->user($state)->is_active);
    }

    public function test_five_wrong_codes_persist_invalidation_and_correct_code_cannot_replay(): void
    {
        $state = $this->provision(); $code = $this->code();
        $wrong = $code === '000000' ? '111111' : '000000';
        for ($n = 0; $n < 5; $n++) $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $wrong));
        $this->assertNotNull(OtpToken::findOrFail($this->request($state)->otp_token_id)->used_at);
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $code));
        $this->assertFalse($this->user($state)->is_active);
    }

    public function test_expiry_stale_contact_secondary_contact_and_tenant_mismatch_fail_closed(): void
    {
        $state = $this->provision(); $code = $this->code(); $user = $this->user($state);
        $other = $this->provision('other-principal');
        $this->refused(fn () => $this->service()->verify($other['institution_id'], $state['public_id'], $code));
        $this->refused(fn () => $this->service()->verify(999999, $state['public_id'], $code));
        $user->update(['phone' => '01999999999']);
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $code));
        $user->update(['phone' => '01712345678', 'email' => 'secondary@fixture.test']);
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $code));
        $user->update(['email' => null]);
        $this->travel(6)->minutes();
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $code));
        $this->assertNull($this->request($state)->contact_verified_at);
    }

    public function test_token_owner_purpose_and_generation_binding_are_checked_beyond_foreign_key_existence(): void
    {
        $state = $this->provision(); $other = $this->provision('token-other'); $code = $this->delivery->messages[0]['code'];
        $request = $this->request($state); $tokenId = $request->otp_token_id;
        Tenancy::as(Institution::findOrFail($state['institution_id']), fn () => $request->update(['otp_token_id' => $this->request($other)->otp_token_id]));
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $code));
        foreach (['generation' => 9, 'purpose' => 'staff_activation'] as $field => $value) {
            $original = $request->getAttribute($field);
            Tenancy::as(Institution::findOrFail($state['institution_id']), fn () => $request->update(['otp_token_id' => $tokenId, $field => $value]));
            $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $code));
            Tenancy::as(Institution::findOrFail($state['institution_id']), fn () => $request->update([$field => $original]));
        }
        $this->assertFalse($this->user($state)->is_active);
    }

    public function test_only_current_active_central_super_admin_can_provision_or_review(): void
    {
        $state = $this->provision();
        $tenant = Institution::findOrFail($state['institution_id']);
        foreach ([$this->makeUser($tenant, 'admin'), $this->makeUser(null, 'content_writer'), $this->makeUser($tenant, 'super_admin')] as $actor) {
            $this->refused(fn () => $this->provision('forbidden-'.$actor->id, $actor), 'forbidden');
            $this->refused(fn () => $this->service()->review($tenant->id, $actor, 'reject', 'Private reason'), 'forbidden');
        }
        $actor = $this->makeUser(null, 'super_admin'); $actor->update(['is_active' => false]);
        $this->refused(fn () => $this->provision('inactive-actor', $actor), 'forbidden');
        $this->refused(fn () => $this->service()->review($tenant->id, $actor, 'reject', 'Private reason'), 'forbidden');
        $this->assertSame(1, Institution::count());
    }

    public function test_rejection_is_idempotent_and_blocks_resend_verification_and_approval(): void
    {
        $state = $this->provision(); $code = $this->code(); $actor = $this->makeUser(null, 'super_admin');
        $rejected = $this->service()->review($state['institution_id'], $actor, 'reject', 'Private rejection');
        $this->assertSame($rejected, $this->service()->review($state['institution_id'], $actor, 'reject', 'Private rejection'));
        $this->refused(fn () => $this->service()->review($state['institution_id'], $actor, 'approve'), 'activation_conflict');
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $code));
        $this->assertNull($this->service()->resend($state['institution_id'], $state['public_id'], ['channel' => 'phone', 'value' => '01712345678']));
        $this->assertFalse($this->user($state)->is_active);
    }

    public function test_manual_deactivation_or_contact_change_cannot_reactivate_from_old_proof(): void
    {
        $state = $this->provision(); $actor = $this->makeUser(null, 'super_admin');
        $this->service()->verify($state['institution_id'], $state['public_id'], $this->code());
        $this->user($state)->update(['phone' => '01999999999']);
        $this->refused(fn () => $this->service()->review($state['institution_id'], $actor, 'approve'), 'activation_conflict');
        $this->user($state)->update(['phone' => '01712345678']);
        $this->service()->review($state['institution_id'], $actor, 'approve');
        $this->user($state)->update(['is_active' => false]);
        $this->refused(fn () => $this->service()->review($state['institution_id'], $actor, 'approve'), 'activation_conflict');
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $this->code()));
        $this->assertNull($this->service()->resend($state['institution_id'], $state['public_id'], ['channel' => 'phone', 'value' => '01712345678']));
    }

    public function test_delivery_is_after_commit_and_outer_rollback_sends_nothing(): void
    {
        try {
            DB::transaction(function () {
                $this->provision();
                $this->assertSame([], $this->delivery->messages);
                throw new \RuntimeException('rollback fixture');
            });
        } catch (\RuntimeException $e) { $this->assertSame('rollback fixture', $e->getMessage()); }
        $this->assertSame([], $this->delivery->messages);
        $this->assertSame(0, Institution::count());
        $this->provision('committed-fixture');
        $this->assertCount(1, $this->delivery->messages);
    }

    public function test_failed_or_unconfigured_delivery_keeps_pending_and_logs_no_secret(): void
    {
        Log::spy(); $this->delivery->fail = true;
        $state = $this->provision();
        $this->assertTrue($state['delivery_pending']);
        $this->assertFalse($this->user($state)->is_active);
        $this->assertSame([], $this->delivery->messages);
        Log::shouldNotHaveReceived('info'); Log::shouldNotHaveReceived('error');
        $this->assertFalse((new ActivationDelivery)->send('phone', '01712345678', '123456'));
        $this->delivery->fail = false;
        $retry = $this->service()->resend($state['institution_id'], $state['public_id'], ['channel' => 'phone', 'value' => '01712345678']);
        $this->assertSame(2, $retry['generation']);
        $this->assertSame('verified', $this->service()->verify($retry['institution_id'], $retry['public_id'], $this->code())['status']);
    }

    public function test_service_allowlists_password_ownership_and_private_serialization(): void
    {
        $state = $this->provision();
        $this->assertSame(['institution_id', 'public_id', 'generation', 'status', 'delivery_pending'], array_keys($state));
        $request = $this->request($state); $token = OtpToken::findOrFail($request->otp_token_id);
        $this->assertNotSame($this->code(), $token->otp);
        $this->assertSame(64, strlen($token->otp));
        $this->assertArrayNotHasKey('contact_hash', $request->toArray());
        $this->assertArrayNotHasKey('otp_token_id', $request->toArray());
        $actor = $this->makeUser(null, 'super_admin');
        $this->refused(fn () => $this->service()->provision(['name' => 'X', 'slug' => 'no-status', 'institution_type' => 'school', 'status' => 'active'], []));
        $this->refused(fn () => $this->service()->provision(['name' => 'X', 'slug' => 'no-password', 'institution_type' => 'school'], ['name' => 'P', 'contact' => ['channel' => 'email', 'value' => 'x@fixture.test'], 'password' => 'Creator-chosen-42'], $actor));
        $this->refused(fn () => $this->service()->verify($state['institution_id'], $state['public_id'], $this->code(), ['password' => 'Replacement-42']));
        $this->service()->review($state['institution_id'], $actor, 'reject', 'Private reason');
        $audit = Tenancy::as(Institution::findOrFail($state['institution_id']), fn () => AuditLog::pluck('new_data')->toJson());
        foreach ([$this->code(), '01712345678', 'Private reason', 'Secure-private-42', $request->contact_hash] as $private) $this->assertStringNotContainsString($private, $audit);
    }

    public function test_email_normalization_and_exactly_one_contact_are_service_enforced(): void
    {
        $institution = ['name' => 'Email fixture', 'slug' => 'email-principal', 'institution_type' => 'college'];
        $principal = ['name' => 'Email owner', 'contact' => ['channel' => 'email', 'value' => '  Owner@Fixture.test  '],
            'password' => 'Personal-secret-42', 'password_confirmation' => 'Personal-secret-42'];
        $state = $this->service()->provision($institution, $principal);
        $this->assertSame(['owner@fixture.test', null], [$this->user($state)->email, $this->user($state)->phone]);
        $this->assertSame('email', $this->delivery->messages[0]['channel']);
        $this->assertSame('verified', $this->service()->verify($state['institution_id'], $state['public_id'], $this->code())['status']);
        $principal['contact']['phone'] = '01712345678';
        $this->refused(fn () => $this->service()->provision(array_replace($institution, ['slug' => 'extra-contact']), $principal));
        $this->refused(fn () => $this->service()->review(999999, $this->makeUser(null, 'super_admin'), 'approve'), 'activation_conflict');
        $this->assertSame(1, Institution::count());
    }
}
