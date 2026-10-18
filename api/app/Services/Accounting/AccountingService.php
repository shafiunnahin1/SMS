<?php

namespace App\Services\Accounting;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, LedgerAccount, Voucher, VoucherLine, User};
use App\Support\{Money, Tenancy};
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\ValidationException;

/**
 * R3.10 (docs/modules/accounting.md §1-§2, §5, D36): chart of accounts, voucher numbering, posting and reversal.
 * Every voucher balances to the paisa; posted vouchers are final (a reversal is a new opposite voucher); nothing posts before
 * settings.accounting.start_date or on/before locked_until; manual vouchers never touch the 4300.* donation-fund accounts.
 */
class AccountingService
{
    /** accounting.md §2 sample chart (the institution's accountant confirms names; not verified against Bangladesh standards) */
    public const CHART = [
        ['1100', 'হাতে নগদ', 'asset', true], ['1200', 'ব্যাংক', 'asset', true], ['1300', 'মোবাইল ব্যাংকিং (bKash/Nagad…)', 'asset', true],
        ['1400', 'কর্মীর অগ্রিম', 'asset', false], ['1500', 'মজুত (inventory)', 'asset', false], ['2100', 'PF প্রদেয়', 'liability', false],
        ['3100', 'সাধারণ তহবিল / আদি জের', 'equity', false], ['4110', 'টিউশন ও ফি', 'income', false], ['4200', 'ভর্তি / আবেদন ফি', 'income', false],
        ['4300', 'দান ও অনুদান', 'income', false], ['4400', 'স্টোর বিক্রয়', 'income', false], ['4900', 'অন্যান্য আয়', 'income', false],
        ['5100', 'বেতন ও ভাতা', 'expense', false], ['5110', 'PF (নিয়োগকর্তা-অংশ)', 'expense', false], ['5200', 'ইউটিলিটি', 'expense', false],
        ['5300', 'ভাড়া', 'expense', false], ['5400', 'মেরামত/রক্ষণাবেক্ষণ', 'expense', false], ['5500', 'স্টেশনারি', 'expense', false],
        ['5700', 'বিক্রিত পণ্যের ব্যয় (COGS)', 'expense', false], ['5900', 'অন্যান্য ব্যয়', 'expense', false],
    ];
    private const PREFIX = ['journal' => 'JV', 'receipt' => 'RV', 'payment' => 'PV', 'contra' => 'CV'];

    public function ensureChart(): void
    {
        if (LedgerAccount::where('code', '1100')->exists()) return;
        foreach (self::CHART as [$code, $name, $type, $cash])
            LedgerAccount::firstOrCreate(['code' => $code], ['name' => $name, 'type' => $type, 'is_cash_or_bank' => $cash, 'is_system' => true]);
    }

    /** an account by code; sub-accounts such as 4110.<category> are created on first use under their parent */
    public function account(string $code, ?string $name = null): LedgerAccount
    {
        $this->ensureChart();
        if ($found = LedgerAccount::where('code', $code)->first()) return $found;
        [$parentCode] = explode('.', $code, 2);
        if ($parentCode === $code) $this->invalid('account');
        $parent = LedgerAccount::where('code', $parentCode)->first() ?? $this->invalid('account');
        return LedgerAccount::create(['code' => $code, 'name' => $name ?? $parent->name.' '.substr($code, strlen($parentCode) + 1),
            'type' => $parent->type, 'parent_id' => $parent->id, 'is_cash_or_bank' => $parent->is_cash_or_bank, 'is_system' => true]);
    }

    /** payment method -> cash/bank/mobile account (cash basis; only `cash` is the cash-book drawer) */
    public function moneyAccount(?string $method): LedgerAccount
    {
        return $this->account(match ($method) { 'cash' => '1100', 'bkash', 'nagad', 'rocket' => '1300', default => '1200' });
    }

    public function settings(): array
    {
        $s = data_get(Tenancy::current()->settings ?? [], 'accounting', []);
        return array_replace(['start_date' => null, 'locked_until' => null, 'expense_map' => []], is_array($s) ? $s : []);
    }

    /** the date rules every posting obeys (§1.4, §1.5) */
    public function assertPostable(string $date): void
    {
        $s = $this->settings();
        if (!$s['start_date']) throw new BusinessException(__('accounting.not_started'), 'accounting_not_started', 422);
        if ($date < $s['start_date']) throw new BusinessException(__('accounting.before_start'), 'accounting_before_start', 422);
        if ($s['locked_until'] && $date <= $s['locked_until']) throw new BusinessException(__('accounting.locked'), 'accounting_locked', 422);
    }

    /**
     * Create a voucher (draft, or posted when $post) from [[account_code|account_id, debit, credit, memo?]].
     * Source vouchers use a unique (source, source_id) key, so a retry finds the first voucher instead of making a second.
     */
    public function create(array $data, array $lines, ?User $actor, bool $post = false, bool $automatic = false): Voucher
    {
        $v = Validator::make($data, ['type' => 'required|in:journal,receipt,payment,contra', 'date' => 'required|date_format:Y-m-d',
            'narration' => 'nullable|string|max:255', 'source' => 'sometimes|string|max:12', 'source_id' => 'sometimes|nullable|integer|min:1'])->validate();
        return DB::transaction(function () use ($v, $lines, $actor, $post, $automatic) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $source = $v['source'] ?? 'manual';
            if ($source !== 'manual' && isset($v['source_id']) && ($existing = Voucher::where('source', $source)->where('source_id', $v['source_id'])->first())) return $existing->load('lines');
            $rows = $this->lines($lines, $automatic);
            if ($post) $this->assertPostable($v['date']);
            $voucher = Voucher::create(['voucher_no' => $this->nextNumber($v['type'], $v['date']), 'type' => $v['type'], 'date' => $v['date'],
                'narration' => $v['narration'] ?? null, 'source' => $source, 'source_id' => $v['source_id'] ?? null,
                'status' => $post ? 'posted' : 'draft', 'created_by' => $actor?->id, 'posted_by' => $post ? $actor?->id : null, 'posted_at' => $post ? now() : null]);
            foreach ($rows as $row) VoucherLine::create($row + ['voucher_id' => $voucher->id]);
            if ($actor) $this->audit($actor, $voucher, $post ? 'posted' : 'created', ['source' => $source]);
            return $voucher->load('lines');
        });
    }

    public function post(User $actor, int $id): Voucher
    {
        return DB::transaction(function () use ($actor, $id) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $voucher = Voucher::with('lines')->findOrFail($id);
            if ($voucher->status === 'posted') return $voucher;
            if ($voucher->status !== 'draft') $this->conflict();
            $this->lines($voucher->lines->map(fn ($l) => ['account_id' => $l->account_id, 'debit' => (string) $l->debit, 'credit' => (string) $l->credit])->all(), $voucher->source !== 'manual');
            $this->assertPostable($voucher->date->toDateString());
            $voucher->fill(['status' => 'posted', 'posted_by' => $actor->id, 'posted_at' => now()])->save();
            $this->audit($actor, $voucher, 'posted');
            return $voucher->fresh('lines');
        });
    }

    /** §1.2: a reversal is a new voucher with swapped lines (status reversed, reverses_id); the original stays as it was */
    public function reverse(User $actor, int $id, string $reason, ?string $date = null): Voucher
    {
        if (trim($reason) === '' || mb_strlen($reason) > 255) $this->invalid('reason');
        return DB::transaction(function () use ($actor, $id, $reason, $date) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $original = Voucher::with('lines')->findOrFail($id);
            if ($original->status !== 'posted') $this->conflict();
            if (Voucher::where('reverses_id', $original->id)->exists()) throw new BusinessException(__('accounting.already_reversed'), 'already_reversed', 422);
            $date ??= now()->toDateString();
            $this->assertPostable($date);
            $reversal = Voucher::create(['voucher_no' => $this->nextNumber($original->type, $date), 'type' => $original->type, 'date' => $date,
                'narration' => mb_substr('Reversal of '.$original->voucher_no.': '.$reason, 0, 255), 'source' => 'manual', 'status' => 'reversed',
                'reverses_id' => $original->id, 'created_by' => $actor->id, 'posted_by' => $actor->id, 'posted_at' => now()]);
            foreach ($original->lines as $l) VoucherLine::create(['voucher_id' => $reversal->id, 'account_id' => $l->account_id,
                'debit' => (string) $l->credit, 'credit' => (string) $l->debit, 'memo' => $l->memo]);
            $this->audit($actor, $original, 'reversed', ['reason' => $reason, 'reversal_id' => $reversal->id]);
            return $reversal->load('lines');
        });
    }

    /** §5 opening wizard: one journal on the start date; any difference balances against 3100 */
    public function opening(User $actor, array $balances): Voucher
    {
        $start = $this->settings()['start_date'];
        if (!$start) throw new BusinessException(__('accounting.not_started'), 'accounting_not_started', 422);
        if (Voucher::where('source', 'opening')->exists()) $this->conflict();
        $lines = []; $dr = 0; $cr = 0;
        foreach ($balances as $row) {
            if (!is_array($row)) $this->invalid('balances');
            foreach (['debit', 'credit'] as $side) if (!preg_match('/^\d{1,10}(\.\d{1,2})?$/D', (string) ($row[$side] ?? '0'))) $this->invalid('balances');
            $d = Money::toPaisa((string) ($row['debit'] ?? '0')); $c = Money::toPaisa((string) ($row['credit'] ?? '0'));
            $lines[] = ['account_code' => (string) ($row['account_code'] ?? ''), 'debit' => Money::format($d), 'credit' => Money::format($c)];
            $dr += $d; $cr += $c;
        }
        if ($dr !== $cr) $lines[] = ['account_code' => '3100', 'debit' => Money::format(max(0, $cr - $dr)), 'credit' => Money::format(max(0, $dr - $cr)), 'memo' => 'opening difference'];
        return $this->create(['type' => 'journal', 'date' => $start, 'narration' => 'Opening balances', 'source' => 'opening', 'source_id' => 1], $lines, $actor, true);
    }

    /** §1.1: Σdebit = Σcredit to the paisa; each line one-sided and positive; manual lines never touch 4300.* */
    private function lines(array $lines, bool $automatic): array
    {
        if (count($lines) < 2 || count($lines) > 200) $this->invalid('lines');
        $rows = []; $dr = 0; $cr = 0;
        foreach ($lines as $line) {
            if (!is_array($line)) $this->invalid('lines');
            $account = isset($line['account_id']) ? LedgerAccount::find($line['account_id']) : (isset($line['account_code']) && $line['account_code'] !== '' ? $this->account((string) $line['account_code']) : null);
            if (!$account || !$account->is_active) $this->invalid('lines');
            if (!$automatic && ($account->code === '4300' || str_starts_with($account->code, '4300.'))) throw new BusinessException(__('accounting.fund_account'), 'fund_account', 422);
            foreach (['debit', 'credit'] as $side) if (!preg_match('/^\d{1,10}(\.\d{1,2})?$/D', (string) ($line[$side] ?? '0'))) $this->invalid('lines');
            $d = Money::toPaisa((string) ($line['debit'] ?? '0')); $c = Money::toPaisa((string) ($line['credit'] ?? '0'));
            if (($d > 0) === ($c > 0)) $this->invalid('lines');   // exactly one side per line
            $dr += $d; $cr += $c;
            $rows[] = ['account_id' => $account->id, 'debit' => Money::format($d), 'credit' => Money::format($c), 'memo' => isset($line['memo']) ? mb_substr((string) $line['memo'], 0, 255) : null];
        }
        if ($dr !== $cr) throw new BusinessException(__('accounting.unbalanced'), 'voucher_unbalanced', 422);
        return $rows;
    }

    /** §5: {JV|RV|PV|CV}-{YYYY}-{seq} per type, under the caller's institution lock */
    private function nextNumber(string $type, string $date): string
    {
        $prefix = self::PREFIX[$type].'-'.substr($date, 0, 4).'-';
        $last = Voucher::where('voucher_no', 'like', $prefix.'%')->orderByDesc('voucher_no')->value('voucher_no');
        return $prefix.str_pad((string) (($last ? (int) substr($last, strlen($prefix)) : 0) + 1), 5, '0', STR_PAD_LEFT);
    }

    private function audit(User $actor, Voucher $voucher, string $event, array $data = []): void
    {
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $actor->id, 'action' => 'accounting.voucher.'.$event,
            'model' => 'Voucher', 'model_id' => $voucher->id, 'new_data' => $data]);
    }

    private function invalid(string $field): never { throw ValidationException::withMessages([$field => __('accounting.invalid')]); }
    private function conflict(): never { throw new BusinessException(__('accounting.conflict'), 'accounting_conflict', 409); }
}
