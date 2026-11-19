<?php

namespace App\Services\Hostel;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Enrollment, Expense, FeeCategory, FeePayment, Hostel, HostelAllocation, HostelMealOff, HostelMessBazar, HostelMessBill, HostelMessMonth, HostelRoom, Student, User};
use App\Services\ExpenseService;
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// D233 HST.3 (docs/modules/hostel.md "Mess"): a with-mess member eats three meals a day from the check-in day up to the day before
// check-out, unless a meal is marked off. Each hostel picks fixed_monthly / per_meal / meal_rate. Closing a month freezes every
// member's meals and amount as bills (amounts in paisa, half up, G9); closed months and bills are never edited or deleted - a
// correction is an adjustment row (D32). Bills are dues in the category 'Hostel mess fee' (period = the month).
class MessService
{
    public const FEE_CATEGORY = 'হোস্টেল মেস ফি';
    public const MEALS = ['breakfast', 'lunch', 'dinner'];

    public function feeCategory(): FeeCategory
    {
        return FeeCategory::firstOrCreate(['name' => self::FEE_CATEGORY], ['amount' => '0.00', 'frequency' => 'monthly', 'applicable_to' => 'program_specific']);
    }

    public function saveSettings(Hostel $h, array $f): Hostel
    {
        $mode = $f['mess_mode'] ?? $h->mess_mode;
        $need = ['fixed_monthly' => ['mess_monthly_fee'], 'per_meal' => ['breakfast_rate', 'lunch_rate', 'dinner_rate'], 'meal_rate' => [], 'none' => []][$mode];
        foreach ($need as $k) if (($f[$k] ?? $h->{$k}) === null || ($f[$k] ?? $h->{$k}) === '') throw ValidationException::withMessages([$k => __('hostel.mess_rate_needed')]);
        $h->update($f);
        AuditLog::record('hostel.mess_settings', $h, array_intersect_key($f, array_flip(['mess_mode', 'mess_monthly_fee', 'breakfast_rate', 'lunch_rate', 'dinner_rate', 'breakfast_weight', 'lunch_weight', 'dinner_weight'])));
        return $h->fresh();
    }

    public function isClosed(Hostel $h, string $month): bool
    {
        return HostelMessMonth::where('hostel_id', $h->id)->where('month', $month)->exists();
    }

    /** student_id => [day 'Y-m-d' => true] - the with-mess days of each member in the month (up to $until) */
    public function memberDays(Hostel $h, string $month, ?Carbon $until = null): array
    {
        $start = Carbon::createFromFormat('Y-m-d', $month . '-01')->startOfDay();
        $end = $start->copy()->endOfMonth()->startOfDay();
        if ($until && $until->lt($end)) $end = $until->copy()->startOfDay();
        $rows = HostelAllocation::where('with_mess', true)->whereIn('room_id', HostelRoom::where('hostel_id', $h->id)->select('id'))
            ->where('check_in_date', '<=', $end->toDateString())->where(fn ($q) => $q->whereNull('check_out_date')->orWhere('check_out_date', '>', $start->toDateString()))->get();
        $days = [];
        foreach ($rows as $a) {
            $from = $a->check_in_date->copy()->max($start);
            $to = $a->check_out_date ? $a->check_out_date->copy()->subDay()->min($end) : $end->copy();
            for ($d = $from->copy(); $d->lte($to); $d->addDay()) $days[$a->student_id][$d->toDateString()] = true;
        }
        return $days;
    }

    /** student_id => ['breakfast' => n, 'lunch' => n, 'dinner' => n] for the month */
    public function mealCounts(Hostel $h, string $month, ?Carbon $until = null): array
    {
        $days = $this->memberDays($h, $month, $until);
        if (!$days) return [];
        $offs = HostelMealOff::where('hostel_id', $h->id)->whereIn('student_id', array_keys($days))->where('date', 'like', $month . '-%')->get();
        $out = [];
        foreach ($days as $sid => $set) {
            $out[$sid] = array_fill_keys(self::MEALS, count($set));
            foreach ($offs->where('student_id', $sid) as $o) if (isset($set[$o->date->toDateString()])) $out[$sid][$o->meal]--;
        }
        return $out;
    }

    /** weighted meals x 100 (an integer, so paisa math stays exact) */
    public function weighted100(Hostel $h, array $c): int
    {
        return $c['breakfast'] * Money::toPaisa((string) $h->breakfast_weight) + $c['lunch'] * Money::toPaisa((string) $h->lunch_weight) + $c['dinner'] * Money::toPaisa((string) $h->dinner_weight);
    }

    public function bazarPaisa(Hostel $h, string $month): int
    {
        return HostelMessBazar::where('hostel_id', $h->id)->where('date', 'like', $month . '-%')->get()->sum(fn ($b) => Money::toPaisa((string) $b->amount));
    }

    /** the members and their meals on one day (the meal-off sheet) */
    public function day(Hostel $h, string $date): array
    {
        $d = Carbon::createFromFormat('Y-m-d', $date);
        $days = $this->memberDays($h, $d->format('Y-m'));
        $ids = array_keys(array_filter($days, fn ($set) => isset($set[$date])));
        $offs = HostelMealOff::where('hostel_id', $h->id)->where('date', $date)->whereIn('student_id', $ids ?: [0])->get()->groupBy('student_id');
        return Student::with('user:id,name')->whereIn('id', $ids ?: [0])->get()->sortBy(fn ($s) => $s->user?->name)->values()
            ->map(fn ($s) => ['student' => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id], 'off' => ($offs[$s->id] ?? collect())->pluck('meal')->values()->all()])->all();
    }

    /** replace the offs of the listed members on one day; the month must be open and the day not far ahead */
    public function setOffs(Hostel $h, string $date, array $offs, User $by): void
    {
        $d = Carbon::createFromFormat('Y-m-d', $date);
        if ($this->isClosed($h, $d->format('Y-m'))) throw new BusinessException(__('hostel.month_closed'), 'mess_month_closed', 409);
        if ($d->gt(now()->addDays(31))) throw ValidationException::withMessages(['date' => __('hostel.too_far')]);
        $members = $this->memberDays($h, $d->format('Y-m'));
        DB::transaction(function () use ($h, $date, $offs, $by, $members) {
            foreach ($offs as $o) {
                $sid = (int) $o['student_id'];
                if (!isset($members[$sid][$date])) throw ValidationException::withMessages(['offs' => __('hostel.not_member_that_day')]);
                HostelMealOff::where('hostel_id', $h->id)->where('student_id', $sid)->where('date', $date)->delete();   // the day's sheet, not money (D32 covers bills)
                foreach (array_unique($o['meals'] ?? []) as $meal) HostelMealOff::create(['hostel_id' => $h->id, 'student_id' => $sid, 'date' => $date, 'meal' => $meal, 'marked_by' => $by->id]);
            }
        });
        AuditLog::record('hostel.meals_marked', $h, ['date' => $date, 'students' => count($offs)]);
    }

    public function addBazar(Hostel $h, array $f, User $by): HostelMessBazar
    {
        $month = substr($f['date'], 0, 7);
        if ($this->isClosed($h, $month)) throw new BusinessException(__('hostel.month_closed'), 'mess_month_closed', 409);
        return DB::transaction(function () use ($h, $f, $by) {
            $b = HostelMessBazar::create(['hostel_id' => $h->id, 'date' => $f['date'], 'amount' => Money::format(Money::toPaisa($f['amount'])), 'note' => $f['note'] ?? null, 'recorded_by' => $by->id]);
            $expense = app(ExpenseService::class)->recordHostelBazar($b, $h->name, $f['method'] ?? 'cash', $by);
            $b->update(['expense_id' => $expense->id]);
            AuditLog::record('hostel.bazar_added', $b);
            return $b->fresh();
        });
    }

    public function reverseBazar(HostelMessBazar $b, User $by): HostelMessBazar
    {
        return DB::transaction(function () use ($b, $by) {
            $row = HostelMessBazar::lockForUpdate()->findOrFail($b->id);
            $h = Hostel::findOrFail($row->hostel_id);
            if ($row->reversal_of_id !== null || Money::toPaisa((string) $row->amount) <= 0 || HostelMessBazar::where('reversal_of_id', $row->id)->exists()) throw new BusinessException(__('hostel.bazar_not_active'), 'bazar_not_active', 409);
            if ($this->isClosed($h, $row->date->format('Y-m'))) throw new BusinessException(__('hostel.month_closed'), 'mess_month_closed', 409);
            $rev = HostelMessBazar::create(['hostel_id' => $row->hostel_id, 'date' => $row->date->toDateString(), 'amount' => Money::format(-Money::toPaisa((string) $row->amount)), 'note' => $row->note, 'reversal_of_id' => $row->id, 'recorded_by' => $by->id]);
            if ($row->expense_id && ($e = Expense::find($row->expense_id))) $rev->update(['expense_id' => app(ExpenseService::class)->reverseHostelBazar($e, $by)->id]);
            AuditLog::record('hostel.bazar_reversed', $row);
            return $rev->fresh();
        });
    }

    /** freeze a past month of a hostel into bills; $by null = the nightly job */
    public function close(Hostel $h, string $month, ?User $by): HostelMessMonth
    {
        if ($h->mess_mode === 'none') throw new BusinessException(__('hostel.no_mess'), 'mess_off', 422);
        if ($month >= now()->format('Y-m')) throw ValidationException::withMessages(['month' => __('hostel.month_not_over')]);
        return DB::transaction(function () use ($h, $month, $by) {
            Hostel::whereKey($h->id)->lockForUpdate()->first();
            if ($this->isClosed($h, $month)) throw new BusinessException(__('hostel.month_closed'), 'mess_month_closed', 409);
            $counts = $this->mealCounts($h, $month);
            $bazar = $this->bazarPaisa($h, $month);
            $w = array_map(fn ($c) => $this->weighted100($h, $c), $counts);
            $total100 = array_sum($w);
            $rate = $h->mess_mode === 'meal_rate' && $total100 > 0 ? round($bazar / $total100, 4) : null;   // taka per meal (paisa per meal/100 x 100)
            $m = HostelMessMonth::create(['hostel_id' => $h->id, 'month' => $month, 'mode' => $h->mess_mode, 'total_meals' => Money::format($total100), 'total_bazar' => Money::format($bazar),
                'meal_rate' => $rate, 'closed_by' => $by?->id, 'closed_at' => now()]);
            $this->feeCategory();
            foreach ($counts as $sid => $c) {
                $paisa = match ($h->mess_mode) {
                    'fixed_monthly' => Money::toPaisa((string) $h->mess_monthly_fee),
                    'per_meal' => $c['breakfast'] * Money::toPaisa((string) $h->breakfast_rate) + $c['lunch'] * Money::toPaisa((string) $h->lunch_rate) + $c['dinner'] * Money::toPaisa((string) $h->dinner_rate),
                    'meal_rate' => $total100 > 0 ? Money::ratio($bazar, $w[$sid], $total100) : 0,
                };
                HostelMessBill::create(['mess_month_id' => $m->id, 'student_id' => $sid, 'kind' => 'bill', 'meals' => Money::format($w[$sid]), 'amount' => Money::format($paisa), 'created_by' => $by?->id]);
            }
            AuditLog::record('hostel.mess_closed', $m, ['members' => count($counts)]);
            return $m;
        });
    }

    /** the nightly job: close last month for the hostels whose mess bills itself (fixed_monthly, per_meal) */
    public function autoClose(): int
    {
        $month = now()->subMonthNoOverflow()->format('Y-m');
        $n = 0;
        foreach (Hostel::whereIn('mess_mode', ['fixed_monthly', 'per_meal'])->get() as $h) {
            if ($this->isClosed($h, $month) || !$this->memberDays($h, $month)) continue;
            $this->close($h, $month, null);
            $n++;
        }
        return $n;
    }

    public function adjust(HostelMessBill $bill, string $amount, string $note, User $by): HostelMessBill
    {
        if (Money::toPaisa($amount) === 0) throw ValidationException::withMessages(['amount' => __('hostel.adjust_zero')]);
        $row = HostelMessBill::create(['mess_month_id' => $bill->mess_month_id, 'student_id' => $bill->student_id, 'kind' => 'adjustment', 'meals' => '0.00', 'amount' => Money::format(Money::toPaisa($amount)), 'note' => $note, 'created_by' => $by->id]);
        AuditLog::record('hostel.mess_adjusted', $row, ['bill' => $bill->id]);
        return $row;
    }

    /** the mess dues of a student, in FeeService::dueLines shape: the sum of the closed bills of each month, less what was paid */
    public function dueLines(Student $s, ?Enrollment $first, FeeCategory $c): Collection
    {
        if (!$first) return collect();
        $since = now()->subMonthsNoOverflow(11)->format('Y-m');
        $byMonth = HostelMessBill::with('month:id,month')->where('student_id', $s->id)->get()->groupBy(fn ($b) => $b->month->month)->filter(fn ($rows, $m) => $m >= $since)->sortKeys();
        $lines = collect();
        foreach ($byMonth as $period => $rows) {
            $g = $rows->sum(fn ($b) => Money::toPaisa((string) $b->amount));
            if ($g <= 0) continue;
            $paid = FeePayment::where('student_id', $s->id)->where('fee_category_id', $c->id)->where('month', $period)->get();
            if ($paid->where('status', 'waived')->isNotEmpty()) continue;
            $payable = $g - $paid->sum(fn ($p) => Money::toPaisa($p->paid_amount));
            if ($payable <= 0) continue;
            $lines->push(['key' => "{$first->id}:{$c->id}:{$period}", 'enrollment_id' => $first->id, 'batch_id' => $first->batch_id, 'fee_category_id' => $c->id, 'category' => $c->name,
                'period' => $period, 'gross' => Money::format($g), 'discount' => '0.00', 'amount' => Money::format($payable)]);
        }
        return $lines;
    }

    /** the student's / parent's view: this month's meals so far and the closed months' bills */
    public function forStudent(Student $s): array
    {
        $a = HostelAllocation::with('room.hostel')->where('student_id', $s->id)->active()->first();
        $h = $a?->room?->hostel;
        $now = null;
        if ($h && $a->with_mess && $h->mess_mode !== 'none') {
            $c = $this->mealCounts($h, now()->format('Y-m'), now())[$s->id] ?? array_fill_keys(self::MEALS, 0);
            $now = ['month' => now()->format('Y-m'), 'mode' => $h->mess_mode, 'meals' => $c];
        }
        $bills = HostelMessBill::with('month')->where('student_id', $s->id)->orderByDesc('id')->limit(60)->get()
            ->groupBy(fn ($b) => $b->month->month)->map(fn ($rows, $m) => ['month' => $m, 'mode' => $rows->first()->month->mode, 'meals' => Money::format($rows->where('kind', 'bill')->sum(fn ($b) => Money::toPaisa((string) $b->meals))),   // meals x 100 kept exact, no float (G9)
                'amount' => Money::format($rows->sum(fn ($b) => Money::toPaisa((string) $b->amount))), 'adjusted' => $rows->where('kind', 'adjustment')->isNotEmpty()])->sortKeysDesc()->values();
        return ['with_mess' => (bool) ($a?->with_mess ?? false), 'current' => $now, 'bills' => $bills];
    }
}
