<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use IntlDateFormatter;

// D214 MAD.2 (docs/modules/madrasa.md section 2): the Hijri date beside a Gregorian one on server-made documents (receipts) when
// the institution turned the Hijri calendar on - display only, the same tabular Umm al-Qura calendar and offset (-2..+2 days) the
// screens use; stored dates never change. Latin digits, like the screens and the Gregorian date beside it.
class Hijri
{
    private const TAGS = ['bn' => 'bn_BD', 'en' => 'en', 'ar' => 'ar'];

    /** "1 শাওয়াল 1447" for the calendar day of $date, or null when the current institution has the Hijri calendar off */
    public static function beside($date): ?string
    {
        $c = data_get(Tenancy::current()?->settings ?? [], 'calendar', []);
        if (($c['secondary'] ?? 'none') !== 'hijri' || $date === null) return null;
        return self::format($date, max(-2, min(2, (int) ($c['hijri_offset'] ?? 0))), app()->getLocale());
    }

    public static function format($date, int $offset, string $locale): ?string
    {
        $day = Carbon::parse(Carbon::parse($date)->format('Y-m-d') . ' 12:00:00', 'UTC')->addDays($offset);
        $f = new IntlDateFormatter((self::TAGS[$locale] ?? 'bn_BD') . '@calendar=islamic-umalqura;numbers=latn', IntlDateFormatter::NONE, IntlDateFormatter::NONE,
            'UTC', IntlDateFormatter::TRADITIONAL, 'd MMMM y');
        $out = $f->format($day->getTimestamp());
        return $out === false ? null : $out;
    }
}
