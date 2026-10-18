<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, PlatformSetting, QbWithdrawalRequest, QbWriterWallet, User};
use App\Services\QbEarningService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// QB.10b (D66, docs/modules/question-bank.md §৪.৫): the Super Admin's side of the writers' money. The share of every sale and the
// minimum withdrawal are platform settings. A pending request is paid BY HAND (the platform never sends money itself): the Super
// Admin sends it by bank / bKash and records the transaction id - then the amount leaves the balance and the hold, once (a
// `withdrawal` ledger row, reference = that id); or rejects it with a reason - the hold is released. Every step is audit-logged.
class QbWithdrawalController extends Controller
{
    public function __construct(private QbEarningService $earnings) {}

    /** GET /super/qb/writer-settings */
    public function settings()
    {
        return response()->json(['success' => true, 'data' => ['share_percent' => QbEarningService::sharePercent(), 'min_withdrawal' => QbEarningController::minimum()]]);
    }

    /** PUT /super/qb/writer-settings {share_percent, min_withdrawal}: from the next sale on (past earnings keep their percent) */
    public function updateSettings(Request $request)
    {
        $f = $request->validate(['share_percent' => ['required', 'regex:/^\d{1,3}(\.\d{1,2})?$/'], 'min_withdrawal' => ['required', 'regex:/^\d{1,8}(\.\d{1,2})?$/']]);
        if (Money::toPaisa($f['share_percent']) > 10000) throw \Illuminate\Validation\ValidationException::withMessages(['share_percent' => __('validation.max.numeric', ['attribute' => 'share_percent', 'max' => 100])]);
        PlatformSetting::write(QbEarningService::SHARE_KEY, Money::format(Money::toPaisa($f['share_percent'])), $request->user()->id);
        PlatformSetting::write(QbEarningService::MIN_KEY, Money::format(Money::toPaisa($f['min_withdrawal'])), $request->user()->id);
        AuditLog::record('qb.writer_settings.updated', $request->user(), $f);
        return $this->settings();
    }

    /** GET /super/qb/withdrawals?status= : with each writer's name and wallet */
    public function index(Request $request)
    {
        $f = $request->validate(['status' => 'nullable|in:pending,paid,rejected']);
        $rows = QbWithdrawalRequest::when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByRaw("status = 'pending' DESC")->orderByDesc('id')->limit(300)->get();
        $names = User::platform()->whereIn('id', $rows->pluck('writer_user_id')->unique())->pluck('name', 'id');
        $wallets = QbWriterWallet::whereIn('writer_user_id', $rows->pluck('writer_user_id')->unique())->get()->keyBy('writer_user_id');
        return response()->json(['success' => true, 'data' => $rows->map(fn ($w) => QbEarningController::shape($w) + ['writer' => $names[$w->writer_user_id] ?? null,
            'balance' => $wallets[$w->writer_user_id]->balance ?? '0.00', 'held' => $wallets[$w->writer_user_id]->held ?? '0.00'])]);
    }

    /** POST /super/qb/withdrawals/{id}/pay {bank_transaction_id}: the money was sent by hand; the balance and the hold drop once */
    public function pay(Request $request, int $id)
    {
        $f = $request->validate(['bank_transaction_id' => 'required|string|max:100', 'note' => 'nullable|string|max:250']);
        $w = $this->process($id, function (QbWithdrawalRequest $w, QbWriterWallet $wallet) use ($request, $f) {
            $amount = Money::toPaisa((string) $w->amount);
            $wallet->update(['held' => Money::format(Money::toPaisa((string) $wallet->held) - $amount)]);
            $this->earnings->move($w->writer_user_id, 'withdrawal', -$amount, mb_substr("withdrawal:{$w->id}:{$f['bank_transaction_id']}", 0, 150), $request->user()->id);
            $w->update(['status' => 'paid', 'bank_transaction_id' => $f['bank_transaction_id'], 'note' => $f['note'] ?? null, 'processed_by' => $request->user()->id, 'processed_at' => now()]);
        });
        AuditLog::record('qb.withdrawal.paid', $w, ['amount' => $w->amount, 'bank_transaction_id' => $w->bank_transaction_id]);
        return response()->json(['success' => true, 'data' => QbEarningController::shape($w), 'message' => __('messages.saved')]);
    }

    /** POST /super/qb/withdrawals/{id}/reject {note}: the hold is released */
    public function reject(Request $request, int $id)
    {
        $f = $request->validate(['note' => 'required|string|max:250']);
        $w = $this->process($id, function (QbWithdrawalRequest $w, QbWriterWallet $wallet) use ($request, $f) {
            $wallet->update(['held' => Money::format(Money::toPaisa((string) $wallet->held) - Money::toPaisa((string) $w->amount))]);
            $w->update(['status' => 'rejected', 'note' => $f['note'], 'processed_by' => $request->user()->id, 'processed_at' => now()]);
        });
        AuditLog::record('qb.withdrawal.rejected', $w, ['amount' => $w->amount]);
        return response()->json(['success' => true, 'data' => QbEarningController::shape($w), 'message' => __('messages.saved')]);
    }

    /** Locks the request and the wallet; only a pending request moves on (a second pay / reject is a 422) */
    private function process(int $id, \Closure $fn): QbWithdrawalRequest
    {
        return DB::transaction(function () use ($id, $fn) {
            $w = QbWithdrawalRequest::lockForUpdate()->findOrFail($id);
            if ($w->status !== 'pending') throw new BusinessException('already processed', 'qb_withdrawal_processed', 422);
            $wallet = QbWriterWallet::where('writer_user_id', $w->writer_user_id)->lockForUpdate()->firstOrFail();
            $fn($w, $wallet);
            return $w->fresh();
        });
    }
}
