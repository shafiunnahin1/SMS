<?php

namespace Tests\Unit;

use App\Services\Hr\PayrollCalculator;
use App\Support\Money;
use PHPUnit\Framework\TestCase;

// docs/modules/staff-payroll.md §16: the 17 golden fixtures, verified against infra/spec-verify/payroll_ref.py
// (Decimal, ROUND_HALF_UP). If PHP disagrees with the table, PHP is wrong.
class PayrollGoldenTest extends TestCase
{
    private PayrollCalculator $calc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calc = new PayrollCalculator();
    }

    /** basic 20,000; house_rent 40% = 8,000; medical 1,500; transport 1,000 => gross 30,500 */
    private function structure(string $from, ?string $to = null, string $basic = '20000.00'): array
    {
        return ['effective_from' => $from, 'effective_to' => $to, 'basic' => $basic, 'lines' => [
            ['code' => 'house_rent', 'mode' => 'percent_basic', 'value' => '40', 'type' => 'earning'],
            ['code' => 'medical', 'mode' => 'fixed', 'value' => '1500.00', 'type' => 'earning'],
            ['code' => 'transport', 'mode' => 'fixed', 'value' => '1000.00', 'type' => 'earning'],
        ]];
    }

    private function item(string $month, array $extra = [], ?array $structures = null): array
    {
        return $this->calc->compute(['month' => $month, 'structures' => $structures ?? [$this->structure('2020-01-01')]] + $extra);
    }

    public function test_1_full_month_without_deductions(): void
    {
        $r = $this->item('2026-10');
        $this->assertSame(['30500.00', '30500.00', '30500.00'], [$r['gross'], $r['total_earnings'], $r['net']]);
    }

    public function test_2_october_two_absent_days_on_gross_calendar(): void
    {
        $r = $this->item('2026-10', ['absent_days' => '2', 'deduction_base' => 'gross', 'basis' => 'calendar']);
        $this->assertSame(['983.87', '1967.74', '28532.26'], [$r['per_day'], $r['deductions']['absence'], $r['net']]);
    }

    public function test_3_two_absent_days_on_basic_fixed_30(): void
    {
        $this->assertSame('1333.33', $this->item('2026-10', ['absent_days' => '2', 'deduction_base' => 'basic', 'basis' => 'fixed_30'])['deductions']['absence']);
    }

    public function test_4_seven_lates_at_three_per_day_are_two_unpaid_days(): void
    {
        $this->assertSame('2.00', $this->item('2026-10', ['late_count' => 7, 'lates_per_day' => 3])['unpaid_days']);
    }

    public function test_5_mid_month_increment_from_16_september(): void
    {
        $r = $this->item('2026-09', [], [$this->structure('2020-01-01', '2026-09-15'), $this->structure('2026-09-16', null, '22000.00')]);
        $this->assertSame('31900.00', $r['gross']);
    }

    public function test_6_joining_11_september(): void
    {
        $this->assertSame('20333.33', $this->item('2026-09', ['join' => '2026-09-11'])['gross']);
    }

    public function test_7_leaving_10_september(): void
    {
        $this->assertSame('10166.67', $this->item('2026-09', ['leave' => '2026-09-10'])['gross']);
    }

    public function test_8_arrears_increment_1_august_with_august_and_september_paid(): void
    {
        $this->assertSame('5600.00', $this->calc->arrears('30500.00', '33300.00', '2026-08-01', ['2026-08', '2026-09']));
    }

    public function test_9_arrears_effective_16_august(): void
    {
        $this->assertSame('4245.16', $this->calc->arrears('30500.00', '33300.00', '2026-08-16', ['2026-08', '2026-09']));
    }

    public function test_10_bonus_prorated_for_eight_months(): void
    {
        $this->assertSame('13333.33', $this->calc->bonus('20000.00', '100', 8, 12));
    }

    public function test_11_bonus_fourteen_months_is_full(): void
    {
        $this->assertSame('20000.00', $this->calc->bonus('20000.00', '100', 14, 12));
    }

    public function test_12_bonus_below_minimum_service_is_zero(): void
    {
        $this->assertSame('0.00', $this->calc->bonus('20000.00', '100', 2, 12, 3));
    }

    public function test_13_bonus_capped(): void
    {
        $this->assertSame('15000.00', $this->calc->bonus('20000.00', '100', 14, 12, 0, '15000.00'));
    }

    public function test_14_advance_installment(): void
    {
        $r = $this->item('2026-10', ['advance_installment' => '5000.00']);
        $this->assertSame(['5000.00', '25500.00'], [$r['recovered'], $r['net']]);
    }

    public function test_15_installment_never_pushes_net_below_minimum(): void
    {
        $r = $this->item('2026-10', ['absent_days' => '28', 'advance_installment' => '5000.00', 'min_net' => '0']);
        $afterAbsence = Money::toPaisa($r['gross']) - Money::toPaisa($r['deductions']['absence']);
        $this->assertGreaterThanOrEqual(0, Money::toPaisa($r['net']));
        $this->assertLessThanOrEqual($afterAbsence, Money::toPaisa($r['recovered']));
        $this->assertSame('0.00', $this->calc->compute(['month' => '2026-10', 'structures' => [$this->structure('2020-01-01')], 'absent_days' => '31', 'advance_installment' => '5000.00'])['net']);
    }

    public function test_16_pf_ten_percent_of_basic_with_bonus(): void
    {
        $r = $this->item('2026-10', ['pf_percent' => '10', 'adjustments' => [['code' => 'bonus', 'direction' => 'earning', 'amount' => '20000.00']]]);
        $this->assertSame(['2000.00', '48500.00'], [$r['deductions']['pf_employee'], $r['net']]);
    }

    public function test_17_decrement_from_1_october_is_a_full_month_at_the_new_structure(): void
    {
        $r = $this->item('2026-10', [], [$this->structure('2020-01-01', '2026-09-30', '22000.00'), $this->structure('2026-10-01')]);
        $this->assertSame('30500.00', $r['gross']);
    }
}
