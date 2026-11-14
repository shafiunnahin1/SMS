<?php

namespace App\Services\Wallet;

use App\Exceptions\BusinessException;
use App\Models\{User, UserWallet, UserWalletTransaction};
use App\Support\Money;
use Illuminate\Support\Facades\DB;

// D218 WAL.3: a student's wallet. Every change locks the wallet row and writes one ledger row (append-only, D32); the balance never
// goes below zero. A `reference` written once (e.g. bkash:{ref}, manual:{id}) is never credited twice.
class StudentWalletService
{
    public function wallet(User $u): UserWallet
    {
        return UserWallet::firstOrCreate(['user_id' => $u->id], ['balance' => '0.00']);
    }

    /** +amount (recharge / refund / adjustment) or -amount (purchase); null when the reference was already written */
    public function move(User $u, string $type, int $paisa, ?string $reference, ?int $by): ?UserWalletTransaction
    {
        return DB::transaction(function () use ($u, $type, $paisa, $reference, $by) {
            $this->wallet($u);
            $w = UserWallet::where('user_id', $u->id)->lockForUpdate()->first();
            if ($reference !== null && UserWalletTransaction::where('user_id', $u->id)->where('reference', $reference)->exists()) return null;
            $balance = Money::toPaisa((string) $w->balance) + $paisa;
            if ($balance < 0) throw new BusinessException('the wallet balance is not enough', 'wallet_insufficient', 422, ['balance' => (string) $w->balance, 'total' => Money::format(-$paisa)]);
            $w->update(['balance' => Money::format($balance)]);
            return UserWalletTransaction::create(['user_id' => $u->id, 'type' => $type, 'amount' => Money::format($paisa), 'balance_after' => Money::format($balance),
                'reference' => $reference, 'created_by' => $by]);
        });
    }
}
