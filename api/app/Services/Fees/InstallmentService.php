<?php

namespace App\Services\Fees;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, FeeInstallment, FeeInstallmentPlan, Student};
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
}
