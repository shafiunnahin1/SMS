<?php

namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Models\{PayrollItem, PayrollRun, SalaryAdjustment, SalaryRevision, User};
use App\Support\Money;
use Carbon\CarbonImmutable;

/**
 * R3.7 / D86 / D104 (staff-payroll.md §3.3): automatic arrears for a backdated revision. Every ended month the revision covers must
 * already have a settled regular payroll item for the payee - otherwise what was paid is unknown and approval fails closed
 * (dependency_pending). The arrears become one approved `arrear` adjustment for the current month, paid by the next run.
 */
class PayrollArrearsService
{
    public function __construct(private PayrollCalculator $calculator) {}

    /** null = no ended month is affected; otherwise the arrears amount (may be 0.00) */
    public function amount(SalaryRevision $revision): ?string
    {
        $from = CarbonImmutable::parse($revision->effective_from)->startOfMonth();
        $current = CarbonImmutable::now()->startOfMonth();
        if ($from >= $current) return null;
        $months = [];
        for ($m = $from; $m < $current; $m = $m->addMonthNoOverflow()) $months[] = $m->format('Y-m');
        $settled = PayrollItem::where('payee_type', $revision->payee_type)->where('payee_id', $revision->payee_id)
            ->whereIn('run_id', PayrollRun::where('kind', 'regular')->whereIn('status', ['approved', 'paid'])->whereIn('month', $months)->select('id'))
            ->with('run:id,month')->get()->pluck('run.month')->unique();
        if (array_diff($months, $settled->all()) || $revision->old_gross === null) throw new BusinessException(__('salary.dependency'), 'dependency_pending', 409);
        return $this->calculator->arrears((string) $revision->old_gross, (string) $revision->new_gross, $revision->effective_from->toDateString(), $months);
    }

    public function record(SalaryRevision $revision, string $amount, User $actor): ?SalaryAdjustment
    {
        if (Money::toPaisa($amount) === 0) return null;
        $positive = Money::toPaisa($amount) > 0;
        return SalaryAdjustment::create(['payee_type' => $revision->payee_type, 'payee_id' => $revision->payee_id, 'kind' => $positive ? 'arrear' : 'recovery',
            'direction' => $positive ? 'earning' : 'deduction', 'amount' => Money::format(abs(Money::toPaisa($amount))), 'month' => now()->format('Y-m'),
            'revision_id' => $revision->id, 'description' => 'Arrears for revision #'.$revision->id, 'status' => 'approved',
            'created_by' => $revision->proposed_by, 'approved_by' => $actor->id]);
    }
}
