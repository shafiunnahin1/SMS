<?php

namespace Tests\Unit;

use App\Services\Hr\PayrollCalculator;
use PHPUnit\Framework\TestCase;

// docs/modules/staff-payroll.md §17: joining, leaving and a structure change in the same month; 28/29/30/31-day months.
// Proration is always on calendar days (§7.3 step 2); expected values follow infra/spec-verify/payroll_ref.py.
class PayrollProrationTest extends TestCase
{
    private function structure(string $from, ?string $to, string $basic): array
    {
        return ['effective_from' => $from, 'effective_to' => $to, 'basic' => $basic, 'lines' => [
            ['code' => 'house_rent', 'mode' => 'percent_basic', 'value' => '40', 'type' => 'earning'],
            ['code' => 'medical', 'mode' => 'fixed', 'value' => '1500.00', 'type' => 'earning'],
            ['code' => 'transport', 'mode' => 'fixed', 'value' => '1000.00', 'type' => 'earning'],
        ]];
    }

    public function test_join_change_and_leave_in_one_month(): void
    {
        // September (30 days): join 6th, raise from 16th, leave 25th -> 10 days at 30,500 + 10 days at 33,300 (values from payroll_ref.py)
        $r = (new PayrollCalculator())->compute(['month' => '2026-09', 'join' => '2026-09-06', 'leave' => '2026-09-25', 'structures' => [
            $this->structure('2026-09-06', '2026-09-15', '20000.00'), $this->structure('2026-09-16', null, '22000.00')]]);
        $this->assertSame(['14000.00', '21266.67'], [$r['basic'], $r['gross']]);
        $this->assertSame(['14000.00', '5600.00', '1000.00', '666.67'], [$r['earnings']['basic'], $r['earnings']['house_rent'], $r['earnings']['medical'], $r['earnings']['transport']]);
    }

    public function test_every_month_length_prorates_on_its_own_calendar_days(): void
    {
        $calc = new PayrollCalculator();
        foreach (['2026-02' => [28, '10892.86'], '2028-02' => [29, '10517.24'], '2026-09' => [30, '10166.67'], '2026-10' => [31, '9838.71']] as $month => [$days, $gross]) {
            $r = $calc->compute(['month' => $month, 'leave' => $month.'-10', 'structures' => [$this->structure('2020-01-01', null, '20000.00')]]);
            $this->assertSame([$days, $gross], [$r['days_in_month'], $r['gross']], $month);
            $full = $calc->compute(['month' => $month, 'structures' => [$this->structure('2020-01-01', null, '20000.00')]]);
            $this->assertSame('30500.00', $full['gross'], 'a full month is never prorated: '.$month);
        }
    }

    public function test_a_payee_outside_the_month_earns_nothing(): void
    {
        $r = (new PayrollCalculator())->compute(['month' => '2026-09', 'join' => '2026-10-01', 'structures' => [$this->structure('2020-01-01', null, '20000.00')]]);
        $this->assertSame(['0.00', '0.00'], [$r['gross'], $r['net']]);
    }
}
