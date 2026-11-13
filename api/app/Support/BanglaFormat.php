<?php

namespace App\Support;

use Carbon\CarbonInterface;

// D210: printed documents (TC, certificates, letters) show memo numbers and dates in Bangla digits and the date line in both
// calendars: "২৮ কার্তিক ১৪৩৩ বঙ্গাব্দ / ১৩ নভেম্বর ২০২৬ খ্রিস্টাব্দ". Revised Bangla calendar (Bangla Academy, 2019): the year starts
// on 14 April; Baishakh..Ashwin have 31 days, Kartik..Magh 30, Falgun 29 (30 when that February is in a leap year), Chaitra 30.
final class BanglaFormat
{
    private const BN_MONTHS = ['বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র'];
    private const EN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

    public static function digits(string|int $s): string
    {
        return strtr((string) $s, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
    }

    /** [day, month index 0-11, year] in the revised Bangla calendar */
    public static function bangabda(CarbonInterface $d): array
    {
        $d = $d->copy()->startOfDay();
        $start = $d->copy()->setDate($d->year, 4, 14);
        if ($d->lt($start)) $start = $start->subYear();
        $year = $start->year - 593;
        $leap = $start->copy()->addYear()->isLeapYear();             // the February inside this Bangla year
        $lengths = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, $leap ? 30 : 29, 30];
        $left = (int) $start->diffInDays($d);
        foreach ($lengths as $m => $len) {
            if ($left < $len) return [$left + 1, $m, $year];
            $left -= $len;
        }
        return [$left + 1, 11, $year];   // not reached
    }

    public static function dateLine(CarbonInterface $d): string
    {
        [$bd, $bm, $by] = self::bangabda($d);
        return self::digits($bd) . ' ' . self::BN_MONTHS[$bm] . ' ' . self::digits($by) . ' বঙ্গাব্দ / '
            . self::digits($d->day) . ' ' . self::EN_MONTHS[$d->month - 1] . ' ' . self::digits($d->year) . ' খ্রিস্টাব্দ';
    }
}
