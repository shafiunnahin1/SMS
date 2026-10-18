<?php

namespace App\Services\Accounting;

use App\Models\{Budget, BudgetLine, LedgerAccount, Voucher, VoucherLine};
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * R3.10 (accounting.md §4): reports from posted vouchers only (posted + reversing). Cash basis; names are samples for the
 * institution's accountant to confirm. Amounts are integer paisa until formatted.
 */
class AccountingReportService
{
    public function __construct(private AccountingService $accounting, private AccountingPostingService $posting) {}

    /** account id => [debit, credit] paisa over posted vouchers in [from, to] (either open) */
    private function movement(?string $from, ?string $to): Collection
    {
        $vouchers = Voucher::whereIn('status', ['posted', 'reversed'])->when($from, fn ($q) => $q->where('date', '>=', $from))->when($to, fn ($q) => $q->where('date', '<=', $to))->select('id');
        return VoucherLine::whereIn('voucher_id', $vouchers)->get(['account_id', 'debit', 'credit'])->groupBy('account_id')
            ->map(fn ($ls) => [$ls->sum(fn ($l) => Money::toPaisa((string) $l->debit)), $ls->sum(fn ($l) => Money::toPaisa((string) $l->credit))]);
    }

    public function trialBalance(?string $asOf = null): array
    {
        $this->accounting->ensureChart();
        $m = $this->movement(null, $asOf); $rows = []; $dr = 0; $cr = 0;
        foreach (LedgerAccount::orderBy('code')->get() as $a) {
            [$d, $c] = $m[$a->id] ?? [0, 0]; $net = $d - $c; if ($d === 0 && $c === 0) continue;
            $rows[] = ['code' => $a->code, 'name' => $a->name, 'type' => $a->type, 'debit' => Money::format(max(0, $net)), 'credit' => Money::format(max(0, -$net))];
            $dr += max(0, $net); $cr += max(0, -$net);
        }
        return ['as_of' => $asOf, 'rows' => $rows, 'total_debit' => Money::format($dr), 'total_credit' => Money::format($cr), 'difference' => Money::format($dr - $cr)];
    }

    public function ledger(int $accountId, string $from, string $to): array
    {
        $account = LedgerAccount::findOrFail($accountId);
        [$od, $oc] = $this->movement(null, CarbonImmutable::parse($from)->subDay()->toDateString())[$account->id] ?? [0, 0];
        $balance = $od - $oc; $opening = $balance; $rows = [];
        $vouchers = Voucher::whereIn('status', ['posted', 'reversed'])->whereBetween('date', [$from, $to])->orderBy('date')->orderBy('id')->get()->keyBy('id');
        foreach (VoucherLine::where('account_id', $account->id)->whereIn('voucher_id', $vouchers->keys())->get()->sortBy(fn ($l) => [$vouchers[$l->voucher_id]->date, $l->voucher_id]) as $l) {
            $d = Money::toPaisa((string) $l->debit); $c = Money::toPaisa((string) $l->credit); $balance += $d - $c; $v = $vouchers[$l->voucher_id];
            $rows[] = ['date' => $v->date->toDateString(), 'voucher_no' => $v->voucher_no, 'narration' => $v->narration, 'debit' => Money::format($d), 'credit' => Money::format($c), 'balance' => Money::format($balance)];
        }
        return ['account' => $account->only(['id', 'code', 'name', 'type']), 'from' => $from, 'to' => $to, 'opening' => Money::format($opening), 'rows' => $rows, 'closing' => Money::format($balance)];
    }

    public function incomeExpenditure(string $from, string $to): array
    {
        $m = $this->movement($from, $to); $income = []; $expense = []; $ti = 0; $te = 0;
        foreach (LedgerAccount::whereIn('type', ['income', 'expense'])->orderBy('code')->get() as $a) {
            [$d, $c] = $m[$a->id] ?? [0, 0]; if ($d === 0 && $c === 0) continue;
            if ($a->type === 'income') { $ti += $c - $d; $income[] = ['code' => $a->code, 'name' => $a->name, 'amount' => Money::format($c - $d)]; }
            else { $te += $d - $c; $expense[] = ['code' => $a->code, 'name' => $a->name, 'amount' => Money::format($d - $c)]; }
        }
        return ['from' => $from, 'to' => $to, 'income' => $income, 'expenditure' => $expense, 'total_income' => Money::format($ti), 'total_expenditure' => Money::format($te), 'surplus' => Money::format($ti - $te)];
    }

    /** simplified, cash basis: assets = liabilities + equity + accumulated surplus */
    public function balanceSheet(string $asOf): array
    {
        $m = $this->movement(null, $asOf); $sections = ['asset' => [], 'liability' => [], 'equity' => []]; $totals = ['asset' => 0, 'liability' => 0, 'equity' => 0]; $surplus = 0;
        foreach (LedgerAccount::orderBy('code')->get() as $a) {
            [$d, $c] = $m[$a->id] ?? [0, 0]; if ($d === 0 && $c === 0) continue;
            if (in_array($a->type, ['income', 'expense'], true)) { $surplus += $c - $d; continue; }
            $amount = $a->type === 'asset' ? $d - $c : $c - $d;
            $sections[$a->type][] = ['code' => $a->code, 'name' => $a->name, 'amount' => Money::format($amount)]; $totals[$a->type] += $amount;
        }
        return ['as_of' => $asOf, 'assets' => $sections['asset'], 'liabilities' => $sections['liability'], 'equity' => $sections['equity'],
            'surplus' => Money::format($surplus), 'total_assets' => Money::format($totals['asset']),
            'total_liabilities_and_equity' => Money::format($totals['liability'] + $totals['equity'] + $surplus)];
    }

    /** accounting.md §4: used % = actual x 100 / budget (2 places, half up); variance = budget - actual; budget 0 -> null */
    public function budgetActual(int $budgetId): array
    {
        $budget = Budget::findOrFail($budgetId);
        [$from, $to] = self::fiscalRange($budget->fiscal_year);
        $m = $this->movement($from, $to); $rows = [];
        foreach (BudgetLine::where('budget_id', $budget->id)->get() as $line) {
            $a = LedgerAccount::findOrFail($line->account_id); [$d, $c] = $m[$a->id] ?? [0, 0];
            $actual = in_array($a->type, ['income', 'liability', 'equity'], true) ? $c - $d : $d - $c;
            $b = Money::toPaisa((string) $line->amount);
            $rows[] = ['code' => $a->code, 'name' => $a->name, 'budget' => Money::format($b), 'actual' => Money::format($actual),
                'variance' => Money::format($b - $actual), 'used_pct' => $b ? Money::format(Money::ratio($actual, 10000, $b)) : null];
        }
        return ['budget' => $budget->only(['id', 'name', 'fiscal_year', 'status']), 'from' => $from, 'to' => $to, 'rows' => $rows];
    }

    public function unposted(): array
    {
        return $this->posting->unposted();
    }

    /** '2027' = calendar year; '2026-2027' = 1 July 2026 to 30 June 2027 (the Bangladesh fiscal year) */
    public static function fiscalRange(string $year): array
    {
        if (preg_match('/^(\d{4})$/D', $year, $m)) return [$m[1].'-01-01', $m[1].'-12-31'];
        if (preg_match('/^(\d{4})-(\d{4})$/D', $year, $m) && (int) $m[2] === (int) $m[1] + 1) return [$m[1].'-07-01', $m[2].'-06-30'];
        throw \Illuminate\Validation\ValidationException::withMessages(['fiscal_year' => __('accounting.invalid')]);
    }
}
