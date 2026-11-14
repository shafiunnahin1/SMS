<?php

namespace App\Services\Wallet;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Institution, SmsCreditTransaction, User, WalletRechargeRequest};
use App\Notifications\GeneralNotification;
use App\Support\{Money, Tenancy};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;

// D218 WAL.1 (the central wallet, manual top-up): the wallet's owner files what they sent and where, with the receipt; a Super
// Admin approves - the wallet is credited ONCE (ledger row `purchase`, reference `manual:{id}`) - or rejects with a reason.
// The same method + transaction reference cannot be claimed twice anywhere on the platform while pending or approved.
class WalletRechargeService
{
    public const MIN = '1.00';
    public const MAX = '500000.00';

    /** $forUser: null = the institution's wallet; a user id = that student's wallet (D218 (5), WAL.3) */
    public function file(User $by, array $d, UploadedFile $receipt, ?int $forUser = null): WalletRechargeRequest
    {
        $amount = Money::toPaisa((string) $d['amount']);
        if ($amount < Money::toPaisa(self::MIN) || $amount > Money::toPaisa(self::MAX)) throw new BusinessException('amount out of range', 'wallet_amount_range', 422, ['min' => self::MIN, 'max' => self::MAX]);
        $ref = $this->normalRef($d['trx_reference']);
        return DB::transaction(function () use ($by, $d, $amount, $ref, $receipt, $forUser) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->first();
            if ($this->claimed($d['method'], $ref)) throw new BusinessException('this reference is already filed', 'wallet_reference_used', 422);
            $r = WalletRechargeRequest::create(['user_id' => $forUser, 'amount' => Money::format($amount), 'method' => $d['method'], 'trx_reference' => $ref,
                'note' => $d['note'] ?? null, 'status' => 'pending', 'requested_by' => $by->id]);
            $path = $receipt->storeAs('institutions/' . Tenancy::current()->id . '/wallet-receipts', $r->id . '-' . Str::uuid() . '.' . $receipt->extension(), 'private');
            if (!$path) throw new BusinessException('the file could not be saved', 'upload_failed', 422);
            $r->update(['receipt_path' => $path]);
            AuditLog::record('wallet.recharge_requested', $r, ['method' => $r->method]);
            return $r;
        });
    }

    /** an uppercase reference without spaces, so "abc 123" and "ABC123" are the same claim */
    public function normalRef(string $ref): string
    {
        return strtoupper(preg_replace('/\s+/', '', $ref));
    }

    /** across every institution: a transaction reference belongs to one payment only */
    public function claimed(string $method, string $ref): bool
    {
        return Tenancy::withoutTenancy(fn () => WalletRechargeRequest::where('method', $method)->where('trx_reference', $ref)->whereIn('status', ['pending', 'approved'])->exists());   // a reference is unique platform-wide
    }

    /** Super Admin (central host): inside the request's own institution */
    public function decide(int $id, User $superAdmin, bool $approve, ?string $note): WalletRechargeRequest
    {
        $institutionId = Tenancy::withoutTenancy(fn () => WalletRechargeRequest::whereKey($id)->value('institution_id')) ?? abort(404);   // which institution the request belongs to
        return Tenancy::as(Institution::findOrFail($institutionId), fn (Institution $i) => DB::transaction(function () use ($id, $superAdmin, $approve, $note, $i) {
            $locked = Institution::whereKey($i->id)->lockForUpdate()->first();
            $r = WalletRechargeRequest::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($r->status !== 'pending') throw new BusinessException('already decided', 'wallet_request_decided', 422);
            $r->update(['status' => $approve ? 'approved' : 'rejected', 'decided_by' => $superAdmin->id, 'decided_at' => now(), 'decision_note' => $note]);
            if ($approve && $r->user_id !== null) {   // D218 WAL.3: a student's wallet
                app(StudentWalletService::class)->move(User::findOrFail($r->user_id), 'recharge', Money::toPaisa($r->amount), 'manual:' . $r->id, $superAdmin->id);
            } elseif ($approve) {
                $balance = Money::toPaisa((string) $locked->sms_balance) + Money::toPaisa($r->amount);
                $locked->forceFill(['sms_balance' => Money::format($balance)])->save();
                SmsCreditTransaction::create(['type' => 'purchase', 'amount' => $r->amount, 'balance_after' => Money::format($balance), 'reference' => 'manual:' . $r->id, 'created_by' => $superAdmin->id]);
            }
            AuditLog::create(['institution_id' => $i->id, 'user_id' => $superAdmin->id, 'action' => $approve ? 'wallet.recharge_approved' : 'wallet.recharge_rejected',
                'model' => 'WalletRechargeRequest', 'model_id' => $r->id, 'new_data' => ['method' => $r->method], 'ip_address' => request()->ip()]);
            $to = User::whereKey($r->requested_by)->first();
            $to?->notify(new GeneralNotification(__($approve ? 'wallet.approved_title' : 'wallet.rejected_title'),
                __($approve ? 'wallet.approved_body' : 'wallet.rejected_body', ['amount' => $r->amount, 'reason' => $note ?? '-']), 'wallet_recharge', ['request_id' => $r->id]));
            return $r->refresh();
        }));
    }

    public function receipt(WalletRechargeRequest $r)
    {
        abort_unless($r->receipt_path && Storage::disk('private')->exists($r->receipt_path), 404);
        return Storage::disk('private')->response($r->receipt_path, 'receipt-' . $r->id . '.' . pathinfo($r->receipt_path, PATHINFO_EXTENSION));
    }
}
