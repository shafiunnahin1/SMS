<?php

namespace Tests\Feature\Billing;

use App\Models\{InstitutionModuleSubscription, ModulePrice, User};
use App\Services\Billing\ModuleEntitlementService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D187 SUB.1: a paid module is on a 30-day trial, then 7 days of grace, then read-only (reads pass, writes 402 module_read_only,
// nothing deleted); the foundation is always free; a Super Admin override comes first; a paid period restores writes; prices are
// append-only and start at 0.
class ModuleSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private function expensePayload(): array
    {
        return ['category' => 'office', 'title' => 'Stationery', 'amount' => '10.10', 'expense_date' => now()->toDateString()];
    }

    public function test_trial_grace_read_only_and_paid_restore(): void
    {
        $i = $this->makeInstitution('sub-school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);

        $this->api('POST', $host, 'expenses', $admin, $this->expensePayload())->assertCreated();
        $row = Tenancy::as($i, fn () => InstitutionModuleSubscription::where('module_key', 'expenses')->firstOrFail());
        $this->assertSame('trial', $row->status);
        $this->assertEqualsWithDelta(30, now()->diffInDays($row->trial_ends_at), 1);

        $this->travel(33)->days();                                         // grace: still full
        $this->assertSame('grace', app(ModuleEntitlementService::class)->state($i, 'expenses'));
        $this->api('POST', $host, 'expenses', $admin, $this->expensePayload())->assertCreated();

        $this->travel(5)->days();                                          // past 30 + 7: read-only
        $this->api('GET', $host, 'expenses', $admin)->assertOk()->assertJsonCount(2, 'data');
        $this->api('POST', $host, 'expenses', $admin, $this->expensePayload())->assertStatus(402)
            ->assertJsonPath('error', 'module_read_only')->assertJsonPath('module', 'expenses');
        $this->api('GET', $host, 'students', $admin)->assertOk();          // the foundation stays free

        $this->artisan('subscriptions:refresh')->assertSuccessful();
        $this->assertSame('read_only', Tenancy::as($i, fn () => $row->fresh()->status));

        Tenancy::as($i, fn () => $row->fresh()->update(['billing_cycle' => 'monthly', 'current_period_end' => now()->addMonth()]));
        $this->api('POST', $host, 'expenses', $admin, $this->expensePayload())->assertCreated();
        $this->artisan('subscriptions:refresh')->assertSuccessful();
        $this->assertSame('active', Tenancy::as($i, fn () => $row->fresh()->status));
    }

    public function test_override_cancel_and_exempt_types(): void
    {
        $i = $this->makeInstitution('sub-override');
        $admin = $this->makeUser($i, 'admin');
        $svc = app(ModuleEntitlementService::class);
        Tenancy::as($i, fn () => $svc->subscription($i, 'expenses')->update(['trial_ends_at' => now()->subDays(10)]));
        $this->assertSame('read_only', $svc->state($i, 'expenses'));

        $i->update(['enabled_modules' => ['expenses' => true]]);           // D6: the Super Admin override comes first
        $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->expensePayload())->assertCreated();

        $i->update(['enabled_modules' => null]);
        Tenancy::as($i, fn () => $svc->subscription($i, 'expenses')->update(['current_period_end' => now()->subDay(), 'cancel_at_period_end' => true]));
        $this->assertSame('read_only', $svc->state($i->fresh(), 'expenses'));   // removed: no grace

        $this->assertSame('free', $svc->state($i, 'students'));
        $this->assertSame('free', $svc->state($i, 'sms'));
        $learners = $this->makeInstitution('sub-learners', 'learners');
        $this->assertSame([], $svc->all($learners));
        $this->assertSame(0, InstitutionModuleSubscription::forInstitution($learners->id)->count());
    }

    public function test_super_admin_prices_are_append_only_and_start_at_zero(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $sa = User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000019', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $rows = collect($this->api('GET', $central, 'super/module-prices', $sa)->assertOk()->json('data'))->keyBy('module_key');
        $this->assertSame('0.00', $rows['expenses']['monthly_price']);
        $this->assertArrayNotHasKey('students', $rows->all());

        $this->api('POST', $central, 'super/module-prices', $sa, ['module_key' => 'students', 'monthly_price' => '10', 'yearly_price' => '100'])->assertStatus(422);
        $this->api('POST', $central, 'super/module-prices', $sa, ['module_key' => 'expenses', 'monthly_price' => '-1', 'yearly_price' => '0'])->assertStatus(422);
        $this->api('POST', $central, 'super/module-prices', $sa, ['module_key' => 'expenses', 'monthly_price' => '150.50', 'yearly_price' => '1500'])->assertCreated();
        $this->travel(1)->seconds();
        $this->api('POST', $central, 'super/module-prices', $sa, ['module_key' => 'expenses', 'monthly_price' => '200', 'yearly_price' => '2000'])->assertCreated();
        $rows = collect($this->api('GET', $central, 'super/module-prices', $sa)->json('data'))->keyBy('module_key');
        $this->assertSame('200.00', $rows['expenses']['monthly_price']);
        $this->assertSame('2000.00', $rows['expenses']['yearly_price']);
        $this->assertSame(2, ModulePrice::where('module_key', 'expenses')->count());

        $i = $this->makeInstitution('sub-tenant');
        $this->api('GET', $this->hostOf($i), 'super/module-prices', $this->makeUser($i, 'admin'))->assertStatus(404);
    }

    public function test_super_admin_status_counts_each_institution_without_creating_rows(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $sa = User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000039', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $a = $this->makeInstitution('status-a');
        $b = $this->makeInstitution('status-b', 'coaching');
        $this->makeInstitution('status-l', 'learners');
        $svc = app(ModuleEntitlementService::class);
        $svc->all($a);
        Tenancy::as($a, fn () => $svc->subscription($a, 'expenses')->update(['trial_ends_at' => now()->subDays(10)]));
        $rows = collect($this->api('GET', $central, 'super/subscriptions', $sa)->assertOk()->json('data'))->keyBy('id');
        $this->assertSame([$a->id, $b->id], $rows->keys()->sort()->values()->all());   // the learners type is exempt
        $this->assertSame(1, $rows[$a->id]['counts']['read_only']);
        $this->assertSame(0, array_sum($rows[$b->id]['counts']));
        $this->assertSame(0, InstitutionModuleSubscription::forInstitution($b->id)->count());
        $this->assertSame([$a->id], collect($this->api('GET', $central, 'super/subscriptions?state=read_only', $sa)->json('data'))->pluck('id')->all());
    }
}
