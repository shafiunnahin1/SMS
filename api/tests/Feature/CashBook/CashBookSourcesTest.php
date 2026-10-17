<?php

namespace Tests\Feature\CashBook;

use App\Models\Expense;
use App\Support\Tenancy;
use PhpOffice\PhpSpreadsheet\IOFactory;

class CashBookSourcesTest extends CashBookTestCase
{
    public function test_cash_sources_signed_reversals_methods_and_range(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $this->fee($i, '100.01'); $this->fee($i, '200', 'bkash'); $this->fee($i, '300', 'online_gateway');
        $this->fee($i, '-5.00'); $this->fee($i, '999', 'cash', '2026-10-13');
        Tenancy::as($i, function () {
            foreach ([['10.10', 'manual', 'cash'], ['-10.10', 'manual', 'cash'], ['20.20', 'manual', 'cash'],
                ['5.00', 'refund', 'cash'], ['30.30', 'payroll', 'cash'], ['400', 'manual', 'bank']] as [$amount, $source, $method]) {
                Expense::factory()->create(['amount' => $amount, 'source' => $source, 'payment_method' => $method, 'expense_date' => '2026-10-14']);
            }
        });
        $this->api('GET', $host, 'cashbook?date=2026-10-14&opening_cash=50.05', $admin)->assertOk()
            ->assertJsonPath('data.cash_in', '100.01')->assertJsonPath('data.cash_out', '55.50')->assertJsonPath('data.expected_closing', '94.56')
            ->assertJsonCount(4, 'data.methods')->assertJsonCount(1, 'data.income_categories')->assertJsonCount(1, 'data.collectors');
        $this->api('GET', $host, 'cashbook/range?from=2026-10-13&to=2026-10-14', $admin)->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.cash_in', '999.00')->assertJsonPath('data.1.cash_in', '100.01');
        $this->api('GET', $host, 'cashbook/range?from=2026-10-14&to=2026-10-13', $admin)->assertUnprocessable();
    }
    public function test_reports_include_methods_categories_collectors_status_and_history(): void
    {
        [$i, $admin] = $this->tenant(); $host = $this->hostOf($i);
        $this->fee($i, '12.34');
        Tenancy::as($i, fn () => Expense::factory()->create(['category' => '=1+1', 'amount' => '2.34', 'expense_date' => '2026-10-14']));
        $this->api('POST', $host, 'cashbook/2026-10-14/close', $admin, ['opening_cash' => '0', 'counted_cash' => '10'])->assertCreated();
        $pdf = $this->api('GET', $host, 'cashbook/2026-10-14/report.pdf', $admin)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        $xlsx = $this->api('GET', $host, 'cashbook/2026-10-14/report.xlsx', $admin)->assertOk();
        $path = $xlsx->baseResponse->getFile()->getPathname();
        $sheet = IOFactory::load($path)->getActiveSheet();
        $rows = $sheet->toArray(null, true, false, false);
        $flat = array_merge(...$rows);
        $this->assertContains('12.34', $flat); $this->assertContains('2.34', $flat); $this->assertContains('10.00', $flat);
        $this->assertContains('closed', $flat); $this->assertContains('=1+1', $flat);
        foreach ($sheet->getCoordinates() as $coordinate) if ($sheet->getCell($coordinate)->getValue() === '=1+1') $this->assertSame('s', $sheet->getCell($coordinate)->getDataType());
        $this->api('GET', $host, 'cashbook/2026-10-14/report.csv', $admin)->assertUnprocessable();
        app()->setLocale('ar');
        $rtl = \Maatwebsite\Excel\Facades\Excel::download(new \App\Exports\CashBookSheetExport(['Item'], [['10.00']]), 'rtl-cashbook.xlsx');
        $this->assertTrue(IOFactory::load($rtl->getFile()->getPathname())->getActiveSheet()->getRightToLeft());
    }
}
