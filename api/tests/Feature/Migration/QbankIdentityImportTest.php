<?php

namespace Tests\Feature\Migration;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// R2.1.1 / D111 (1)(2)(5): the qbank identity import, on a generated fixture only. Dry run writes nothing; roles map as D111 says;
// duplicates, unverified emails, taken emails and qbank super-admins go to review; apply creates only platform accounts, once;
// schools are planned for D90 provisioning, never created here.
class QbankIdentityImportTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): string { return __DIR__.'/qbank-identity-export.json'; }

    public function test_dry_run_plans_roles_and_review_without_writing(): void
    {
        User::create(['institution_id' => null, 'name' => 'Existing', 'email' => 'existing@platform.test', 'role' => 'content_writer', 'password' => 'Secret@12345', 'is_active' => true]);
        $before = User::platform()->count();
        $report = sys_get_temp_dir().'/qbank-plan-'.uniqid().'.json';
        $this->artisan('qbank:import-identities', ['file' => $this->fixture(), '--report' => $report])->expectsOutputToContain('dry run: nothing written')->assertSuccessful();
        $this->assertSame($before, User::platform()->count());
        $plan = json_decode(file_get_contents($report), true); @unlink($report);
        $roles = collect($plan['platform_accounts'])->pluck('role', 'email')->all();
        $this->assertSame(['padmin@qbank.test' => 'content_moderator', 'mod@qbank.test' => 'content_moderator', 'writer@qbank.test' => 'content_writer'], $roles);
        $reasons = collect($plan['review'])->pluck('reason', 'email')->filter()->all();
        $this->assertSame('qbank super-admin is never created automatically', $reasons['root@qbank.test']);
        $this->assertSame('email not verified in qbank', $reasons['late@qbank.test']);
        $this->assertSame('two qbank accounts share this email', $reasons['twin@qbank.test']);
        $this->assertSame('email already used by a School Management platform account', $reasons['existing@platform.test']);
        $school = collect($plan['schools'])->firstWhere('qbank_institution_id', 100);
        $this->assertSame(['head@school.test', 'admin'], [$school['admin']['email'], $school['admin']['role']]);
        $this->assertSame(['teacher@school.test'], collect($school['teachers'])->pluck('email')->all());
        $this->assertSame(2, $school['students']);
        $this->assertSame('Super Admin provisioning and approval (D90)', $school['next_step']);
        $this->assertContains('school has no reviewable owner', collect($plan['review'])->pluck('reason')->all());
        $this->assertNotContains('head@school.test', array_keys($roles), 'school members are not made platform writers');
    }

    public function test_apply_creates_only_platform_accounts_once(): void
    {
        $this->artisan('qbank:import-identities', ['file' => $this->fixture(), '--apply' => true])->expectsOutputToContain('created 4 platform accounts')->assertSuccessful();
        $mod = User::platform()->where('email', 'mod@qbank.test')->first();
        $this->assertSame(['content_moderator', true], [$mod->role, $mod->must_change_password]);
        $this->assertFalse(User::platform()->where('email', 'root@qbank.test')->exists());
        $this->assertFalse(User::platform()->where('role', 'super_admin')->where('email', 'like', '%qbank.test')->exists());
        $this->assertSame(0, \App\Models\Institution::where('slug', 'adarsha')->count(), 'no school is created by the import');
        $this->artisan('qbank:import-identities', ['file' => $this->fixture(), '--apply' => true])->expectsOutputToContain('created 0 platform accounts')->assertSuccessful();   // a re-run finds them taken: review, never a second copy
        $this->assertSame(1, User::platform()->where('email', 'mod@qbank.test')->count());
    }

    public function test_a_broken_export_is_refused(): void
    {
        $bad = sys_get_temp_dir().'/qbank-bad-'.uniqid().'.json'; file_put_contents($bad, 'not json');
        $this->artisan('qbank:import-identities', ['file' => $bad])->assertFailed(); @unlink($bad);
    }
}
