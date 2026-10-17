<?php

namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Jobs\GeneratePayrollRun;
use App\Models\{PayrollItem, PayrollRun, SalaryAdjustment, SalaryAdvance, SalaryComponent, SalaryPayAccount, SalaryStructure, SalaryStructureLine, StaffMember, Teacher, User};
use App\Support\{Money, Tenancy};
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\ValidationException;

/**
 * R3.7 / D104 (staff-payroll.md §7): run lifecycle draft -> reviewed -> approved, with reject/cancel. Amounts come only from
 * server-owned structures, attendance, approved adjustments and active advances through PayrollCalculator; nothing from the client.
 * Approval freezes the run (models guard it) and assigns slip numbers; settlement effects happen at payment (PayrollPaymentService).
 */
class PayrollRunService
{
    // final settlement is R3.8; 'supplementary' (13 chars) does not fit schema.sql kind VARCHAR(12) - closed until the owner decides (docs/BLOCKED.md)
    private const KINDS = ['regular', 'bonus'];

    public function __construct(private SalaryAccess $access, private PayrollApproval $approval, private PayrollCalculator $calculator,
        private AttendanceSummary $attendance, private SalaryAdvanceService $advances) {}

    public function create(User $actor, array $input): PayrollRun
    {
        if (array_diff(array_keys($input), ['month', 'kind', 'label'])) $this->invalid('payroll');
        $data = Validator::make($input, ['month' => 'required|date_format:Y-m', 'kind' => 'sometimes|string', 'label' => 'sometimes|nullable|string|max:80'])->validate();
        $kind = $data['kind'] ?? 'regular';
        if (!in_array($kind, self::KINDS, true)) $this->invalid('kind');
        $settings = $this->settings();
        return DB::transaction(function () use ($actor, $data, $kind, $settings) {
            $this->approval->lock($actor);
            $label = (string) ($data['label'] ?? '');
            if (PayrollRun::where('month', $data['month'])->where('kind', $kind)->where('label', $label)->exists()) $this->conflict();
            $run = PayrollRun::create(['month' => $data['month'], 'kind' => $kind, 'label' => $label, 'status' => 'draft',
                'settings_snapshot' => $settings, 'prepared_by' => $actor->id]);
            \Illuminate\Support\Facades\Bus::dispatchNow(new GeneratePayrollRun($run->id, $run->institution_id));   // in-request: the tenant is already bound
            $this->approval->audit($actor, $run, 'payroll.created', ['month' => $run->month, 'kind' => $kind]);
            return $run->fresh('items');
        });
    }

    public function transition(User $actor, int $id, string $action, array $input = []): PayrollRun
    {
        return DB::transaction(function () use ($actor, $id, $action, $input) {
            $this->approval->lock($actor);
            $run = PayrollRun::lockForUpdate()->findOrFail($id);
            return match ($action) {
                'recompute' => $this->recompute($actor, $run, $input),
                'review' => $this->move($actor, $run, $input, 'draft', 'reviewed', ['reviewed_by' => $actor->id]),
                'reject' => $this->reject($actor, $run, $input),
                'approve' => $this->approve($actor, $run, $input),
                'cancel' => $this->cancel($actor, $run, $input),
                default => abort(404),
            };
        });
    }

    private function recompute(User $actor, PayrollRun $run, array $input): PayrollRun
    {
        if ($input) $this->invalid('payroll');
        if ($run->status !== 'draft') $this->immutable();
        $run->settings_snapshot = $this->settings(); $run->save();
        \Illuminate\Support\Facades\Bus::dispatchNow(new GeneratePayrollRun($run->id, $run->institution_id));   // in-request: the tenant is already bound
        $this->approval->audit($actor, $run, 'payroll.recomputed');
        return $run->fresh('items');
    }

    private function move(User $actor, PayrollRun $run, array $input, string $from, string $to, array $extra): PayrollRun
    {
        if ($input) $this->invalid('payroll');
        if ($run->status === $to) return $run->load('items');
        if ($run->status !== $from) $this->conflict();
        $run->fill(['status' => $to] + $extra)->save();
        $this->approval->audit($actor, $run, 'payroll.'.$to);
        return $run->load('items');
    }

    private function reject(User $actor, PayrollRun $run, array $input): PayrollRun
    {
        $reason = $this->reason($input);
        if ($run->status !== 'reviewed') $this->conflict();
        $this->approval->authorize($actor, null, $this->approval->policy());   // approver-only action
        $run->fill(['status' => 'draft', 'reviewed_by' => null])->save();
        $this->approval->audit($actor, $run, 'payroll.rejected', ['reason' => $reason]);
        return $run->load('items');
    }

    /** §7.2 maker-checker: the preparer cannot approve, except the configured audited sole-admin rule; approvals are admin-only */
    private function approve(User $actor, PayrollRun $run, array $input): PayrollRun
    {
        if ($input) $this->invalid('payroll');
        if (in_array($run->status, ['approved', 'paid'], true)) return $run->load('items');
        if ($run->status !== 'reviewed') $this->conflict();
        $self = $this->approval->authorize($actor, $run->prepared_by, $this->approval->policy());
        // the inputs a draft was built from must still hold (no adjustment taken by another run, no advance closed meanwhile)
        foreach ($run->items as $item) foreach ($item->breakdown as $line) {
            if ($line['source'] === 'adjustment' && !SalaryAdjustment::whereKey($line['ref_id'])->where('status', 'approved')->whereNull('payroll_item_id')->exists()) $this->stale();
            if ($line['source'] === 'advance' && !SalaryAdvance::whereKey($line['ref_id'])->where('status', 'active')->exists()) $this->stale();
        }
        $prefix = 'PS-'.$run->month.'-';
        $last = PayrollItem::where('slip_no', 'like', $prefix.'%')->orderByDesc('slip_no')->value('slip_no');
        $seq = $last ? (int) substr($last, strlen($prefix)) : 0;
        foreach ($run->items()->orderBy('id')->get() as $item) {
            $item->slip_no = $prefix.str_pad((string) ++$seq, 4, '0', STR_PAD_LEFT);
            $item->save();
        }
        $run->fill(['status' => 'approved', 'approved_by' => $actor->id, 'approved_at' => now(), 'self_approved' => $self])->save();
        $this->approval->audit($actor, $run, 'payroll.approved', ['self_approved' => $self]);
        return $run->load('items');
    }

    private function cancel(User $actor, PayrollRun $run, array $input): PayrollRun
    {
        $reason = $this->reason($input);
        if ($run->status === 'cancelled') return $run->load('items');
        if (!in_array($run->status, ['draft', 'reviewed', 'approved'], true)) $this->conflict();
        if ($run->status === 'approved') {
            $this->approval->authorize($actor, null, $this->approval->policy());
            if ($run->items()->whereIn('status', ['paid'])->exists()) $this->conflict();
        }
        $run->fill(['status' => 'cancelled', 'cancelled_reason' => $reason])->save();
        $this->approval->audit($actor, $run, 'payroll.cancelled', ['reason' => $reason]);
        return $run->load('items');
    }

    /** GeneratePayrollRun entry point: draft only, under the run's row lock */
    public function generateDraft(int $runId): void
    {
        DB::transaction(function () use ($runId) {
            $run = PayrollRun::lockForUpdate()->findOrFail($runId);
            if ($run->status === 'draft') $this->generate($run);
        });
    }

    /** draft only: rebuild every item from current server-owned inputs (idempotent) */
    private function generate(PayrollRun $run): void
    {
        $run->items()->get()->each->delete();
        $settings = $run->settings_snapshot; $totals = [0, 0, 0]; $count = 0;
        foreach ($this->payees($run->month) as [$type, $payee]) {
            $item = $this->item($run, $type, $payee, $settings);
            if (!$item) continue;
            $count++; $totals[0] += Money::toPaisa($item->gross); $totals[1] += Money::toPaisa($item->total_deductions); $totals[2] += Money::toPaisa($item->net);
        }
        $run->fill(['payees_count' => $count, 'total_gross' => Money::format($totals[0]), 'total_deductions' => Money::format($totals[1]), 'total_net' => Money::format($totals[2])])->save();
    }

    private function item(PayrollRun $run, string $type, Teacher|StaffMember $payee, array $settings): ?PayrollItem
    {
        $start = CarbonImmutable::parse($run->month.'-01'); $end = $start->endOfMonth()->startOfDay();
        $structures = SalaryStructure::where('payee_type', $type)->where('payee_id', $payee->id)
            ->where('effective_from', '<=', $end->toDateString())
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $start->toDateString()))->orderBy('effective_from')->get();
        $adjustments = SalaryAdjustment::where('payee_type', $type)->where('payee_id', $payee->id)->where('month', $run->month)
            ->where('status', 'approved')->whereNull('payroll_item_id')
            ->where('kind', $run->kind === 'bonus' ? '=' : '!=', 'bonus')->orderBy('id')->get();
        $regular = $run->kind === 'regular';
        if ($structures->isEmpty() && ($regular || $adjustments->isEmpty())) return null;

        $lines = SalaryStructureLine::whereIn('structure_id', $structures->pluck('id'))->orderBy('id')->get()->groupBy('structure_id');
        $components = SalaryComponent::whereIn('id', $lines->flatten()->pluck('component_id')->unique())->get()->keyBy('id');
        $input = ['month' => $run->month, 'deduction_base' => $settings['deduction_base'], 'basis' => $settings['basis_days'],
            'join' => $payee->joining_date?->toDateString(), 'leave' => $payee->leaving_date?->toDateString(),
            'structures' => $run->kind === 'bonus' ? [] : $structures->map(fn ($s) => ['effective_from' => $s->effective_from->toDateString(),
                'effective_to' => $s->effective_to?->toDateString(), 'basic' => (string) $s->basic,
                'lines' => ($lines[$s->id] ?? collect())->map(fn ($l) => ['code' => $components[$l->component_id]->code, 'mode' => $l->mode, 'value' => (string) $l->value,
                    'type' => $components[$l->component_id]->type])->all()])->all(),
            'adjustments' => $adjustments->map(fn ($a) => ['code' => 'adjustment_'.$a->id, 'direction' => $a->direction, 'amount' => (string) $a->amount])->all()];
        $summary = ['working_days' => 0, 'absent_days' => 0, 'lwp_days' => 0, 'late_count' => 0];
        if ($regular) {
            $summary = $this->attendance->forPayee($type, $payee->id, $run->month);
            $input += ['absent_days' => (string) $summary['absent_days'], 'lwp_days' => (string) $summary['lwp_days'], 'late_count' => $summary['late_count'],
                'lates_per_day' => (int) $settings['late_policy']['lates_per_day'], 'working_days' => max(1, $summary['working_days'])];
        }
        $result = $this->calculator->compute($input);

        $breakdown = [];
        foreach ($result['earnings'] + $result['deductions'] as $code => $amount) {
            if (str_starts_with($code, 'adjustment_')) continue;
            $deduction = array_key_exists($code, $result['deductions']) && !array_key_exists($code, $result['earnings']);
            $component = $components->firstWhere('code', $code);
            $breakdown[] = ['code' => $code, 'name' => $code === 'basic' ? ['bn' => 'মূল বেতন', 'en' => 'Basic', 'ar' => 'الراتب الأساسي'] : ($code === 'absence'
                ? ['bn' => 'অনুপস্থিতি-কর্তন', 'en' => 'Absence deduction', 'ar' => 'خصم الغياب'] : $component?->name),
                'type' => $deduction ? 'deduction' : 'earning', 'amount' => $amount, 'source' => $code === 'absence' ? 'attendance' : 'structure', 'ref_id' => $code === 'absence' ? null : $component?->id];
        }
        foreach ($adjustments as $a) $breakdown[] = ['code' => $a->kind, 'name' => ['bn' => $a->description, 'en' => $a->description, 'ar' => $a->description],
            'type' => $a->direction, 'amount' => Money::format(Money::toPaisa((string) $a->amount)), 'source' => 'adjustment', 'ref_id' => $a->id];

        // §6 advance installments: never below min_net_after_recovery (D87 recovery rules incl. approved skips)
        $net = Money::toPaisa($result['net']); $deductions = Money::toPaisa($result['total_deductions']);
        if ($regular) foreach (SalaryAdvance::where('payee_type', $type)->where('payee_id', $payee->id)->where('status', 'active')->orderBy('id')->get() as $advance) {
            $take = Money::toPaisa($this->advances->recovery($this->actor($run), $advance->id, $run->month, Money::format($net))['recovery']);
            if ($take <= 0) continue;
            $net -= $take; $deductions += $take;
            $breakdown[] = ['code' => 'advance_recovery', 'name' => ['bn' => 'অগ্রিম-কিস্তি', 'en' => 'Advance installment', 'ar' => 'قسط السلفة'],
                'type' => 'deduction', 'amount' => Money::format($take), 'source' => 'advance', 'ref_id' => $advance->id];
        }
        if (($settings['rounding'] ?? 'none') === 'nearest_1' && ($diff = Money::ratio($net, 1, 100) * 100 - $net) !== 0) {
            $net += $diff;
            if ($diff < 0) $deductions -= $diff;   // rounded down: the difference is a deduction line; rounded up it is an earning
            $breakdown[] = ['code' => 'rounding', 'name' => ['bn' => 'পূর্ণসংখ্যায় সমন্বয়', 'en' => 'Rounding', 'ar' => 'التقريب'],
                'type' => $diff > 0 ? 'earning' : 'deduction', 'amount' => Money::format(abs($diff)), 'source' => 'rounding', 'ref_id' => null];
        }
        $earnings = $net + $deductions;
        $hold = $net < 0 ? 'negative_net' : (!SalaryPayAccount::where('payee_type', $type)->where('payee_id', $payee->id)->exists() ? 'no_pay_account' : null);
        $structure = $structures->last();
        return PayrollItem::create(['run_id' => $run->id, 'payee_type' => $type, 'payee_id' => $payee->id, 'structure_id' => $structure?->id,
            'days_in_month' => $result['days_in_month'], 'paid_days' => Money::format(max(0, ($summary['working_days'] - $summary['absent_days'] - $summary['lwp_days']) * 100)),
            'absent_days' => Money::format($summary['absent_days'] * 100), 'lwp_days' => Money::format($summary['lwp_days'] * 100), 'late_count' => $summary['late_count'],
            'basic' => $result['basic'], 'gross' => $result['gross'], 'total_earnings' => Money::format($earnings), 'total_deductions' => Money::format($deductions),
            'tax' => '0.00', 'net' => Money::format($net), 'breakdown' => $breakdown, 'status' => $hold ? 'held' : 'ready', 'hold_reason' => $hold]);
    }

    /** active payees with any service in the month; teacher and staff #7 are different payees */
    private function payees(string $month): array
    {
        $start = $month.'-01'; $end = CarbonImmutable::parse($start)->endOfMonth()->toDateString(); $out = [];
        foreach (['teacher' => Teacher::class, 'staff' => StaffMember::class] as $type => $model) {
            $model::whereIn('status', ['active', 'on_leave'])
                ->where(fn ($q) => $q->whereNull('joining_date')->orWhere('joining_date', '<=', $end))
                ->where(fn ($q) => $q->whereNull('leaving_date')->orWhere('leaving_date', '>=', $start))
                ->orderBy('id')->each(function ($payee) use ($type, &$out) { $out[] = [$type, $payee]; });
        }
        return $out;
    }

    /** §13 settings with conservative defaults; PF and tax are R3.8 and fail closed until then (D104 clause 5) */
    private function settings(): array
    {
        $all = data_get(Tenancy::current()->settings ?? [], 'payroll', []);
        if (!is_array($all)) $this->invalid('payroll');
        $s = array_replace(['basis_days' => 'calendar', 'deduction_base' => 'gross', 'late_policy' => ['lates_per_day' => 0], 'rounding' => 'none',
            'pf' => ['enabled' => false], 'tax' => ['mode' => 'none']], array_intersect_key($all, array_flip(['basis_days', 'deduction_base', 'late_policy', 'rounding', 'pf', 'tax'])));
        Validator::make($s, ['basis_days' => 'required|in:calendar,fixed_30,working', 'deduction_base' => 'required|in:gross,basic',
            'late_policy.lates_per_day' => 'required|integer|min:0|max:31', 'rounding' => 'required|in:none,nearest_1'])->validate();
        if (!empty($s['pf']['enabled']) || ($s['tax']['mode'] ?? 'none') !== 'none') throw new BusinessException(__('salary.conflict'), 'dependency_pending', 409);
        return $s + ['min_net_after_recovery' => (string) $this->approval->policy()['min_net_after_recovery']];
    }

    private function actor(PayrollRun $run): User
    {
        return User::inTenant()->findOrFail($run->prepared_by);
    }

    private function reason(array $input): string
    {
        if (array_diff(array_keys($input), ['reason'])) $this->invalid('payroll');
        return Validator::make($input, ['reason' => 'required|string|max:255'])->validate()['reason'];
    }

    private function invalid(string $field): never { throw ValidationException::withMessages([$field => __('salary.invalid')]); }
    private function conflict(): never { throw new BusinessException(__('salary.conflict'), 'payroll_conflict', 409); }
    private function stale(): never { throw new BusinessException(__('salary.conflict'), 'stale_payroll', 409); }
    /** staff-payroll.md §17: an edit attempt on a non-draft run is 422 */
    private function immutable(): never { throw new BusinessException(__('salary.immutable'), 'payroll_frozen', 422); }
}
