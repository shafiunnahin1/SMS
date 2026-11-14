<?php

namespace App\Services\Risk;

use App\Models\Institution;
use App\Support\Tenancy;

// D216 RISK.1 (docs/modules/risk-alerts.md section 1): the rules - pure functions of the measured values and the thresholds
// (`settings.risk`, defaults below). Rule-based, not ML; every result carries its "why".
class RiskRules
{
    public const DEFAULTS = ['window_days' => 30, 'attendance_watch' => 75, 'attendance_high' => 60, 'consecutive_absent_high' => 3,
        'marks_drop_watch' => 15, 'marks_drop_high' => 25, 'dues_watch' => 2, 'dues_high' => 3, 'notify_parents' => false];

    public function thresholds(?Institution $i = null): array
    {
        $s = data_get(($i ?? Tenancy::current())->settings ?? [], 'risk', []);
        $t = [];
        foreach (self::DEFAULTS as $k => $d) $t[$k] = is_bool($d) ? (bool) ($s[$k] ?? $d) : (is_numeric($s[$k] ?? null) ? $s[$k] + 0 : $d);
        return $t;
    }

    /**
     * $m = ['present' => int, 'working' => int, 'consecutive_absent' => int, 'previous_avg' => ?float, 'latest' => ?float, 'months_due' => int]
     * @return array<string, array{level: string, score: float, details: array}>  kind => flag (only the kinds that are flagged)
     */
    public function evaluate(array $m, array $t): array
    {
        $flags = [];

        if (($m['working'] ?? 0) > 0) {
            $pct = round($m['present'] / $m['working'] * 100, 2);
            $level = $pct < $t['attendance_high'] ? 'high' : ($pct < $t['attendance_watch'] ? 'watch' : null);
            if ($level) $flags['attendance'] = ['level' => $level, 'score' => $pct, 'details' => ['attendance_pct' => $pct, 'window_days' => $t['window_days'], 'present' => $m['present'],
                'working' => $m['working'], 'watch_below' => $t['attendance_watch'], 'high_below' => $t['attendance_high']]];
        }
        if (($m['consecutive_absent'] ?? 0) >= $t['consecutive_absent_high']) {
            $base = $flags['attendance'] ?? ['score' => 0.0, 'details' => []];
            $flags['attendance'] = ['level' => 'high', 'score' => $base['score'],
                'details' => $base['details'] + ['consecutive_absent' => $m['consecutive_absent'], 'consecutive_absent_high' => $t['consecutive_absent_high']]];
        }

        if (($m['previous_avg'] ?? null) !== null && ($m['latest'] ?? null) !== null) {
            $drop = round($m['previous_avg'] - $m['latest'], 2);
            $level = $drop >= $t['marks_drop_high'] ? 'high' : ($drop >= $t['marks_drop_watch'] ? 'watch' : null);
            if ($level) $flags['marks_drop'] = ['level' => $level, 'score' => $drop, 'details' => ['previous_avg' => round($m['previous_avg'], 2), 'latest' => round($m['latest'], 2), 'drop' => $drop,
                'watch_from' => $t['marks_drop_watch'], 'high_from' => $t['marks_drop_high']]];
        }

        $months = (int) ($m['months_due'] ?? 0);
        $level = $months >= $t['dues_high'] ? 'high' : ($months >= $t['dues_watch'] ? 'watch' : null);
        if ($level) $flags['dues'] = ['level' => $level, 'score' => (float) $months, 'details' => ['months_due' => $months, 'watch_from' => $t['dues_watch'], 'high_from' => $t['dues_high']]];

        if ($flags) {
            $anyHigh = collect($flags)->contains(fn ($f) => $f['level'] === 'high');
            $flags['combined'] = ['level' => (count($flags) >= 2 || $anyHigh) ? 'high' : 'watch', 'score' => (float) count($flags),
                'details' => ['flags' => collect($flags)->map(fn ($f) => $f['level'])->all()]];
        }
        return $flags;
    }
}
