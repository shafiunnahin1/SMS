<?php

namespace App\Services\Calendar;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Holiday, Student, User};
use App\Notifications\GeneralNotification;
use App\Services\Sms\SmsEventPolicy;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// D213 CAL.1: a holiday is one row per day (a range is saved day by day); a new holiday that is not in the past tells the
// active students, their parents and the teachers in the app, and each guardian phone through the D208 SMS event `holiday_new`
// (default off).
class HolidayService
{
    public const MAX_DAYS = 60;

    /** @return Holiday[] */
    public function create(array $d): array
    {
        $from = CarbonImmutable::parse($d['date']);
        $to = CarbonImmutable::parse($d['end_date'] ?? $d['date']);
        if ($from->diffInDays($to) + 1 > self::MAX_DAYS) throw new BusinessException('too many days', 'holiday_range_too_long', 422, ['max' => self::MAX_DAYS]);
        $dates = [];
        for ($x = $from; $x->lte($to); $x = $x->addDay()) $dates[] = $x->toDateString();
        if (Holiday::whereIn('date', $dates)->exists()) throw new BusinessException('a holiday already exists on one of these days', 'holiday_exists', 422);
        $rows = DB::transaction(function () use ($d, $dates) {
            $rows = [];
            foreach ($dates as $day) {
                $rows[] = Holiday::create(['title' => $d['title'], 'date' => $day, 'type' => $d['type'] ?? 'public', 'description' => $d['description'] ?? null]);
            }
            AuditLog::record('holiday.created', $rows[0], ['days' => count($rows)]);
            return $rows;
        });
        if ($to->gte(CarbonImmutable::today())) $this->announce($d['title'], $from, $to);
        return $rows;
    }

    private function announce(string $title, CarbonImmutable $from, CarbonImmutable $to): void
    {
        $range = $from->equalTo($to) ? $from->format('d/m/Y') : $from->format('d/m/Y') . ' - ' . $to->format('d/m/Y');
        $users = [];
        $phones = [];
        foreach (Student::active()->with(['user', 'parents'])->get() as $s) {
            foreach (array_filter([$s->user, ...$s->parents]) as $u) $users[$u->id] = $u;
            if ($s->guardian_phone) $phones[$s->guardian_phone] = true;
        }
        foreach (User::where('role', 'teacher')->get() as $u) $users[$u->id] = $u;
        $body = __('calendar.holiday_body', ['title' => $title, 'dates' => $range]);
        foreach ($users as $u) $u->notify(new GeneralNotification(__('calendar.holiday_title'), $body, 'holiday_new', []));
        $policy = app(SmsEventPolicy::class);
        if ($policy->mode('holiday_new') === 'off') return;
        $sms = __('calendar.holiday_sms', ['title' => Str::limit($title, 60), 'dates' => $range]);
        foreach (array_keys($phones) as $phone) $policy->dispatch('holiday_new', $phone, $sms);
    }
}
