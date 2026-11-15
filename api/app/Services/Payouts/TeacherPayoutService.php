<?php

namespace App\Services\Payouts;

use App\Exceptions\BusinessException;
use App\Models\{Attendance, AuditLog, BatchTeacher, FeePayment, PeriodAttendance, TeacherPayout, User};
use App\Services\{CashBookService, ExpenseService};
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

// D223 TPO.1 (coaching-private-batch.md "Teacher Payouts"): a month's payout per teacher and batch, from batch_teachers.pay_type:
//   fixed_monthly = rate; per_class = classes x rate; percentage = the batch's monthly-fee collection of that month x rate / 100;
//   salary = none (hr_payroll). A teacher with several subject rows in one batch gets the rows added up.
// per_class counts the days attendance was taken in the batch that month; where period attendance (D197) exists for the batch
// that month, the teacher's own classes (routine + date) instead. Generate is idempotent and touches drafts only; approved and
// paid rows never change; paying writes one expense row and is final (D32). Amounts never go to a log (D33).
class TeacherPayoutService
{
    /** {classes, base, paisa} for one batch_teachers row in a month */
    public function calculate(BatchTeacher $row, string $month): array
    {
        [$from, $to] = [Carbon::parse($month . '-01')->startOfMonth()->toDateString(), Carbon::parse($month . '-01')->endOfMonth()->toDateString()];
        $rate = Money::toPaisa((string) $row->pay_rate);
        $classes = 0;
        $base = 0;
        if ($row->pay_type === 'per_class') {
            $periods = PeriodAttendance::query()->join('routines', 'routines.id', '=', 'period_attendances.routine_id')
                ->where('routines.batch_id', $row->batch_id)->whereBetween('period_attendances.date', [$from, $to]);
            if ((clone $periods)->exists()) {
                $classes = (clone $periods)->where('routines.teacher_id', $row->teacher_id)
                    ->when((int) $row->subject_id !== 0, fn ($q) => $q->where('routines.subject_id', $row->subject_id))
                    ->distinct()->count(DB::raw("CONCAT(period_attendances.routine_id, '-', period_attendances.date)"));
            } else {
                $classes = Attendance::where('batch_id', $row->batch_id)->whereBetween('date', [$from, $to])->distinct()->count('date');
            }
        }
        if ($row->pay_type === 'percentage') {
            $base = FeePayment::where('batch_id', $row->batch_id)->where('month', $month)
                ->whereHas('feeCategory', fn ($q) => $q->where('frequency', 'monthly'))->get(['paid_amount'])
                ->sum(fn ($p) => Money::toPaisa((string) $p->paid_amount));
        }
        $paisa = match ($row->pay_type) {
            'fixed_monthly' => $rate,
            'per_class' => $classes * $rate,
            'percentage' => intdiv($base * $rate + 5000, 10000),                     // rate is a percent with 2 decimals: base x rate / 100, half up
            default => 0,
        };
        return ['classes' => $classes, 'base' => $base, 'paisa' => $paisa];
    }

    /** Drafts for every paid teacher-batch pair of the month; approved / paid rows are left alone. Returns the month's rows. */
    public function generate(string $month, User $by)
    {
        DB::transaction(function () use ($month, $by) {
            $rows = BatchTeacher::where('pay_type', '!=', 'salary')->get()->groupBy(fn ($r) => $r->teacher_id . ':' . $r->batch_id);
            foreach ($rows as $group) {
                $sum = ['classes' => 0, 'base' => 0, 'paisa' => 0];
                foreach ($group as $r) {
                    $c = $this->calculate($r, $month);
                    $sum = ['classes' => $sum['classes'] + $c['classes'], 'base' => max($sum['base'], $c['base']), 'paisa' => $sum['paisa'] + $c['paisa']];
                }
                $first = $group->first();
                $p = TeacherPayout::where(['teacher_id' => $first->teacher_id, 'batch_id' => $first->batch_id, 'month' => $month])->lockForUpdate()->first();
                if ($p && $p->status !== 'draft') continue;
                $values = ['classes_taken' => $sum['classes'], 'collection_base' => Money::format($sum['base']), 'amount' => Money::format($sum['paisa'])];
                if ($p) {
                    if ($p->note === null) $p->update($values);   // an edited draft (amount with a note) keeps the admin's amount
                    else $p->update(array_diff_key($values, ['amount' => 1]));
                } else {
                    TeacherPayout::create($values + ['teacher_id' => $first->teacher_id, 'batch_id' => $first->batch_id, 'month' => $month, 'status' => 'draft']);
                }
            }
            AuditLog::record('teacher_payout.generated', \App\Support\Tenancy::current(), ['month' => $month]);
        });
    }

    /** Draft only: a new amount needs a note naming why (D223 (5): a correction of an earlier month goes here) */
    public function edit(TeacherPayout $p, ?string $amount, ?string $note): TeacherPayout
    {
        return DB::transaction(function () use ($p, $amount, $note) {
            $p = TeacherPayout::lockForUpdate()->findOrFail($p->id);
            if ($p->status !== 'draft') throw new BusinessException(__('errors.payout_not_draft'), 'payout_not_draft', 409);
            if ($amount !== null && Money::toPaisa($amount) !== Money::toPaisa((string) $p->amount) && trim((string) $note) === '') {
                throw \Illuminate\Validation\ValidationException::withMessages(['note' => __('payouts.note_required')]);
            }
            $p->update(array_filter(['amount' => $amount === null ? null : Money::format(Money::toPaisa($amount)), 'note' => $note], fn ($v) => $v !== null));
            AuditLog::record('teacher_payout.edited', $p);
            return $p->fresh();
        });
    }

    public function approve(TeacherPayout $p): TeacherPayout
    {
        return DB::transaction(function () use ($p) {
            $p = TeacherPayout::lockForUpdate()->findOrFail($p->id);
            if ($p->status !== 'draft') throw new BusinessException(__('errors.payout_not_draft'), 'payout_not_draft', 409);
            $p->update(['status' => 'approved']);
            AuditLog::record('teacher_payout.approved', $p);
            return $p->fresh();
        });
    }

    /** Approved -> paid, with one expense row (category teacher_payout); final */
    public function pay(TeacherPayout $p, string $method, string $date, User $by): TeacherPayout
    {
        return DB::transaction(function () use ($p, $method, $date, $by) {
            app(CashBookService::class)->lockInstitution();
            $p = TeacherPayout::lockForUpdate()->findOrFail($p->id);
            if ($p->status !== 'approved') throw new BusinessException(__('errors.payout_not_approved'), 'payout_not_approved', 409);
            if (Money::toPaisa((string) $p->amount) > 0) {
                app(ExpenseService::class)->recordTeacherPayout($p, $method, $date, $by);
            }
            $p->update(['status' => 'paid', 'paid_at' => now()]);
            AuditLog::record('teacher_payout.paid', $p, ['method' => $method]);
            return $p->fresh();
        });
    }
}
