<?php

namespace App\Services\Fees;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, FeeInstallment, FeeInstallmentPlan, Institution, Student};
use App\Services\Sms\SmsEventPolicy;
use App\Services\SmsService;
use App\Support\Tenancy;
use App\Services\FeeService;
use App\Support\Money;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

// D211 INST.1 (docs/modules/extended-features.md section 2): a plan splits ONE due line of a student (key
// "{enrollment_id}:{fee_category_id}:{period}" from FeeService::dueLines) into N installments - equal amounts in paisa, the last one
// takes the rounding; the first due date is given, the next ones fall on the same day of each following month (the last day of a
// shorter month). One open plan per due line. Only an unpaid installment's due date can change.
class InstallmentService
{
    public function __construct(private FeeService $fees) {}

    public function createPlan(Student $student, string $dueKey, int $count, string $firstDue, int $by): FeeInstallmentPlan
    {
        return DB::transaction(function () use ($student, $dueKey, $count, $firstDue, $by) {
            $student = Student::whereKey($student->id)->lockForUpdate()->firstOrFail();
            $line = $this->fees->dueLines($student)->firstWhere('key', $dueKey)
                ?? throw new BusinessException('this due cannot be split', 'due_not_found', 422);
            if ($this->openPlanFor($student->id, $dueKey)) throw new BusinessException('this due is already in installments', 'plan_exists', 422);
            $total = Money::toPaisa($line['amount']);
            if ($total < $count) throw new BusinessException('the due is too small to split', 'due_too_small', 422);
            $each = intdiv($total, $count);
            $plan = FeeInstallmentPlan::create(['student_id' => $student->id, 'fee_category_id' => $line['fee_category_id'], 'total_amount' => Money::format($total),
                'installments' => $count, 'approved_by' => $by, 'due_key' => $dueKey]);
            $first = Carbon::parse($firstDue);
            for ($i = 1; $i <= $count; $i++) {
                FeeInstallment::create(['plan_id' => $plan->id, 'installment_no' => $i, 'status' => 'pending',
                    'amount' => Money::format($i === $count ? $total - $each * ($count - 1) : $each),
                    'due_date' => $first->copy()->addMonthsNoOverflow($i - 1)->toDateString()]);
            }
            AuditLog::record('installment_plan.created', $plan, ['due_key' => $dueKey, 'installments' => $count, 'total' => Money::format($total)]);
            return $plan;
        });
    }

    public function changeDueDate(FeeInstallment $item, string $date): FeeInstallment
    {
        return DB::transaction(function () use ($item, $date) {
            $item = FeeInstallment::whereKey($item->id)->lockForUpdate()->firstOrFail();
            if ($item->status === 'paid') throw new BusinessException('a paid installment does not change', 'installment_paid', 422);
            $from = $item->due_date->toDateString();
            // a new date means a new reminder; overdue again only if the new date has passed (the daily job)
            $item->update(['due_date' => $date, 'status' => 'pending', 'reminded_before_at' => null, 'reminded_overdue_at' => null]);
            AuditLog::record('installment.due_changed', $item, ['from' => $from, 'to' => $date]);
            return $item;
        });
    }

    /** a plan of this due line with an installment not yet paid */
    public function openPlanFor(int $studentId, string $dueKey): ?FeeInstallmentPlan
    {
        return FeeInstallmentPlan::where('student_id', $studentId)->where('due_key', $dueKey)
            ->whereHas('items', fn ($q) => $q->where('status', '!=', 'paid'))->first();
    }

    /** D211 INST.2: pay one installment through the normal fee collection of its due line (one RCP- receipt); the amount is the
     *  installment's own; the due line must still owe at least that much. Returns the receipt number. */
    public function pay(FeeInstallment $item, string $method): string
    {
        return DB::transaction(function () use ($item, $method) {
            $item = FeeInstallment::whereKey($item->id)->lockForUpdate()->firstOrFail();
            if ($item->status === 'paid') throw new BusinessException('already paid', 'installment_paid', 409);
            $plan = FeeInstallmentPlan::with('student')->findOrFail($item->plan_id);
            $line = $this->fees->dueLines($plan->student)->firstWhere('key', $plan->due_key);
            if (!$line || Money::toPaisa($line['amount']) < Money::toPaisa((string) $item->amount)) {
                throw new BusinessException('the due no longer matches this installment', 'installment_mismatch', 422);
            }
            $rows = $this->fees->collect($plan->student, [['key' => $plan->due_key, 'paid_amount' => (string) $item->amount]], $method);
            $item->update(['status' => 'paid', 'paid_at' => now(), 'payment_id' => $rows->first()->id]);
            AuditLog::record('installment.paid', $item, ['receipt_no' => $rows->first()->receipt_no]);
            return $rows->first()->receipt_no;
        });
    }

    /** D211 INST.2 (daily): unpaid installments past their date become overdue; the guardian gets the `fee_due_reminder` SMS once
     *  3 days before (or later, until the date, if a day was missed) and once after the date - never twice. Returns [overdue, sent]. */
    public function daily(): array
    {
        $today = now()->toDateString();
        $overdue = FeeInstallment::where('status', 'pending')->whereDate('due_date', '<', $today)->update(['status' => 'overdue']);
        $sent = 0;
        $i = Institution::find(Tenancy::current()->id);
        $policy = app(SmsEventPolicy::class);
        if ($policy->mode('fee_due_reminder', $i) === 'off') return [$overdue, 0];
        $before = FeeInstallment::with('plan.student')->where('status', 'pending')->whereNull('reminded_before_at')
            ->whereDate('due_date', '>=', $today)->whereDate('due_date', '<=', now()->addDays(3)->toDateString())->get();
        $after = FeeInstallment::with('plan.student')->where('status', 'overdue')->whereNull('reminded_overdue_at')->get();
        foreach ([['installment_before', $before, 'reminded_before_at'], ['installment_overdue', $after, 'reminded_overdue_at']] as [$key, $items, $col]) {
            foreach ($items as $it) {
                $s = $it->plan?->student;
                if (!$s?->guardian_phone) continue;
                $loc = app(SmsService::class)->localeFor($s->primaryParent(), $i);
                $policy->dispatch('fee_due_reminder', $s->guardian_phone, __("sms.{$key}", ['no' => $it->installment_no, 'amount' => $it->amount, 'date' => $it->due_date->format('d/m/Y')], $loc));
                $it->update([$col => now()]);
                $sent++;
            }
        }
        return [$overdue, $sent];
    }
}
