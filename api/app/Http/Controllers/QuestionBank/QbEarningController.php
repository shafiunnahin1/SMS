<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, PlatformSetting, QbWithdrawalRequest, QbWriterEarning, QbWriterWallet, QbWriterWalletTxn};
use App\Services\QbEarningService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// QB.10b (D66, docs/modules/question-bank.md §৪.৫): the writer's own money on the central host - balance, the part held by pending
// withdrawal requests, sales per item, the ledger; a new request holds its amount (available = balance - held, at least the
// Super Admin's minimum) until the Super Admin pays or rejects it (QbWithdrawalController). Only the writer's own rows.
class QbEarningController extends Controller
{
    /** GET /writer/earnings */
    public function summary(Request $request)
    {
        $uid = $request->user()->id;
        $wallet = QbWriterWallet::where('writer_user_id', $uid)->first();
        [$balance, $held] = [Money::toPaisa((string) ($wallet->balance ?? '0')), Money::toPaisa((string) ($wallet->held ?? '0'))];
        $sales = QbWriterEarning::where('writer_user_id', $uid)->selectRaw('item_type, item_id, COUNT(*) AS sales, SUM(amount) AS earned')
            ->groupBy('item_type', 'item_id')->orderByDesc('sales')->limit(200)->get()
            ->map(fn ($r) => ['item_type' => $r->item_type, 'item_id' => (int) $r->item_id, 'sales' => (int) $r->sales, 'earned' => Money::format(Money::toPaisa((string) $r->earned))]);
        $ledger = QbWriterWalletTxn::where('writer_user_id', $uid)->orderByDesc('id')->limit(100)->get()
            ->map(fn ($t) => $t->only(['id', 'type', 'amount', 'balance_after', 'reference']) + ['created_at' => $t->created_at?->toIso8601String()]);
        return response()->json(['success' => true, 'data' => [
            'balance' => Money::format($balance), 'held' => Money::format($held), 'available' => Money::format($balance - $held),
            'total_earned' => Money::format(Money::toPaisa((string) (QbWriterEarning::where('writer_user_id', $uid)->sum('amount') ?: '0'))),
            'share_percent' => QbEarningService::sharePercent(), 'min_withdrawal' => self::minimum(),
            'sales' => $sales, 'ledger' => $ledger]]);
    }

    /** GET /writer/withdrawals: the writer's own requests (their own payout account shown back to them) */
    public function withdrawals(Request $request)
    {
        $rows = QbWithdrawalRequest::where('writer_user_id', $request->user()->id)->orderByDesc('id')->limit(100)->get()->map(fn ($w) => self::shape($w));
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** POST /writer/withdrawals {amount, payout_method, payout_account}: holds the amount */
    public function requestWithdrawal(Request $request)
    {
        $f = $request->validate(['amount' => ['required', 'regex:/^\d{1,8}(\.\d{1,2})?$/'], 'payout_method' => 'required|in:bank,bkash',
            'payout_account' => ['required', 'string', 'max:300', $request->input('payout_method') === 'bkash' ? 'regex:/^01[3-9]\d{8}$/' : 'min:6']]);
        $uid = $request->user()->id;
        $amount = Money::toPaisa($f['amount']);
        if ($amount <= 0 || $amount < Money::toPaisa(self::minimum())) throw new BusinessException('below the minimum', 'qb_withdrawal_below_minimum', 422, ['min' => self::minimum()]);
        $w = DB::transaction(function () use ($uid, $amount, $f) {
            $wallet = QbWriterWallet::where('writer_user_id', $uid)->lockForUpdate()->first();
            $available = $wallet ? Money::toPaisa((string) $wallet->balance) - Money::toPaisa((string) $wallet->held) : 0;
            if ($amount > $available) throw new BusinessException('more than the available balance', 'qb_withdrawal_too_much', 422, ['available' => Money::format(max(0, $available))]);
            $wallet->update(['held' => Money::format(Money::toPaisa((string) $wallet->held) + $amount)]);
            return QbWithdrawalRequest::create(['writer_user_id' => $uid, 'amount' => Money::format($amount), 'payout_method' => $f['payout_method'],
                'payout_account' => $f['payout_account'], 'status' => 'pending', 'requested_at' => now()]);
        });
        AuditLog::record('qb.withdrawal.requested', $w, ['amount' => $w->amount, 'method' => $w->payout_method]);
        return response()->json(['success' => true, 'data' => self::shape($w), 'message' => __('messages.saved')], 201);
    }

    public static function minimum(): string
    {
        return Money::format(Money::toPaisa((string) (PlatformSetting::read(QbEarningService::MIN_KEY) ?? '0')));
    }

    public static function shape(QbWithdrawalRequest $w): array
    {
        return $w->only(['id', 'writer_user_id', 'amount', 'payout_method', 'payout_account', 'status', 'bank_transaction_id', 'note'])
            + ['requested_at' => $w->requested_at?->toIso8601String(), 'processed_at' => $w->processed_at?->toIso8601String()];
    }
}
