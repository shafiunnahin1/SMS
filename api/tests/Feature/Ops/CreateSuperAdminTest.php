<?php

namespace Tests\Feature\Ops;

use App\Models\{AuditLog, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

// D196 OPS.1: platform:create-super-admin - a hidden, confirmed, policy-checked password; a duplicate phone is refused; --force only
// updates that account; nothing secret in the audit row.
class CreateSuperAdminTest extends TestCase
{
    use RefreshDatabase;

    private const PASS = 'Strong-pass-2026x';

    public function test_creates_refuses_and_updates(): void
    {
        $this->artisan('platform:create-super-admin', ['--name' => 'Owner', '--phone' => '01711223344'])
            ->expectsQuestion('Password (12+ characters, letters and numbers)', self::PASS)->expectsQuestion('Password again', self::PASS)
            ->assertSuccessful();
        $u = User::platform()->where('phone', '01711223344')->firstOrFail();
        $this->assertSame(['super_admin', null, true], [$u->role, $u->institution_id, (bool) $u->is_active]);
        $this->assertFalse((bool) $u->must_change_password);
        $this->assertTrue(Hash::check(self::PASS, $u->password));

        $row = AuditLog::anyInstitution()->where('action', 'platform.super_admin_created')->firstOrFail();
        $this->assertStringNotContainsString(self::PASS, json_encode($row->toArray()));
        $this->assertStringNotContainsString('01711223344', json_encode($row->toArray()));

        $this->artisan('platform:create-super-admin', ['--name' => 'Owner', '--phone' => '01711223344'])->assertFailed();          // exists
        $this->artisan('platform:create-super-admin', ['--name' => 'Owner 2', '--phone' => '+8801711223344', '--force' => true])
            ->expectsQuestion('Password (12+ characters, letters and numbers)', 'Another-pass-2026')->expectsQuestion('Password again', 'Another-pass-2026')
            ->assertSuccessful();
        $this->assertSame(1, User::platform()->where('role', 'super_admin')->count());
        $this->assertSame('Owner 2', $u->fresh()->name);
        $this->assertTrue(Hash::check('Another-pass-2026', $u->fresh()->password));
    }

    public function test_bad_input_creates_nothing(): void
    {
        $this->artisan('platform:create-super-admin', ['--name' => 'X', '--phone' => '123'])->assertFailed();
        $this->artisan('platform:create-super-admin', ['--name' => 'X', '--phone' => '01811223344'])
            ->expectsQuestion('Password (12+ characters, letters and numbers)', 'short1')->expectsQuestion('Password again', 'short1')->assertFailed();
        $this->artisan('platform:create-super-admin', ['--name' => 'X', '--phone' => '01811223344'])
            ->expectsQuestion('Password (12+ characters, letters and numbers)', self::PASS)->expectsQuestion('Password again', self::PASS . 'x')->assertFailed();
        $this->assertSame(0, User::platform()->where('role', 'super_admin')->count());
    }
}
