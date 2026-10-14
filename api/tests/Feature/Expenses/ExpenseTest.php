<?php

namespace Tests\Feature\Expenses;

use App\Models\{AuditLog, Expense};
use App\Services\ExpenseService;
use App\Support\{Tenancy, TenantBulk};
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Tests\TestCase;

class ExpenseTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $slug = 'expense-school', string $type = 'school'): array
    {
        $institution = $this->makeInstitution($slug, $type);
        return [$institution, $this->makeUser($institution, 'admin')];
    }

    private function data(array $changes = []): array
    {
        return array_replace(['category' => 'office', 'title' => 'Stationery', 'amount' => '10.10', 'expense_date' => '2026-10-14'], $changes);
    }

    public function test_creation_correction_and_cancellation_preserve_rows_receipts_and_exact_totals(): void
    {
        Storage::fake('private');
        [$i, $admin] = $this->setupTenant();
        $created = $this->api('POST', $this->hostOf($i), 'expenses', $admin,
            $this->data(['receipt' => UploadedFile::fake()->create('receipt.pdf', 10, 'application/pdf')]))
            ->assertCreated()->assertJsonPath('data.amount', '10.10')->json('data.id');
        $old = Tenancy::as($i, fn () => Expense::findOrFail($created)->getRawOriginal());
        Storage::disk('private')->assertExists($old['receipt_path']);
        $corrected = $this->api('PUT', $this->hostOf($i), "expenses/{$created}", $admin, ['amount' => '20.20'])
            ->assertOk()->assertJsonPath('data.replaces_expense_id', $created)->assertJsonPath('data.amount', '20.20')->json('data.id');
        $this->assertSame($old, Tenancy::as($i, fn () => Expense::findOrFail($created)->getRawOriginal()));
        $this->api('GET', $this->hostOf($i), "expenses/{$created}", $admin)->assertOk()->assertJsonPath('data.is_reversed', true);
        $this->api('GET', $this->hostOf($i), 'expenses/report?month=2026-10', $admin)->assertOk()->assertJsonPath('data.total', '20.20');
        $this->api('DELETE', $this->hostOf($i), "expenses/{$corrected}", $admin)->assertOk()->assertJsonPath('data.amount', '-20.20');
        $this->api('GET', $this->hostOf($i), 'expenses/report?month=2026-10', $admin)->assertOk()->assertJsonPath('data.total', '0.00');
        $this->api('DELETE', $this->hostOf($i), "expenses/{$corrected}", $admin)->assertStatus(409);
        $this->api('PUT', $this->hostOf($i), "expenses/{$created}", $admin, ['amount' => '30.00'])->assertStatus(409);
        Storage::disk('private')->assertExists($old['receipt_path']);
        Tenancy::as($i, function () use ($created) {
            $this->assertSame(4, Expense::count());
            $this->assertSame('expense.cancelled', AuditLog::latest('id')->value('action'));
            $this->assertSame('-10.10', Expense::where('reversal_of_id', $created)->value('amount'));
        });
    }

    public function test_all_expense_types_work_and_other_tenants_rows_and_reports_do_not_leak(): void
    {
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            [$i, $admin] = $this->setupTenant('expense-' . $type, $type);
            $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data())->assertCreated();
        }
        [$i, $admin] = $this->setupTenant('mine');
        [$other, $foreignAdmin] = $this->setupTenant('foreign');
        $id = $this->api('POST', $this->hostOf($other), 'expenses', $foreignAdmin, $this->data(['title' => 'Foreign marker']))->assertCreated()->json('data.id');
        foreach (['GET', 'PUT', 'DELETE'] as $method) {
            $this->api($method, $this->hostOf($i), "expenses/{$id}", $admin, $method === 'PUT' ? ['amount' => '15.00'] : [])->assertNotFound();
        }
        $this->api('GET', $this->hostOf($i), 'expenses', $admin)->assertOk()->assertJsonCount(0, 'data');
        $this->api('GET', $this->hostOf($i), 'expenses/report?month=2026-10', $admin)->assertOk()->assertJsonPath('data.total', '0.00');
    }

    public function test_decimal_validation_and_server_owned_fields_are_enforced(): void
    {
        [$i, $admin] = $this->setupTenant();
        foreach (['0.00', '-1.00', '1.001', '100000000.00', '1e3', 1.25] as $amount) {
            $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data(['amount' => $amount]))->assertStatus(422);
        }
        foreach (['source', 'institution_id', 'added_by', 'reversal_of_id', 'replaces_expense_id', 'receipt_path'] as $field) {
            $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data([$field => '1']))->assertStatus(422);
        }
        $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data(['amount' => '0.10']))->assertCreated();
        $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data(['amount' => '0.20']))->assertCreated();
        $this->api('GET', $this->hostOf($i), 'expenses/report?month=2026-10', $admin)->assertOk()->assertJsonPath('data.total', '0.30');
        $this->api('GET', $this->hostOf($i), 'expenses/report?month=2026-09', $admin)->assertOk()->assertJsonPath('data.total', '0.00');
    }

    public function test_system_generated_and_reversal_entries_are_not_editable(): void
    {
        [$i, $admin] = $this->setupTenant();
        foreach (['payroll', 'advance', 'store', 'refund'] as $source) {
            $row = Tenancy::as($i, fn () => Expense::factory()->create(['source' => $source]));
            $this->api('PUT', $this->hostOf($i), "expenses/{$row->id}", $admin, ['amount' => '11.00'])->assertStatus(409);
            $this->api('DELETE', $this->hostOf($i), "expenses/{$row->id}", $admin)->assertStatus(409);
        }
        $id = $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data())->json('data.id');
        $reversal = $this->api('DELETE', $this->hostOf($i), "expenses/{$id}", $admin)->assertOk()->json('data.id');
        $this->api('DELETE', $this->hostOf($i), "expenses/{$reversal}", $admin)->assertStatus(409);
    }

    public function test_roles_authentication_module_gate_and_accountant_access(): void
    {
        [$i, $admin] = $this->setupTenant();
        $this->api('GET', $this->hostOf($i), 'expenses')->assertUnauthorized();
        $this->api('GET', $this->hostOf($i), 'expenses', $this->makeUser($i, 'teacher'))->assertForbidden();
        $accountant = $this->makeUser($i, 'accountant');
        $this->api('POST', $this->hostOf($i), 'expenses', $accountant, $this->data())->assertCreated();
        [$off, $offAdmin] = $this->setupTenant('disabled-expenses');
        $off->update(['enabled_modules' => ['expenses' => false]]);
        $this->api('GET', $this->hostOf($off), 'expenses', $offAdmin)->assertForbidden()->assertJsonPath('error', 'module_disabled');
    }

    public function test_filters_month_boundaries_and_pdf_excel_exports(): void
    {
        [$i, $admin] = $this->setupTenant();
        $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data(['title' => '=1+1']))->assertCreated();
        $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data(['category' => 'travel', 'expense_date' => '2026-09-30']))->assertCreated();
        $this->api('GET', $this->hostOf($i), 'expenses?category=office&from=2026-10-01&to=2026-10-31', $admin)->assertOk()->assertJsonCount(1, 'data');
        $this->api('GET', $this->hostOf($i), 'expenses?to=2026-09-30', $admin)->assertOk()->assertJsonCount(1, 'data');
        $this->api('GET', $this->hostOf($i), 'expenses?from=2026-10-01&to=2026-09-30', $admin)->assertStatus(422);
        $this->api('GET', $this->hostOf($i), 'expenses/report?month=2026-10&format=pdf', $admin)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $xlsx = $this->api('GET', $this->hostOf($i), 'expenses/report?month=2026-10&format=xlsx', $admin)->assertOk();
        $sheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($xlsx->baseResponse->getFile()->getPathname())->getActiveSheet();
        $this->assertSame('=1+1', $sheet->getCell('C2')->getValue());
        $this->assertSame(\PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING, $sheet->getCell('C2')->getDataType());
        $this->assertSame('10.10', $sheet->getCell('E3')->getValue());
    }

    public function test_composite_foreign_keys_reject_foreign_tenant_reversal_links(): void
    {
        [$i, $admin] = $this->setupTenant();
        [$other] = $this->setupTenant('other-constraint');
        $original = Tenancy::as($other, fn () => Expense::factory()->create());
        $this->expectException(QueryException::class);
        DB::table('expenses')->insert(['institution_id' => $i->id, 'category' => 'office', 'title' => 'Bad link', 'amount' => '-10.00',
            'expense_date' => '2026-10-14', 'reversal_of_id' => $original->id]);
    }

    public function test_database_uniqueness_rejects_duplicate_reversal_and_replacement_links(): void
    {
        [$i, $admin] = $this->setupTenant();
        $id = $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data())->assertCreated()->json('data.id');
        $this->api('PUT', $this->hostOf($i), "expenses/{$id}", $admin, ['amount' => '20.20'])->assertOk();
        foreach (['reversal_of_id', 'replaces_expense_id'] as $field) {
            try {
                DB::table('expenses')->insert(['institution_id' => $i->id, 'category' => 'office', 'title' => 'Duplicate link',
                    'amount' => $field === 'reversal_of_id' ? '-10.10' : '20.20', 'expense_date' => '2026-10-14', $field => $id]);
                $this->fail('Duplicate ledger link was accepted');
            } catch (QueryException $error) { $this->assertSame('23000', (string) $error->getCode()); }
        }
        $this->assertSame(3, Tenancy::as($i, fn () => Expense::count()));
    }

    public function test_failed_replacement_rolls_back_ledger_and_removes_only_the_new_receipt(): void
    {
        Storage::fake('private');
        [$i, $admin] = $this->setupTenant();
        $id = $this->api('POST', $this->hostOf($i), 'expenses', $admin,
            $this->data(['receipt' => UploadedFile::fake()->create('original.pdf', 10, 'application/pdf')]))->assertCreated()->json('data.id');
        $path = Tenancy::as($i, fn () => Expense::findOrFail($id)->receipt_path);
        try {
            Tenancy::as($i, fn () => app(ExpenseService::class)->correct($id,
                ['title' => str_repeat('x', 151), 'receipt' => UploadedFile::fake()->create('replacement.pdf', 10, 'application/pdf')], $admin->id));
            $this->fail('Oversized replacement should fail at the database boundary');
        } catch (QueryException) {
            $this->assertSame(1, Tenancy::as($i, fn () => Expense::count()));
            $this->assertFalse(Tenancy::as($i, fn () => Expense::findOrFail($id)->reversals()->exists()));
            $this->assertSame([$path], Storage::disk('private')->allFiles());
        }
        $this->api('DELETE', $this->hostOf($i), "expenses/{$id}", $admin)->assertOk();
    }

    public function test_model_updates_and_deletions_cannot_mutate_expense_history(): void
    {
        [$i] = $this->setupTenant();
        Tenancy::as($i, function () {
            $row = Expense::factory()->create();
            foreach (['update', 'delete'] as $operation) {
                try {
                    $operation === 'update' ? $row->update(['title' => 'Changed']) : $row->delete();
                    $this->fail('Expense history mutation was accepted');
                } catch (\App\Exceptions\BusinessException $error) { $this->assertSame('expense_immutable', $error->errorCode); }
            }
            $this->assertSame('Stationery', $row->fresh()->title);
        });
    }

    public function test_approved_tenant_purge_removes_linked_ledger_children_without_affecting_another_tenant(): void
    {
        [$i, $admin] = $this->setupTenant();
        [$other] = $this->setupTenant('kept-ledger');
        Tenancy::as($other, fn () => Expense::factory()->create());
        $id = $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data())->assertCreated()->json('data.id');
        $replacement = $this->api('PUT', $this->hostOf($i), "expenses/{$id}", $admin, ['amount' => '20.20'])->assertOk()->json('data.id');
        $this->api('DELETE', $this->hostOf($i), "expenses/{$replacement}", $admin)->assertOk();
        $i->update(['status' => 'suspended']);
        Tenancy::as($i, function () use ($i) {
            AuditLog::record('institution.suspended', $i)->forceFill(['created_at' => now()->subDays(31)])->save();
        });
        $super = $this->makeUser(null, 'super_admin');
        $result = app(\App\Services\Privacy\TenantPurgeService::class)->execute($i, $super->id);
        $this->assertSame(4, $result['tables']['expenses']);
        $this->assertSame(1, Tenancy::as($other, fn () => Expense::count()));
    }

    public function test_monthly_aggregate_uses_the_institution_date_index(): void
    {
        [$i] = $this->setupTenant();
        Tenancy::as($i, function () use ($i) {
            $rows = array_fill(0, 1000, ['institution_id' => $i->id, 'category' => 'office', 'title' => 'Earlier month',
                'amount' => '1.01', 'expense_date' => '2026-01-01']);
            TenantBulk::insert(Expense::class, $rows);
            Expense::factory()->create(['amount' => '7.45', 'expense_date' => '2026-10-14']);
            $plan = DB::select('EXPLAIN SELECT SUM(amount) FROM expenses WHERE institution_id = ? AND expense_date BETWEEN ? AND ?',
                [$i->id, '2026-10-01', '2026-10-31']);
            $this->assertSame('idx_expenses_inst_date', $plan[0]->key);
            $this->assertSame('7.45', app(ExpenseService::class)->report('2026-10')['total']);
        });
    }

    public function test_null_protected_fields_cannot_override_server_defaults_or_receipt_inheritance(): void
    {
        Storage::fake('private');
        [$i, $admin] = $this->setupTenant();
        $created = $this->api('POST', $this->hostOf($i), 'expenses', $admin, $this->data([
            'source' => null, 'institution_id' => null, 'reversal_of_id' => null, 'receipt_path' => null,
            'receipt' => UploadedFile::fake()->create('receipt.pdf', 10, 'application/pdf'),
        ]))->assertCreated()->assertJsonPath('data.source', 'manual')->assertJsonPath('data.added_by', $admin->id)->json('data.id');
        $receipt = Tenancy::as($i, fn () => Expense::findOrFail($created)->receipt_path);
        $replacement = $this->api('PUT', $this->hostOf($i), "expenses/{$created}", $admin,
            ['amount' => '12.20', 'source' => null, 'receipt_path' => null, 'reversal_of_id' => null])
            ->assertOk()->assertJsonPath('data.source', 'manual')->json('data.id');
        $this->assertSame($receipt, Tenancy::as($i, fn () => Expense::findOrFail($replacement)->receipt_path));
    }
}
