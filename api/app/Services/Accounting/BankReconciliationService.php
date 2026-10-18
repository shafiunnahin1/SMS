<?php

namespace App\Services\Accounting;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, LedgerAccount, Voucher, VoucherLine, User};
use App\Support\{Money, Tenancy};
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * R3.10 (accounting.md §5): reconcile bank/mobile ledger lines against a statement with the generic columns
 * date, description, debit, credit, reference. Suggestions match amount within ±3 days; the user confirms; a line matches once.
 * No bank-specific statement format is assumed.
 */
class BankReconciliationService
{
    public function show(int $accountId): array
    {
        $account = $this->account($accountId);
        $lines = $this->lines($account)->get();
        return ['account' => $account->only(['id', 'code', 'name']),
            'unreconciled' => $lines->whereNull('reconciled_at')->values()->map(fn ($l) => $this->row($l))->all(),
            'reconciled' => $lines->whereNotNull('reconciled_at')->values()->map(fn ($l) => $this->row($l) + ['reconciled_ref' => $l->reconciled_ref])->all()];
    }

    /** parse statement CSV text and propose matches; nothing is written */
    public function import(int $accountId, string $csv): array
    {
        $account = $this->account($accountId);
        $rows = array_values(array_filter(array_map('str_getcsv', preg_split('/\r\n|\n|\r/', trim($csv))), fn ($r) => $r !== [null] && $r !== ['']));
        if (!$rows || count($rows) > 2001) $this->invalid('statement');
        if (strtolower(trim((string) $rows[0][0])) === 'date') array_shift($rows);
        $open = $this->lines($account)->whereNull('reconciled_at')->get(); $taken = []; $matches = []; $unmatched = [];
        foreach ($rows as $n => $r) {
            if (count($r) < 5 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($r[0]))) $this->invalid('statement');
            [$date, $desc, $debit, $credit, $ref] = array_map('trim', array_slice($r, 0, 5));
            $out = Money::toPaisa($debit ?: '0'); $in = Money::toPaisa($credit ?: '0');
            // a statement credit (money into the bank) is a ledger debit on the bank account, and the other way round
            $candidate = $open->first(function ($l) use ($in, $out, $date, $taken) {
                if (in_array($l->id, $taken, true)) return false;
                $d = Money::toPaisa((string) $l->debit); $c = Money::toPaisa((string) $l->credit);
                $days = abs(CarbonImmutable::parse($l->voucher->date)->diffInDays(CarbonImmutable::parse($date)));
                return $days <= 3 && (($in > 0 && $d === $in) || ($out > 0 && $c === $out));
            });
            if ($candidate) { $taken[] = $candidate->id; $matches[] = ['statement_row' => $n + 1, 'reference' => $ref, 'line_id' => $candidate->id, 'line' => $this->row($candidate)]; }
            else $unmatched[] = ['statement_row' => $n + 1, 'date' => $date, 'description' => $desc, 'debit' => Money::format($out), 'credit' => Money::format($in), 'reference' => $ref];
        }
        return ['matches' => $matches, 'unmatched_statement' => $unmatched];
    }

    public function match(User $actor, int $accountId, array $input): array
    {
        $account = $this->account($accountId);
        if (!isset($input['line_id'], $input['reference']) || !is_string($input['reference']) || trim($input['reference']) === '' || mb_strlen($input['reference']) > 50) $this->invalid('reference');
        $line = $this->lines($account)->whereKey((int) $input['line_id'])->firstOrFail();
        if ($line->reconciled_at) throw new BusinessException(__('accounting.conflict'), 'already_reconciled', 409);
        $line->fill(['reconciled_at' => now(), 'reconciled_ref' => trim($input['reference'])])->save();
        $this->audit($actor, $line, 'matched');
        return $this->row($line) + ['reconciled_ref' => $line->reconciled_ref];
    }

    public function unmatch(User $actor, int $accountId, array $input): array
    {
        $account = $this->account($accountId);
        $line = $this->lines($account)->whereKey((int) ($input['line_id'] ?? 0))->firstOrFail();
        if (!$line->reconciled_at) throw new BusinessException(__('accounting.conflict'), 'not_reconciled', 409);
        $line->fill(['reconciled_at' => null, 'reconciled_ref' => null])->save();
        $this->audit($actor, $line, 'unmatched');
        return $this->row($line);
    }

    private function account(int $id): LedgerAccount
    {
        $account = LedgerAccount::findOrFail($id);
        if (!$account->is_cash_or_bank || $account->code === '1100') $this->invalid('account');   // bank or mobile money, not the cash drawer
        return $account;
    }

    private function lines(LedgerAccount $account)
    {
        return VoucherLine::with('voucher:id,date,voucher_no,narration')->where('account_id', $account->id)
            ->whereIn('voucher_id', Voucher::whereIn('status', ['posted', 'reversed'])->select('id'))->orderBy('id');
    }

    private function row(VoucherLine $l): array
    {
        return ['id' => $l->id, 'date' => $l->voucher->date->toDateString(), 'voucher_no' => $l->voucher->voucher_no, 'narration' => $l->voucher->narration,
            'debit' => (string) $l->debit, 'credit' => (string) $l->credit];
    }

    private function audit(User $actor, VoucherLine $line, string $event): void
    {
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $actor->id, 'action' => 'accounting.bank.'.$event, 'model' => 'VoucherLine', 'model_id' => $line->id, 'new_data' => []]);
    }

    private function invalid(string $field): never { throw ValidationException::withMessages([$field => __('accounting.invalid')]); }
}
