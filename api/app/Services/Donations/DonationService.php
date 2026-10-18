<?php

namespace App\Services\Donations;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Donation, DonationCampaign, DonationFund, Donor, Expense, User};
use App\Services\CashBookService;
use App\Support\{Money, Tenancy};
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\ValidationException;

/**
 * R3.11 (docs/modules/donations.md, D39/D32): money donations with DON-{YYYY}-{seq} receipts, reversal as a new row, and the
 * restricted-fund guard. The system enforces only the institution's own fund rules; it gives no religious or legal ruling.
 */
class DonationService
{
    public const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'cheque'];

    public function record(User $actor, array $input): Donation
    {
        if (array_diff(array_keys($input), ['donor_id', 'fund_id', 'campaign_id', 'amount', 'method', 'received_on', 'purpose_note'])) $this->invalid('donation');
        $data = Validator::make($input, ['donor_id' => 'nullable|integer|min:1', 'fund_id' => 'required|integer|min:1', 'campaign_id' => 'nullable|integer|min:1',
            'amount' => ['required', 'regex:/^\d{1,10}(\.\d{1,2})?$/'], 'method' => 'sometimes|in:'.implode(',', self::METHODS),
            'received_on' => 'sometimes|date_format:Y-m-d|before_or_equal:today', 'purpose_note' => 'nullable|string|max:255'])->validate();
        if (Money::toPaisa((string) $data['amount']) <= 0) $this->invalid('amount');
        $data += ['method' => 'cash', 'received_on' => now()->toDateString()];
        return DB::transaction(function () use ($actor, $data) {
            $cashbook = app(CashBookService::class); $cashbook->lockInstitution();
            $cashbook->assertCashWrite($data['received_on'], $data['method']);
            $fund = DonationFund::findOrFail($data['fund_id']);
            if (!$fund->is_active) $this->invalid('fund_id');
            if (!empty($data['donor_id'])) Donor::findOrFail($data['donor_id']);
            if (!empty($data['campaign_id']) && DonationCampaign::findOrFail($data['campaign_id'])->fund_id !== $fund->id) $this->invalid('campaign_id');
            $donation = Donation::create($data + ['amount' => Money::format(Money::toPaisa((string) $data['amount'])), 'receipt_no' => $this->nextReceiptNo($data['received_on']),
                'status' => 'received', 'received_by' => $actor->id]);
            $this->audit($actor, $donation, 'received');
            return $donation;
        });
    }

    /** §2.2: a new `reversed` row (same fund, positive amount, reverses_id); the original never changes; once only */
    public function reverse(User $actor, int $id, array $input): Donation
    {
        Donation::findOrFail($id);
        $data = Validator::make($input, ['reason' => 'required|string|max:255', 'date' => 'sometimes|date_format:Y-m-d|before_or_equal:today'])->validate();
        return DB::transaction(function () use ($actor, $id, $data) {
            $cashbook = app(CashBookService::class); $cashbook->lockInstitution();
            $original = Donation::lockForUpdate()->findOrFail($id);
            if ($original->status !== 'received') $this->invalid('donation');
            if (Donation::where('reverses_id', $original->id)->exists()) throw new BusinessException(__('donations.already_reversed'), 'already_reversed', 422);
            $date = $data['date'] ?? now()->toDateString();
            $cashbook->assertCashWrite($date, $original->method);
            // a restricted fund cannot be reversed below what has already been spent from it
            $this->assertCovers($original->fund_id, Money::toPaisa((string) $original->amount));
            $reversal = Donation::create(['donor_id' => $original->donor_id, 'fund_id' => $original->fund_id, 'campaign_id' => $original->campaign_id,
                'amount' => $original->amount, 'method' => $original->method, 'received_on' => $date, 'receipt_no' => $this->nextReceiptNo($date),
                'purpose_note' => mb_substr('Reversal of '.$original->receipt_no.': '.$data['reason'], 0, 255), 'status' => 'reversed',
                'reverses_id' => $original->id, 'received_by' => $actor->id]);
            $this->audit($actor, $original, 'reversed', ['reversal_id' => $reversal->id]);
            return $reversal;
        });
    }

    /** §2.2: Σ received − Σ reversed − Σ expenses of the fund (expense rows are signed, so a cancelled expense returns its money) */
    public function balance(int $fundId, ?string $from = null, ?string $to = null): array
    {
        $rows = Donation::where('fund_id', $fundId)->when($from, fn ($q) => $q->where('received_on', '>=', $from))->when($to, fn ($q) => $q->where('received_on', '<=', $to))->get(['amount', 'status']);
        $in = $rows->where('status', 'received')->sum(fn ($r) => Money::toPaisa((string) $r->amount));
        $back = $rows->where('status', 'reversed')->sum(fn ($r) => Money::toPaisa((string) $r->amount));
        $spent = Expense::where('fund_id', $fundId)->when($from, fn ($q) => $q->where('expense_date', '>=', $from))->when($to, fn ($q) => $q->where('expense_date', '<=', $to))
            ->get(['amount'])->sum(fn ($r) => Money::toPaisa((string) $r->amount));
        return ['received' => $in, 'reversed' => $back, 'spent' => $spent, 'balance' => $in - $back - $spent];
    }

    /** §2.3 / D39: spending `paisa` from a restricted fund needs balance ≥ paisa (caller holds the institution lock) */
    public function assertCovers(?int $fundId, int $paisa): void
    {
        if (!$fundId || $paisa <= 0) return;
        $fund = DonationFund::findOrFail($fundId);
        if ($fund->restricted && $this->balance($fund->id)['balance'] < $paisa) throw new BusinessException(__('donations.fund_overdrawn'), 'fund_overdrawn', 422);
    }

    /** §2.1: DON-{YYYY}-{seq}, under the caller's institution lock */
    public function nextReceiptNo(string $date): string
    {
        $prefix = 'DON-'.substr($date, 0, 4).'-';
        $last = Donation::where('receipt_no', 'like', $prefix.'%')->orderByDesc('receipt_no')->value('receipt_no');
        return $prefix.str_pad((string) ($last ? (int) substr($last, strlen($prefix)) + 1 : 1), 5, '0', STR_PAD_LEFT);
    }

    public function progress(int $campaignId): array
    {
        $c = DonationCampaign::findOrFail($campaignId);
        $rows = Donation::where('campaign_id', $c->id)->get(['amount', 'status']);
        $raised = $rows->sum(fn ($r) => ($r->status === 'received' ? 1 : -1) * Money::toPaisa((string) $r->amount));
        $goal = $c->goal_amount === null ? 0 : Money::toPaisa((string) $c->goal_amount);
        return ['campaign' => $c->only(['id', 'fund_id', 'title', 'status']), 'goal' => $c->goal_amount === null ? null : Money::format($goal),
            'raised' => Money::format($raised), 'percent' => $goal > 0 ? Money::format(Money::ratio($raised, 10000, $goal)) : null];
    }

    private function audit(User $actor, Donation $donation, string $event, array $data = []): void
    {
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $actor->id, 'action' => 'donation.'.$event, 'model' => 'Donation', 'model_id' => $donation->id, 'new_data' => $data]);
    }

    private function invalid(string $field): never { throw ValidationException::withMessages([$field => __('donations.invalid')]); }
}
