<?php

namespace App\Services\Hr;

use App\Exceptions\BusinessException;
use App\Models\{PayrollItem, PayrollRun, ProvidentFundEntry, SalaryAdjustment, SalaryAdvance, SalaryPayAccount, User};
use App\Services\{CashBookService, ExpenseService};
use App\Support\Money;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\ValidationException;

/**
 * R3.7 / D104 (staff-payroll.md §8, D87): settlement of an approved run. Paying an item for the first time is the moment its
 * adjustments become applied (linked to the item) and its advance installments add to recovered (closing a fully recovered advance);
 * a retry of a paid item changes nothing. Each pay action appends one expenses summary row per payment method (source=payroll),
 * under the cashbook lock and closed-day rule; a returned payment appends the negative row and makes the item payable again.
 */
class PayrollPaymentService
{
    private const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'other'];

    public function __construct(private SalaryAccess $access, private PayrollApproval $approval, private ExpenseService $expenses) {}

    public function pay(User $actor, int $runId, array $input): PayrollRun
    {
        if (array_diff(array_keys($input), ['item_ids', 'method', 'reference', 'date'])) $this->invalid('payroll');
        $data = Validator::make($input, ['item_ids' => 'sometimes|array|min:1|max:1000', 'item_ids.*' => 'integer|distinct|min:1',
            'method' => 'sometimes|in:'.implode(',', self::METHODS), 'reference' => 'sometimes|nullable|string|max:100',
            'date' => 'sometimes|date_format:Y-m-d|before_or_equal:today'])->validate();
        $date = $data['date'] ?? now()->toDateString();
        return DB::transaction(function () use ($actor, $runId, $data, $date) {
            $this->access->actor($actor); app(CashBookService::class)->lockInstitution(); $this->access->actor($actor);
            $run = PayrollRun::lockForUpdate()->findOrFail($runId);
            if (!in_array($run->status, ['approved', 'paid'], true)) $this->conflict();
            $query = PayrollItem::where('run_id', $run->id)->lockForUpdate();
            $items = isset($data['item_ids']) ? $query->whereKey($data['item_ids'])->get() : $query->whereIn('status', ['ready', 'failed'])->get();
            if (isset($data['item_ids']) && $items->count() !== count($data['item_ids'])) abort(404);

            $byMethod = [];
            foreach ($items as $item) {
                if ($item->status === 'paid') continue;                       // identical retry: already settled, no second effect
                if ($item->status === 'held') $this->conflict();
                $method = $data['method'] ?? SalaryPayAccount::where('payee_type', $item->payee_type)->where('payee_id', $item->payee_id)
                    ->orderByDesc('is_default')->orderBy('id')->value('method');
                if (!in_array($method, self::METHODS, true)) $this->invalid('method');
                if ($item->status === 'ready') $this->settle($item);       // first payment only; a repaid failed item was settled before
                $item->fill(['status' => 'paid', 'payment_method' => $method, 'paid_reference' => $data['reference'] ?? null,
                    'paid_at' => now(), 'paid_by' => $actor->id])->save();
                $byMethod[$method] = ($byMethod[$method] ?? 0) + Money::toPaisa((string) $item->net);
            }
            ksort($byMethod);
            foreach ($byMethod as $method => $paisa) if ($paisa > 0) $this->expenses->recordPayroll($run, $method, $paisa, $date, $actor, 'Payroll '.$run->month.' #'.$run->id);
            if (!PayrollItem::where('run_id', $run->id)->where('status', '!=', 'paid')->exists()) $run->fill(['status' => 'paid', 'paid_at' => now()])->save();
            if ($byMethod) $this->approval->audit($actor, $run, 'payroll.paid', ['items' => $items->pluck('id')->all()]);
            return $run->fresh('items');
        });
    }

    /** §8: the bank returned a payment - the item becomes failed (payable again) and the expense is offset by a negative row */
    public function fail(User $actor, int $itemId, array $input): PayrollItem
    {
        $this->access->actor($actor); PayrollItem::findOrFail($itemId);   // another institution's item is 404 before any validation
        if (array_diff(array_keys($input), ['reason', 'date'])) $this->invalid('payroll');
        $data = Validator::make($input, ['reason' => 'required|string|max:255', 'date' => 'sometimes|date_format:Y-m-d|before_or_equal:today'])->validate();
        return DB::transaction(function () use ($actor, $itemId, $data) {
            $this->access->actor($actor); app(CashBookService::class)->lockInstitution(); $this->access->actor($actor);
            $item = PayrollItem::lockForUpdate()->findOrFail($itemId);
            $run = PayrollRun::lockForUpdate()->findOrFail($item->run_id);
            if ($item->status === 'failed') return $item;
            if ($item->status !== 'paid') $this->conflict();
            $this->expenses->recordPayroll($run, $item->payment_method, -Money::toPaisa((string) $item->net), $data['date'] ?? now()->toDateString(), $actor,
                'Payroll '.$run->month.' #'.$run->id.' returned '.$item->slip_no);
            $item->fill(['status' => 'failed', 'hold_reason' => $data['reason']])->save();
            if ($run->status === 'paid') $run->fill(['status' => 'approved', 'paid_at' => null])->save();
            $this->approval->audit($actor, $item, 'payroll.payment_failed', ['reason' => $data['reason']]);
            return $item->fresh();
        });
    }

    /** PATCH /hr/payroll-items/{id} { action: hold|release, reason }: only unpaid items; release needs the hold cause resolved */
    public function hold(User $actor, int $itemId, array $input): PayrollItem
    {
        $this->access->actor($actor); PayrollItem::findOrFail($itemId);
        if (array_diff(array_keys($input), ['action', 'reason'])) $this->invalid('payroll');
        $data = Validator::make($input, ['action' => 'required|in:hold,release', 'reason' => 'required_if:action,hold|nullable|string|max:255'])->validate();
        return DB::transaction(function () use ($actor, $itemId, $data) {
            $this->approval->lock($actor);
            $item = PayrollItem::lockForUpdate()->findOrFail($itemId);
            if (!in_array(PayrollRun::whereKey($item->run_id)->value('status'), ['draft', 'reviewed', 'approved'], true)) $this->conflict();
            if ($data['action'] === 'hold') {
                if ($item->status === 'held') return $item;
                if ($item->status !== 'ready') $this->conflict();
                $item->fill(['status' => 'held', 'hold_reason' => $data['reason']])->save();
            } else {
                if ($item->status === 'ready') return $item;
                if ($item->status !== 'held') $this->conflict();
                if ($item->hold_reason === 'no_pay_account' && !SalaryPayAccount::where('payee_type', $item->payee_type)->where('payee_id', $item->payee_id)->exists()) $this->conflict();
                if (Money::toPaisa((string) $item->net) < 0) $this->conflict();
                $item->fill(['status' => 'ready', 'hold_reason' => null])->save();
            }
            $this->approval->audit($actor, $item, 'payroll.item_'.$data['action']);
            return $item->fresh();
        });
    }

    /** D87: the frozen breakdown says exactly which adjustments and installments this item settles */
    private function settle(PayrollItem $item): void
    {
        // §10: the employee share withheld now, and the employer share (never deducted from the payee), as two ledger rows
        $run = PayrollRun::findOrFail($item->run_id); $pf = $run->settings_snapshot['pf'] ?? ['enabled' => false];
        foreach ($item->breakdown as $line) if ($line['source'] === 'pf') {
            $base = Money::toPaisa((string) (($pf['base'] ?? 'basic') === 'gross' ? $item->gross : $item->basic));
            ProvidentFundEntry::create(['payee_type' => $item->payee_type, 'payee_id' => $item->payee_id, 'month' => $run->month, 'kind' => 'employee',
                'amount' => $line['amount'], 'payroll_item_id' => $item->id]);
            if (($employer = Money::ratio($base, Money::toPaisa((string) ($pf['employer_percent'] ?? '0')), 10000)) > 0)
                ProvidentFundEntry::create(['payee_type' => $item->payee_type, 'payee_id' => $item->payee_id, 'month' => $run->month, 'kind' => 'employer',
                    'amount' => Money::format($employer), 'payroll_item_id' => $item->id]);
        }
        foreach ($item->breakdown as $line) {
            if ($line['source'] === 'adjustment') {
                $adjustment = SalaryAdjustment::lockForUpdate()->findOrFail($line['ref_id']);
                if ($adjustment->status !== 'approved' || $adjustment->payroll_item_id !== null) $this->stale();
                $adjustment->fill(['status' => 'applied', 'payroll_item_id' => $item->id])->save();
            }
            if ($line['source'] === 'advance') {
                $advance = SalaryAdvance::lockForUpdate()->findOrFail($line['ref_id']);
                if ($advance->status !== 'active') $this->stale();
                $recovered = Money::toPaisa((string) $advance->recovered) + Money::toPaisa($line['amount']);
                if ($recovered > Money::toPaisa((string) $advance->amount)) $this->stale();
                $advance->recovered = Money::format($recovered);
                if ($recovered === Money::toPaisa((string) $advance->amount)) $advance->status = 'closed';
                $advance->save();
            }
        }
    }

    private function invalid(string $field): never { throw ValidationException::withMessages([$field => __('salary.invalid')]); }
    private function conflict(): never { throw new BusinessException(__('salary.conflict'), 'payroll_conflict', 409); }
    private function stale(): never { throw new BusinessException(__('salary.conflict'), 'stale_payroll', 409); }
}
