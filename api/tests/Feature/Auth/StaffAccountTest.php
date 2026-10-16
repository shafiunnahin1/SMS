<?php
namespace Tests\Feature\Auth;

use App\Exceptions\BusinessException;
use App\Models\{AccountActivationRequest, AuditLog, DepartmentDutyAssignment, Institution, InstitutionDepartment, OtpToken, StaffMember, Teacher, User};
use App\Services\Auth\{ActivationDelivery, StaffAccountService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Hash, Log, Storage};
use Tests\TestCase;

class StaffAccountTest extends TestCase
{
    use RefreshDatabase;
    private ActivationDelivery $delivery;
    protected function setUp(): void
    {
        parent::setUp();
        $this->delivery = new class extends ActivationDelivery {
            public array $messages = [];
            public function deliver(string $channel, string $contact, string $code, array $tracking): bool
            {
                $this->messages[] = compact('channel', 'contact', 'code', 'tracking'); return true;
            }
        };
        app()->instance(ActivationDelivery::class, $this->delivery);
    }
    private function tenant(string $slug = 'staff-school', string $type = 'school'): array
    {
        $i = $this->makeInstitution($slug, $type); return [$i, $this->makeUser($i, 'admin')];
    }
    private function input(string $value = '+8801712345678', string $channel = 'phone'): array
    {
        return ['name' => 'Staff display', 'contact' => compact('channel', 'value')];
    }
    private function create(Institution $i, User $admin, string $contact = '+8801712345678'): array
    {
        return $this->api('POST', $this->hostOf($i), 'admin/staff', $admin, $this->input($contact))->assertCreated()->json();
    }
    private function latest(): array { return $this->delivery->messages[array_key_last($this->delivery->messages)]; }
    private function activation(array $message): array
    {
        return ['public_id' => $message['tracking']['public_id'], 'code' => $message['code'],
            'password' => 'Private-secret-42', 'password_confirmation' => 'Private-secret-42'];
    }
    private function activate(Institution $i): void
    {
        $this->api('POST', $this->hostOf($i), 'auth/activate', null, $this->activation($this->latest()))->assertOk()
            ->assertJsonPath('data.status', 'consumed')->assertJsonMissingPath('data.token');
    }
    private function refused(callable $fn, string $code = 'activation_invalid'): void
    {
        try { $fn(); $this->fail('Operation accepted'); } catch (BusinessException $e) { $this->assertSame($code, $e->errorCode); }
    }

    public function test_four_type_staff_creation_requires_recipient_proof_and_creates_no_hr_or_grants(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            [$i, $admin] = $this->tenant('staff-'.str_replace('_', '-', $type), $type); $response = $this->create($i, $admin);
            $user = User::where('institution_id', $i->id)->where('role', 'institution_staff')->sole();
            $this->assertFalse($user->is_active); $this->assertFalse(Hash::check('Private-secret-42', $user->password));
            $this->assertSame('01712345678', $user->phone);
            foreach (['password', 'otp_token_id', 'contact_hash'] as $field) $this->assertArrayNotHasKey($field, $response['data']);
            $this->api('POST', $this->hostOf($i), 'auth/login', null, ['login' => $user->phone, 'password' => 'Private-secret-42'])->assertUnauthorized();
            $this->activate($i); $this->assertTrue($user->fresh()->is_active); $this->assertFalse($user->fresh()->must_change_password);
            $this->assertSame(0, $user->tokens()->count());
            $this->api('POST', $this->hostOf($i), 'auth/login', null, ['login' => $user->phone, 'password' => 'Private-secret-42'])->assertOk();
            foreach (['auth/me', 'auth/sessions', 'notifications'] as $path) $this->api('GET', $this->hostOf($i), $path, $user)->assertOk();
            foreach (['programs', 'batches', 'students', 'admin/dashboard', 'hr/staff'] as $path) $this->api('GET', $this->hostOf($i), $path, $user)->assertForbidden();
            Tenancy::as($i, function () { $this->assertSame([0, 0, 0, 0], [Teacher::count(), StaffMember::count(), InstitutionDepartment::count(), DepartmentDutyAssignment::count()]); });
            $this->travel(61)->seconds(); // Each type is a separate login scenario, outside the identifier/IP window.
        }
    }

    public function test_reissue_replaces_tracking_and_old_codes_cannot_be_replayed_or_change_purpose(): void
    {
        [$i, $admin] = $this->tenant(); $response = $this->create($i, $admin); $id = $response['data']['id']; $old = $this->latest();
        $this->api('POST', $this->hostOf($i), "admin/staff/$id/activation", $admin)->assertStatus(202)->assertJsonMissingPath('data');
        $current = $this->latest(); $this->assertSame(2, $current['tracking']['generation']);
        $this->api('POST', $this->hostOf($i), 'auth/activate', null, $this->activation($old))->assertStatus(422);
        $this->activate($i);
        $this->api('POST', $this->hostOf($i), 'auth/activate', null, $this->activation($current))->assertStatus(422);
        $this->api('POST', 'admin.schoolapp.com', 'public/institutions/'.$i->id.'/verify', null,
            ['public_id' => $current['tracking']['public_id'], 'code' => $current['code']])->assertStatus(422);
    }

    public function test_deactivation_revokes_sessions_and_invites_until_explicit_principal_reauthorization(): void
    {
        [$i, $admin] = $this->tenant(); $response = $this->create($i, $admin); $id = $response['data']['id']; $old = $this->latest();
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['is_active' => false])->assertOk();
        $this->api('POST', $this->hostOf($i), 'auth/activate', null, $this->activation($old))->assertStatus(422);
        $this->api('POST', $this->hostOf($i), "admin/staff/$id/activation", $admin)->assertStatus(409);
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['is_active' => true])->assertOk()->assertJsonPath('data.is_active', false);
        $this->activate($i); $user = User::findOrFail($id); $user->createToken('fixture');
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['is_active' => false])->assertOk();
        $this->assertSame(0, $user->tokens()->count()); $this->assertFalse($user->fresh()->is_active);
        $this->api('POST', $this->hostOf($i), 'auth/forgot-password', null, ['login' => $user->phone])->assertOk();
        $this->assertFalse($user->fresh()->is_active);
    }

    public function test_contact_change_revokes_tokens_and_preserves_manual_deactivation_until_reauthorized(): void
    {
        [$i, $admin] = $this->tenant(); $id = $this->create($i, $admin)['data']['id']; $this->activate($i);
        $user = User::findOrFail($id); $user->createToken('old');
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['contact' => ['channel' => 'email', 'value' => ' New@Fixture.test ']])->assertOk()->assertJsonPath('data.is_active', false);
        $this->assertSame(0, $user->tokens()->count()); $this->assertNull($user->fresh()->phone); $this->assertSame('new@fixture.test', $user->fresh()->email);
        $message = $this->latest(); $this->assertSame('email', $message['channel']);
        $this->activate($i);
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['is_active' => false])->assertOk();
        $count = count($this->delivery->messages);
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['contact' => ['channel' => 'phone', 'value' => '01999999999']])->assertOk();
        $this->assertCount($count, $this->delivery->messages);
        $this->assertFalse($user->fresh()->is_active);
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['is_active' => true])->assertOk();
        $this->activate($i);
    }

    public function test_contact_uniqueness_is_tenant_local_and_client_sensitive_fields_are_rejected(): void
    {
        [$i, $admin] = $this->tenant(); [$b, $other] = $this->tenant('other-staff'); $this->create($i, $admin); $this->create($b, $other);
        $this->api('POST', $this->hostOf($i), 'admin/staff', $admin, $this->input('01712345678'))->assertStatus(422);
        foreach (['role' => 'admin', 'is_active' => true, 'password' => 'Creator-secret-42', 'user_id' => $admin->id, 'employee_id' => 'E1', 'duty_id' => 1] as $key => $value) {
            $this->api('POST', $this->hostOf($i), 'admin/staff', $admin, $this->input('01999999999') + [$key => $value])->assertStatus(422);
        }
        $this->assertSame(2, User::where('institution_id', $i->id)->count());
    }

    public function test_foreign_staff_and_principal_id_cannot_be_managed_and_nonprincipal_roles_are_denied(): void
    {
        [$a, $admin] = $this->tenant(); [$b, $other] = $this->tenant('foreign-staff'); $id = $this->create($b, $other)['data']['id'];
        $this->api('PUT', $this->hostOf($a), "admin/staff/$id", $admin, ['name' => 'Changed'])->assertNotFound();
        $this->api('POST', $this->hostOf($a), "admin/staff/$id/activation", $admin)->assertNotFound();
        $this->api('PUT', $this->hostOf($a), 'admin/staff/'.$admin->id, $admin, ['is_active' => false])->assertNotFound();
        foreach (['institution_staff', 'accountant', 'teacher', 'parent', 'student'] as $role) {
            $actor = $this->makeUser($a, $role);
            $this->api('GET', $this->hostOf($a), 'admin/staff', $actor)->assertForbidden();
            $this->api('POST', $this->hostOf($a), 'admin/staff', $actor, $this->input())->assertForbidden();
        }
    }

    public function test_activation_checks_tenant_current_authorizer_contact_token_owner_expiry_and_wrong_attempts(): void
    {
        [$i, $admin] = $this->tenant(); [$other] = $this->tenant('wrong-host'); $id = $this->create($i, $admin)['data']['id']; $message = $this->latest();
        $this->api('POST', $this->hostOf($other), 'auth/activate', null, $this->activation($message))->assertStatus(422);
        $this->api('POST', 'admin.schoolapp.com', 'auth/activate', null, $this->activation($message))->assertNotFound();
        $admin->update(['is_active' => false]);
        $this->api('POST', $this->hostOf($i), 'auth/activate', null, $this->activation($message))->assertStatus(422);
        $admin->update(['is_active' => true]);
        $user = User::findOrFail($id); $user->update(['phone' => '01999999999']);
        $this->api('POST', $this->hostOf($i), 'auth/activate', null, $this->activation($message))->assertStatus(422);
        $user->update(['phone' => '01712345678']);
        $this->travel(61)->seconds(); // Start a fresh HTTP quota before testing the five persistent wrong-code attempts.
        $body = $this->activation($message); $body['code'] = $message['code'] === '000000' ? '111111' : '000000';
        for ($n = 0; $n < 5; $n++) $this->api('POST', $this->hostOf($i), 'auth/activate', null, $body)->assertStatus(422);
        $this->travel(1)->minutes();
        $this->api('POST', $this->hostOf($i), 'auth/activate', null, $this->activation($message))->assertStatus(422);
        $this->assertFalse($user->fresh()->is_active);
    }

    public function test_own_profile_changes_only_display_fields_and_private_avatar_not_hr_or_other_users(): void
    {
        Storage::fake('private');
        Storage::disk('private')->buildTemporaryUrlsUsing(fn ($path, $expires) => \Illuminate\Support\Facades\URL::temporarySignedRoute('storage.private', $expires, ['path' => $path], false));
        [$i, $admin] = $this->tenant(); $id = $this->create($i, $admin)['data']['id']; $this->activate($i); $user = User::findOrFail($id);
        [$staff, $teacher] = Tenancy::as($i, function () use ($id) {
            return [StaffMember::factory()->create(['user_id' => $id, 'name' => 'HR original', 'designation' => 'Original role', 'photo' => 'institutions/hr-original.png']),
                Teacher::create(['user_id' => $id, 'employee_id' => 'HR-T1', 'designation' => 'Teacher original'])];
        });
        $staffBefore = $staff->fresh()->getAttributes(); $teacherBefore = $teacher->fresh()->getAttributes();
        $this->api('PATCH', $this->hostOf($i), 'staff/profile', $user, ['name' => 'New display'])->assertOk();
        $this->assertSame('New display', $user->fresh()->name);
        foreach (['role' => 'admin', 'is_active' => true, 'phone' => '01999999999', 'user_id' => $admin->id, 'employee_id' => 'Change', 'designation' => 'Change', 'avatar' => 'client/path.png'] as $key => $value) {
            $this->api('PATCH', $this->hostOf($i), 'staff/profile', $user, [$key => $value])->assertStatus(422);
        }
        $token = $user->createToken('upload-fixture')->plainTextToken; $this->app['auth']->forgetGuards();
        $image = UploadedFile::fake()->image('avatar.jpg', 20, 20);
        $image = UploadedFile::fake()->createWithContent('avatar.jpg', $image->get().'private-metadata-fixture');
        $response = $this->call('POST', 'http://'.$this->hostOf($i).'/api/v1/staff/profile', ['_method' => 'PATCH'], [],
            ['avatar' => $image], ['HTTP_AUTHORIZATION' => 'Bearer '.$token, 'HTTP_ACCEPT' => 'application/json']);
        $response->assertOk(); $path = $user->fresh()->avatar;
        Storage::disk('private')->assertExists($path);
        $this->assertStringStartsWith("institutions/{$i->id}/users/$id/avatar-", $path);
        $this->assertStringContainsString('signature=', $response->json('data.avatar'));
        $this->assertNotSame($path, $response->json('data.avatar'));
        $this->assertStringNotContainsString('private-metadata-fixture', Storage::disk('private')->get($path));
        $this->api('GET', $this->hostOf($i), 'auth/me', $user)->assertOk()->assertJsonPath('data.user.name', 'New display');
        $this->assertSame($staffBefore, $staff->fresh()->getAttributes()); $this->assertSame($teacherBefore, $teacher->fresh()->getAttributes());
        $this->assertSame('admin', $admin->fresh()->name);
        $url = $response->json('data.avatar');
        $this->get($url)->assertOk();
        $this->get(explode('?', $url)[0])->assertForbidden();
        $this->travel(6)->minutes();
        $this->get($url)->assertForbidden();
    }

    public function test_direct_activation_rejects_wrong_token_owner_purpose_generation_and_expiry(): void
    {
        [$i, $admin] = $this->tenant(); $first = $this->create($i, $admin); $message = $this->latest();
        $second = $this->create($i, $admin, '01999999999');
        Tenancy::as($i, function () use ($first, $second, $message) {
            $r = AccountActivationRequest::where('user_id', $first['data']['id'])->sole();
            $other = AccountActivationRequest::where('user_id', $second['data']['id'])->sole();
            $original = $r->getAttributes(); $service = app(StaffAccountService::class);
            foreach (['otp_token_id' => $other->otp_token_id, 'purpose' => 'principal_activation', 'generation' => 0,
                'expires_at' => now()->subSecond()] as $field => $value) {
                $r->update([$field => $value]);
                $this->refused(fn () => $service->activate($r->public_id, $message['code'], ['password' => 'Private-secret-42', 'password_confirmation' => 'Private-secret-42']));
                $r->update([$field => $original[$field]]);
            }
            $this->assertNull($r->fresh()->contact_verified_at);
            $this->assertFalse(User::findOrFail($first['data']['id'])->is_active);
        });
    }

    public function test_profile_is_restricted_to_the_new_identity_role_and_reissue_is_rate_limited(): void
    {
        [$i, $admin] = $this->tenant(); $id = $this->create($i, $admin)['data']['id'];
        foreach (['admin', 'teacher', 'accountant', 'parent', 'student'] as $role) {
            $actor = $role === 'admin' ? $admin : $this->makeUser($i, $role);
            $this->api('PATCH', $this->hostOf($i), 'staff/profile', $actor, ['name' => 'Changed'])->assertForbidden();
        }
        $this->api('POST', $this->hostOf($i), "admin/staff/$id/activation", $admin)->assertStatus(202);
        $this->api('POST', $this->hostOf($i), "admin/staff/$id/activation", $admin)->assertStatus(429);
        $this->api('PUT', $this->hostOf($i), "admin/staff/$id", $admin, ['is_active' => false])->assertOk();
        $this->assertFalse(User::findOrFail($id)->is_active);
    }

    public function test_direct_services_fail_closed_for_stale_roles_and_private_payloads_and_do_not_log_codes(): void
    {
        [$i, $admin] = $this->tenant(); Log::spy();
        $result = Tenancy::as($i, fn () => app(StaffAccountService::class)->create($admin, $this->input()));
        $id = $result['user']->id; $message = $this->latest();
        $admin->update(['role' => 'accountant']);
        Tenancy::as($i, fn () => $this->refused(fn () => app(StaffAccountService::class)->update($admin, $id, ['is_active' => true]), 'forbidden'));
        $admin->update(['role' => 'admin']);
        $this->delivery = new ActivationDelivery; app()->instance(ActivationDelivery::class, $this->delivery);
        Tenancy::as($i, fn () => app(StaffAccountService::class)->reissue($admin, $id));
        $this->assertFalse(User::findOrFail($id)->is_active);
        Log::shouldNotHaveReceived('info'); Log::shouldNotHaveReceived('error');
        $audit = Tenancy::as($i, fn () => AuditLog::pluck('new_data')->toJson());
        foreach ([$message['code'], '01712345678', 'Private-secret-42'] as $value) $this->assertStringNotContainsString($value, $audit);
    }

    public function test_index_is_tenant_bound_and_rollback_does_not_deliver_or_create_an_identity(): void
    {
        [$i, $admin] = $this->tenant(); [$other, $otherAdmin] = $this->tenant('index-foreign');
        $mine = $this->create($i, $admin)['data']['id']; $this->create($other, $otherAdmin);
        $this->makeUser($i, 'teacher');
        $response = $this->api('GET', $this->hostOf($i), 'admin/staff', $admin)->assertOk()->assertJsonPath('success', true);
        $this->assertSame([$mine], array_column($response->json('data'), 'id'));
        $before = count($this->delivery->messages); $users = User::where('institution_id', $i->id)->count();
        try {
            Tenancy::as($i, fn () => DB::transaction(function () use ($admin, $before) {
                app(StaffAccountService::class)->create($admin, $this->input('01999999999'));
                $this->assertCount($before, $this->delivery->messages);
                throw new \RuntimeException('rollback fixture');
            }));
        } catch (\RuntimeException $e) { $this->assertSame('rollback fixture', $e->getMessage()); }
        $this->assertCount($before, $this->delivery->messages);
        $this->assertSame($users, User::where('institution_id', $i->id)->count());
    }
}
