<?php

namespace Tests\Feature\CashBook;

use App\Models\{AuditLog, CashBookClosing};
use App\Support\Tenancy;

class CashBookTenancyTest extends CashBookTestCase
{
    public function test_four_types_and_cross_tenant_dates_reports_and_reopen(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            [$i, $admin] = $this->tenant('cashbook-' . $type, $type);
            $this->api('POST', $this->hostOf($i), 'cashbook/2026-10-14/close', $admin, ['opening_cash' => '0', 'counted_cash' => '0'])->assertCreated();
        }
        [$mine, $admin] = $this->tenant('mine'); [$other, $foreign] = $this->tenant('foreign');
        $this->fee($other, '876.54');
        $this->api('POST', $this->hostOf($other), 'cashbook/2026-10-14/close', $foreign, ['opening_cash' => '0', 'counted_cash' => '876.54'])->assertCreated();
        $this->api('GET', $this->hostOf($mine), 'cashbook?date=2026-10-14', $admin)->assertOk()->assertJsonPath('data.cash_in', '0.00')->assertJsonCount(0, 'data.history');
        $this->api('POST', $this->hostOf($mine), 'cashbook/2026-10-14/reopen', $admin, ['reason' => 'Foreign'])->assertNotFound();
        $this->api('POST', $this->hostOf($mine), 'cashbook/2026-10-14/close', $admin, ['opening_cash' => '0', 'counted_cash' => '0'])->assertCreated()->assertJsonPath('data.revision', 1);
        $pdf = $this->api('GET', $this->hostOf($mine), 'cashbook/2026-10-14/report.xlsx', $admin)->assertOk();
        $rows = \PhpOffice\PhpSpreadsheet\IOFactory::load($pdf->baseResponse->getFile()->getPathname())->getActiveSheet()->toArray();
        $this->assertNotContains('876.54', array_merge(...$rows));
        $this->assertSame(1, Tenancy::as($other, fn () => CashBookClosing::count()));
    }
    public function test_auth_roles_module_gate_and_audit_without_amounts(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i); $accountant = $this->makeUser($i, 'accountant');
        $this->api('GET', $host, 'cashbook')->assertUnauthorized();
        foreach (['teacher', 'parent', 'student'] as $role) $this->api('GET', $host, 'cashbook', $this->makeUser($i, $role))->assertForbidden();
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $accountant, ['opening_cash' => '0', 'counted_cash' => '0'])->assertCreated();
        $this->api('POST', $host, 'cashbook/2026-10-14/reopen', $accountant, ['reason' => 'Correction'])->assertForbidden();
        $this->api('POST', $host, 'cashbook/2026-10-14/reopen', $admin, ['reason' => 'Correction'])->assertCreated();
        Tenancy::as($i, function () {
            $audit = AuditLog::where('action', 'cashbook.reopened')->firstOrFail();
            $this->assertSame(['previous_id' => CashBookClosing::orderBy('revision')->value('id')], $audit->new_data);
        });
        $i->forceFill(['enabled_modules' => ['cashbook' => false]])->save();
        $this->api('GET', $host, 'cashbook', $admin)->assertForbidden();
    }

    public function test_approved_purge_removes_cashbook_history_only_for_target_tenant(): void
    {
        [$i, $admin] = $this->tenant(); [$other] = $this->tenant('retained');
        Tenancy::as($other, fn () => CashBookClosing::factory()->create());
        $this->api('POST', $this->hostOf($i), 'cashbook/2026-10-14/close', $admin, ['opening_cash' => '0', 'counted_cash' => '0'])->assertCreated();
        $this->api('POST', $this->hostOf($i), 'cashbook/2026-10-14/reopen', $admin, ['reason' => 'Correction'])->assertCreated();
        $i->update(['status' => 'suspended']);
        Tenancy::as($i, fn () => AuditLog::record('institution.suspended', $i)->forceFill(['created_at' => now()->subDays(31)])->save());
        $super = $this->makeUser(null, 'super_admin');
        $result = app(\App\Services\Privacy\TenantPurgeService::class)->execute($i, $super->id);
        $this->assertSame(2, $result['tables']['cash_book_closings']);
        $this->assertSame(1, Tenancy::as($other, fn () => CashBookClosing::count()));
    }
}
