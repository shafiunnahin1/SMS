<?php

namespace App\Support;

// G9: money is never a float. Amounts travel as decimal strings ("1200.50", as the decimal:2 casts give them) and are
// computed in integer paisa, so 0.1 + 0.2 problems cannot happen. Rounding: half up.
final class Money
{
    public static function toPaisa(string|int|null $amount): int
    {
        if ($amount === null || $amount === '') return 0;
        $s = trim((string) $amount);
        $neg = str_starts_with($s, '-');
        $s = ltrim($s, '+-');
        if (!preg_match('/^\d+(\.\d+)?$/', $s)) throw new \InvalidArgumentException("Not an amount: {$amount}");
        [$whole, $frac] = array_pad(explode('.', $s, 2), 2, '');
        $paisa = (int) $whole * 100 + (int) str_pad(substr($frac, 0, 2), 2, '0');
        if (strlen($frac) > 2 && (int) $frac[2] >= 5) $paisa++;              // half up on the third decimal
        return $neg ? -$paisa : $paisa;
    }

    public static function format(int $paisa): string
    {
        $sign = $paisa < 0 ? '-' : '';
        $p = abs($paisa);
        return $sign . intdiv($p, 100) . '.' . str_pad((string) ($p % 100), 2, '0', STR_PAD_LEFT);
    }

    /** $paisa * $num / $den, rounded half up (e.g. half a month: ratio(x, 1, 2)) */
    public static function ratio(int $paisa, int $num, int $den): int
    {
        $sign = ($paisa < 0) !== ($num < 0) ? -1 : 1;
        $abs = abs($paisa) * abs($num);
        return $sign * intdiv($abs * 2 + $den, 2 * $den);
    }
}
