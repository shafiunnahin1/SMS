<?php

namespace App\Services\Hr;

use App\Support\Money;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Pure payroll arithmetic (docs/modules/staff-payroll.md §7.3, §3.3, §4.1; reference infra/spec-verify/payroll_ref.py).
 * Integer paisa throughout, every result rounded half up once at the same point as the reference. No database access,
 * no writes: run generation, persistence and settlement call this with server-owned inputs.
 */
class PayrollCalculator
{
    /**
     * @param array $in month 'YYYY-MM'; structures [{effective_from, effective_to|null, basic, lines:[{code, mode fixed|percent_basic, value, type earning|deduction}]}];
     *                  optional join/leave dates, absent_days/lwp_days (decimal strings), late_count, lates_per_day, deduction_base gross|basic,
     *                  basis calendar|fixed_30|working, working_days, adjustments [{code, direction earning|deduction, amount}], advance_installment,
     *                  min_net, pf_percent
     */
    public function compute(array $in): array
    {
        [$start, $end, $days] = $this->month($in['month'] ?? '');
        $from = isset($in['join']) ? max($start, CarbonImmutable::parse($in['join'])) : $start;
        $to = isset($in['leave']) ? min($end, CarbonImmutable::parse($in['leave'])) : $end;

        // §7.3 step 2: component x (segment days / month days), summed over segments before one rounding (reference prorate_segments)
        $earn = []; $ded = []; $basicSum = 0; $grossSum = 0;
        foreach ($in['structures'] ?? [] as $s) {
            $sFrom = max($from, CarbonImmutable::parse($s['effective_from']));
            $sTo = min($to, isset($s['effective_to']) ? CarbonImmutable::parse($s['effective_to']) : $to);
            if ($sFrom > $sTo) continue;
            $segment = $sFrom->diffInDays($sTo) + 1;
            $basic = Money::toPaisa($s['basic']); $gross = $basic;
            $earn['basic'] = ($earn['basic'] ?? 0) + $basic * $segment; $basicSum += $basic * $segment;
            foreach ($s['lines'] ?? [] as $line) {
                $amount = $this->lineAmount($basic, $line);
                if ($line['type'] === 'earning') { $earn[$line['code']] = ($earn[$line['code']] ?? 0) + $amount * $segment; $gross += $amount; }
                else $ded[$line['code']] = ($ded[$line['code']] ?? 0) + $amount * $segment;
            }
            $grossSum += $gross * $segment;
        }
        $earn = array_map(fn ($v) => Money::ratio($v, 1, $days), $earn);
        $ded = array_map(fn ($v) => Money::ratio($v, 1, $days), $ded);
        $basicTotal = Money::ratio($basicSum, 1, $days); $grossTotal = Money::ratio($grossSum, 1, $days);

        // step 4: unpaid days x (base / basis days); late days are whole-day integer division, 0 = off
        $basisDays = match ($in['basis'] ?? 'calendar') { 'calendar' => $days, 'fixed_30' => 30, 'working' => (int) ($in['working_days'] ?? $days),
            default => throw new InvalidArgumentException('basis') };
        if ($basisDays < 1) throw new InvalidArgumentException('basis_days');
        $base = ($in['deduction_base'] ?? 'gross') === 'basic' ? $basicTotal : $grossTotal;
        $lateDays = ($in['lates_per_day'] ?? 0) > 0 ? intdiv((int) ($in['late_count'] ?? 0), (int) $in['lates_per_day']) : 0;
        $unpaidHundredths = $this->hundredths($in['absent_days'] ?? '0') + $this->hundredths($in['lwp_days'] ?? '0') + $lateDays * 100;
        $absence = Money::ratio($base, $unpaidHundredths, $basisDays * 100);
        if ($absence) $ded['absence'] = $absence;

        // step 5: approved adjustments as lines
        foreach ($in['adjustments'] ?? [] as $a) {
            if (!in_array($a['direction'] ?? null, ['earning', 'deduction'], true)) throw new InvalidArgumentException('adjustment direction');
            if ($a['direction'] === 'earning') $earn[$a['code']] = ($earn[$a['code']] ?? 0) + Money::toPaisa($a['amount']);
            else $ded[$a['code']] = ($ded[$a['code']] ?? 0) + Money::toPaisa($a['amount']);
        }
        // step 6: employee PF share on basic
        if (($pf = $this->hundredths($in['pf_percent'] ?? '0')) > 0) $ded['pf_employee'] = Money::ratio($basicTotal, $pf, 10000);

        // step 7: advance installment never pushes net below min_net
        $totalEarnings = array_sum($earn); $netBefore = $totalEarnings - array_sum($ded);
        $capacity = max(0, $netBefore - Money::toPaisa($in['min_net'] ?? '0'));
        $recovered = min(Money::toPaisa($in['advance_installment'] ?? '0'), $capacity);
        if ($recovered) $ded['advance_recovery'] = $recovered;
        $totalDeductions = array_sum($ded);

        $fmt = fn (array $lines) => array_map(fn ($v) => Money::format($v), $lines);
        return ['basic' => Money::format($basicTotal), 'gross' => Money::format($grossTotal), 'earnings' => $fmt($earn), 'deductions' => $fmt($ded),
            'total_earnings' => Money::format($totalEarnings), 'total_deductions' => Money::format($totalDeductions),
            'net' => Money::format($totalEarnings - $totalDeductions), 'days_in_month' => $days,
            'unpaid_days' => Money::format($unpaidHundredths), 'per_day' => Money::format(Money::ratio($base, 1, $basisDays)),
            'recovered' => Money::format($recovered)];
    }

    /** §3.3 arrears: per already-paid month (new - old) x days at the new structure / month days, rounded per month */
    public function arrears(string $oldGross, string $newGross, string $effectiveFrom, array $paidMonths): string
    {
        $diff = Money::toPaisa($newGross) - Money::toPaisa($oldGross); $from = CarbonImmutable::parse($effectiveFrom); $total = 0;
        foreach ($paidMonths as $month) {
            [$start, $end, $days] = $this->month($month);
            if ($from > $end) continue;
            $total += Money::ratio($diff, max($start, $from)->diffInDays($end) + 1, $days);
        }
        return Money::format($total);
    }

    /** §4.1 bonus: basis x percent, prorated below prorate_below service months, capped; below min service = 0 */
    public function bonus(string $basis, string $percent, int $serviceMonths, int $prorateBelow = 12, int $minService = 0, ?string $cap = null): string
    {
        if ($serviceMonths < $minService) return '0.00';
        $prorate = $prorateBelow > 0 && $serviceMonths < $prorateBelow;
        $amount = Money::ratio(Money::toPaisa($basis), $this->hundredths($percent) * ($prorate ? $serviceMonths : 1), 10000 * ($prorate ? $prorateBelow : 1));
        if ($cap !== null) $amount = min($amount, Money::toPaisa($cap));
        return Money::format($amount);
    }

    private function lineAmount(int $basic, array $line): int
    {
        if (!in_array($line['type'] ?? null, ['earning', 'deduction'], true)) throw new InvalidArgumentException('line type');
        return match ($line['mode'] ?? null) {
            'fixed' => Money::toPaisa($line['value']),
            'percent_basic' => Money::ratio($basic, $this->hundredths($line['value']), 10000),
            default => throw new InvalidArgumentException('line mode'),
        };
    }

    private function hundredths(string|int $value): int
    {
        $paisa = Money::toPaisa((string) $value);
        if ($paisa < 0) throw new InvalidArgumentException('negative');
        return $paisa;
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: int} */
    private function month(string $month): array
    {
        if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/D', $month)) throw new InvalidArgumentException('month');
        $start = CarbonImmutable::createFromFormat('!Y-m-d', $month.'-01');
        return [$start, $start->endOfMonth()->startOfDay(), $start->daysInMonth];
    }
}
