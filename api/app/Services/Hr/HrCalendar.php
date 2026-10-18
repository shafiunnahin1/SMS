<?php

namespace App\Services\Hr;

use App\Models\Holiday;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

class HrCalendar
{
    /** Inclusive working dates; D85 specifies no implicit national weekly holiday. */
    public function dates(string $from, string $to): array
    {
        $institution = Tenancy::current();
        if (!$institution) throw new \App\Exceptions\TenantNotBoundException(self::class);
        $weekly = data_get($institution->settings ?? [], 'hr.weekly_holidays', []);
        if (!is_array($weekly) || !array_is_list($weekly) ||
            array_filter($weekly, fn ($day) => !is_int($day) || $day < 1 || $day > 7)) {
            throw ValidationException::withMessages(['weekly_holidays' => __('validation.in', ['attribute' => 'weekly_holidays'])]);
        }
        $start = CarbonImmutable::parse($from, config('app.timezone'))->startOfDay();
        $end = CarbonImmutable::parse($to, config('app.timezone'))->startOfDay();
        if ($end->lt($start)) throw ValidationException::withMessages(['to_date' => __('validation.date', ['attribute' => 'to_date'])]);
        $holidays = Holiday::whereBetween('date', [$start->toDateString(), $end->toDateString()])->pluck('date')
            ->map(fn ($date) => substr((string) $date, 0, 10))->flip();
        $dates = [];
        for ($date = $start; $date->lte($end); $date = $date->addDay()) {
            if (!in_array($date->isoWeekday(), $weekly, true) && !$holidays->has($date->toDateString())) $dates[] = $date->toDateString();
        }
        return $dates;
    }
}
