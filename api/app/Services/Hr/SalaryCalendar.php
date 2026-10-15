<?php
namespace App\Services\Hr;
use Carbon\CarbonImmutable;
class SalaryCalendar
{
    public function serviceMonths(string $joining,string $through): int
    {
        $start=CarbonImmutable::parse($joining);$end=CarbonImmutable::parse($through);
        if($end->lt($start)) return 0;
        $months=($end->year-$start->year)*12+$end->month-$start->month;
        if($start->addMonthsNoOverflow($months)->gt($end)) $months--;
        return max(0,$months);
    }
}
