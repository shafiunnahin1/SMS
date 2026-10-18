<?php

namespace App\Services\Accounting;

use App\Exceptions\BusinessException;
use App\Models\{Donation, DonationFund, Expense, FeeCategory, FeePayment, FeeRefund, InventoryItem, InventoryMovement, PayrollItem, PayrollRun, ProvidentFundEntry, SalaryAdvance, Voucher};
use App\Services\ModuleGate;
use App\Support\{Money, Tenancy};
use Illuminate\Support\Collection;

/**
 * R3.10 (accounting.md §3): one automatic voucher per source record, from server-owned rows only. A source that cannot post
 * (before start_date, locked period, unsupported case) stays "unposted" and is listed by unposted(); repost() retries idempotently.
 * Expense rows written by refunds, payroll and advances are not posted as expenses - those sources post themselves (no double count).
 */
class AccountingPostingService
{
    public const SOURCES = ['fee', 'refund', 'expense', 'payroll', 'advance', 'store', 'donation'];
    private const OWN_EXPENSE_SOURCES = ['refund', 'payroll', 'advance', 'store'];

    public function __construct(private AccountingService $accounting) {}

    public function enabled(): bool
    {
        $institution = Tenancy::current();
        return $institution && app(ModuleGate::class)->allows($institution, 'accounting') && $this->accounting->settings()['start_date'];
    }

    /** post one source record; null = nothing to post (not applicable or before start); throws when it should post but cannot */
    public function post(string $source, int $id): ?Voucher
    {
        if (!$this->enabled()) return null;
        if (!in_array($source, self::SOURCES, true)) throw new \InvalidArgumentException('source');
        if ($existing = Voucher::where('source', $source)->where('source_id', $id)->first()) return $existing;
        $plan = $this->plan($source, $id);
        if (!$plan || $plan['date'] < $this->accounting->settings()['start_date']) return null;
        return $this->accounting->create(['type' => $plan['type'], 'date' => $plan['date'], 'narration' => $plan['narration'], 'source' => $source, 'source_id' => $id],
            $plan['lines'], null, true, true);
    }

    /** §3 "unposted sources": every applicable source record from start_date on without its voucher */
    public function unposted(): array
    {
        if (!$this->enabled()) return [];
        $out = [];
        foreach ($this->candidates() as [$source, $id, $date]) {
            if (Voucher::where('source', $source)->where('source_id', $id)->exists()) continue;
            $out[] = ['source' => $source, 'source_id' => $id, 'date' => $date];
        }
        return $out;
    }

    /** §5 repost: retry every unposted source in [from, to]; idempotent; returns counts */
    public function repost(string $from, string $to): array
    {
        $posted = 0; $failed = [];
        foreach ($this->unposted() as $row) {
            if ($row['date'] < $from || $row['date'] > $to) continue;
            try { if ($this->post($row['source'], $row['source_id'])) $posted++; }
            catch (BusinessException $e) { $failed[] = $row + ['error' => $e->errorCode]; }
        }
        return ['posted' => $posted, 'failed' => $failed];
    }

    /** @return array<array{0:string,1:int,2:string}> */
    private function candidates(): array
    {
        $start = $this->accounting->settings()['start_date']; $rows = [];
        foreach (FeePayment::where('line_no', 1)->where('paid_amount', '>', 0)->whereNull('reverses_id')->where('paid_at', '>=', $start)->get(['id', 'paid_at']) as $r) $rows[] = ['fee', $r->id, $r->paid_at->toDateString()];
        foreach (FeeRefund::where('status', 'processed')->where('processed_at', '>=', $start)->get(['id', 'processed_at']) as $r) $rows[] = ['refund', $r->id, $r->processed_at->toDateString()];
        foreach (Expense::whereNotIn('source', self::OWN_EXPENSE_SOURCES)->where('expense_date', '>=', $start)->get(['id', 'expense_date']) as $r) $rows[] = ['expense', $r->id, $r->expense_date->toDateString()];
        foreach (PayrollRun::where('status', 'paid')->where('paid_at', '>=', $start)->get(['id', 'paid_at']) as $r) $rows[] = ['payroll', $r->id, $r->paid_at->toDateString()];
        foreach (SalaryAdvance::whereNotNull('expense_id')->where('disbursed_at', '>=', $start)->get(['id', 'disbursed_at']) as $r) $rows[] = ['advance', $r->id, $r->disbursed_at->toDateString()];
        foreach (InventoryMovement::whereIn('type', ['sale', 'return'])->where('created_at', '>=', $start)->get(['id', 'created_at']) as $r) $rows[] = ['store', $r->id, $r->created_at->toDateString()];
        foreach (Donation::where('received_on', '>=', $start)->get(['id', 'received_on']) as $r) $rows[] = ['donation', $r->id, $r->received_on->toDateString()];
        return $rows;
    }

    /** @return array{type:string,date:string,narration:string,lines:array}|null */
    private function plan(string $source, int $id): ?array
    {
        return match ($source) {
            'fee' => $this->fee($id), 'refund' => $this->refund($id), 'expense' => $this->expense($id),
            'payroll' => $this->payroll($id), 'advance' => $this->advance($id), 'store' => $this->store($id), 'donation' => $this->donation($id),
        };
    }

    /** fee receipt: Dr money account of the method · Cr 4110.<fee_category> per line (source_id = the line_no 1 row) */
    private function fee(int $id): ?array
    {
        $first = FeePayment::find($id);
        if (!$first || (int) $first->line_no !== 1 || Money::toPaisa((string) $first->paid_amount) <= 0 || $first->reverses_id) return null;
        $lines = FeePayment::where('receipt_no', $first->receipt_no)->where('paid_amount', '>', 0)->whereNull('reverses_id')->orderBy('line_no')->get();
        $credits = []; $total = 0;
        foreach ($lines as $l) { $p = Money::toPaisa((string) $l->paid_amount); $credits[] = $this->line($this->income($l->fee_category_id), 0, $p); $total += $p; }
        return ['type' => 'receipt', 'date' => $first->paid_at->toDateString(), 'narration' => 'Fee receipt '.$first->receipt_no,
            'lines' => [$this->line($this->accounting->moneyAccount($first->payment_method)->code, $total, 0), ...$credits]];
    }

    /** fee refund: Dr 4110.<category> per refunded line · Cr money account of the refund method */
    private function refund(int $id): ?array
    {
        $r = FeeRefund::find($id);
        if (!$r || $r->status !== 'processed') return null;
        $debits = []; $total = 0;
        foreach ($r->refund_lines ?? [] as $line) {
            $p = Money::toPaisa((string) $line['amount']); if ($p <= 0) continue;
            $category = FeePayment::whereKey($line['fee_payment_id'])->value('fee_category_id');
            $debits[] = $this->line($this->income($category), $p, 0); $total += $p;
        }
        if ($total === 0) return null;
        return ['type' => 'payment', 'date' => $r->processed_at->toDateString(), 'narration' => 'Fee refund '.($r->reversal_receipt_no ?? '#'.$r->id),
            'lines' => [...$debits, $this->line($this->accounting->moneyAccount($r->method)->code, 0, $total)]];
    }

    /** expense: Dr mapped expense account (expense_map, else 5900) · Cr money; a negative (correction) row swaps the sides */
    private function expense(int $id): ?array
    {
        $e = Expense::find($id);
        if (!$e || in_array($e->source, self::OWN_EXPENSE_SOURCES, true)) return null;
        $p = Money::toPaisa((string) $e->amount); if ($p === 0) return null;
        $map = $this->accounting->settings()['expense_map'];
        $code = is_array($map) && isset($map[$e->category]) ? (string) $map[$e->category] : '5900';
        $money = $this->accounting->moneyAccount($e->payment_method)->code;
        $lines = $p > 0 ? [$this->line($code, $p, 0), $this->line($money, 0, $p)] : [$this->line($money, -$p, 0), $this->line($code, 0, -$p)];
        return ['type' => 'payment', 'date' => $e->expense_date->toDateString(), 'narration' => mb_substr('Expense: '.$e->title, 0, 255), 'lines' => $lines];
    }

    /**
     * payroll run, once it is fully paid: Dr 5100 (net + PF + advance recovery - PF withdrawal) · Cr 2100 PF · Cr 1400 recovery ·
     * Dr 2100 PF withdrawal · Cr money per method (net); employer PF: Dr 5110 · Cr 2100. A run with tax withheld stays unposted:
     * the sample chart has no tax-payable account, and inventing one is the accountant's call (accounting.md §2).
     */
    private function payroll(int $id): ?array
    {
        $run = PayrollRun::find($id);
        if (!$run || $run->status !== 'paid') return null;
        $items = PayrollItem::where('run_id', $run->id)->get();
        $sum = fn (string $source) => $items->sum(fn ($i) => collect($i->breakdown)->where('source', $source)->sum(fn ($l) => Money::toPaisa($l['amount'])));
        if ($sum('tax') > 0) throw new BusinessException(__('accounting.conflict'), 'payroll_tax_unmapped', 422);
        $pf = $sum('pf'); $recovery = $sum('advance'); $withdrawal = $sum('pf_withdrawal');
        $net = $items->groupBy('payment_method')->map(fn (Collection $g) => $g->sum(fn ($i) => Money::toPaisa((string) $i->net)));
        $employer = Money::toPaisa((string) ProvidentFundEntry::where('kind', 'employer')->whereIn('payroll_item_id', $items->pluck('id'))->sum('amount'));
        $salary = $net->sum() + $pf + $recovery - $withdrawal;
        $lines = [$this->line('5100', max(0, $salary), max(0, -$salary))];
        if ($withdrawal) $lines[] = $this->line('2100', $withdrawal, 0);
        if ($pf) $lines[] = $this->line('2100', 0, $pf);
        if ($recovery) $lines[] = $this->line('1400', 0, $recovery);
        foreach ($net as $method => $amount) if ($amount) $lines[] = $this->line($this->accounting->moneyAccount($method ?: null)->code, max(0, -$amount), max(0, $amount));
        if ($employer) { $lines[] = $this->line('5110', $employer, 0); $lines[] = $this->line('2100', 0, $employer); }
        return ['type' => 'payment', 'date' => $run->paid_at->toDateString(), 'narration' => 'Payroll '.$run->month.' '.$run->kind.($run->label !== '' ? ' '.$run->label : ''),
            'lines' => array_values(array_filter($lines, fn ($l) => $l['debit'] !== '0.00' || $l['credit'] !== '0.00'))];
    }

    /** salary advance disbursed: Dr 1400 · Cr money account of the disbursement */
    private function advance(int $id): ?array
    {
        $a = SalaryAdvance::find($id);
        if (!$a || !$a->expense_id) return null;
        $p = Money::toPaisa((string) $a->amount); $date = Expense::whereKey($a->expense_id)->value('expense_date');
        return ['type' => 'payment', 'date' => \Carbon\Carbon::parse($date)->toDateString(), 'narration' => 'Salary advance #'.$a->id,
            'lines' => [$this->line('1400', $p, 0), $this->line($this->accounting->moneyAccount($a->payment_method)->code, 0, $p)]];
    }

    /**
     * store sale: Dr money · Cr 4400, and Dr 5700 · Cr 1500 at the item's moving-average cost; a money-back return reverses both.
     * Receipts of stock (`receive`) carry no payment, so the supplier payment is an expense (map its category to 1500).
     */
    private function store(int $id): ?array
    {
        $m = InventoryMovement::find($id);
        if (!$m || !in_array($m->type, ['sale', 'return'], true)) return null;
        $price = Money::toPaisa((string) $m->total_amount);
        $avg = Money::toPaisa((string) InventoryItem::whereKey($m->item_id)->value('avg_cost'));
        $cost = Money::ratio($avg, Money::toPaisa((string) $m->qty), 100);
        $money = $this->accounting->moneyAccount($m->payment_method ?? 'cash')->code;
        $sale = $m->type === 'sale';
        $lines = $sale ? [$this->line($money, $price, 0), $this->line('4400', 0, $price)] : [$this->line('4400', $price, 0), $this->line($money, 0, $price)];
        if ($cost > 0) array_push($lines, ...($sale ? [$this->line('5700', $cost, 0), $this->line('1500', 0, $cost)] : [$this->line('1500', $cost, 0), $this->line('5700', 0, $cost)]));
        if ($price === 0 && $cost === 0) return null;
        return ['type' => $sale ? 'receipt' : 'payment', 'date' => $m->created_at->toDateString(), 'narration' => 'Store '.$m->type.' '.($m->receipt_no ?? '#'.$m->id),
            'lines' => array_values(array_filter($lines, fn ($l) => $l['debit'] !== '0.00' || $l['credit'] !== '0.00'))];
    }

    /** R3.11 donation: Dr money · Cr 4300.<fund_id>; a reversal row swaps the sides (accounting.md §3, donations.md §2.5) */
    private function donation(int $id): ?array
    {
        $d = Donation::find($id);
        if (!$d) return null;
        $p = Money::toPaisa((string) $d->amount); $fund = '4300.'.$d->fund_id;
        $this->accounting->account($fund, DonationFund::whereKey($d->fund_id)->value('name'));
        $money = $this->accounting->moneyAccount($d->method)->code;
        $received = $d->status === 'received';
        return ['type' => $received ? 'receipt' : 'payment', 'date' => $d->received_on->toDateString(), 'narration' => 'Donation '.$d->receipt_no,
            'lines' => $received ? [$this->line($money, $p, 0), $this->line($fund, 0, $p)] : [$this->line($fund, $p, 0), $this->line($money, 0, $p)]];
    }

    private function income(?int $categoryId): string
    {
        if (!$categoryId) return '4110';
        $code = '4110.'.$categoryId;
        $this->accounting->account($code, FeeCategory::whereKey($categoryId)->value('name'));
        return $code;
    }

    private function line(string $code, int $debit, int $credit): array
    {
        return ['account_code' => $code, 'debit' => Money::format($debit), 'credit' => Money::format($credit)];
    }
}
