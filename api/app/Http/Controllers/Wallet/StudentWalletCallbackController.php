<?php

namespace App\Http\Controllers\Wallet;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Institution, User};
use App\Services\Billing\BkashService;
use App\Services\Wallet\StudentWalletService;
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

// D218 WAL.3 (the D58 pattern): bKash sends the student's browser back here on the CENTRAL host. `ref` finds our own record
// (institution, student, amount); the wallet is credited only when bKash says Completed for exactly our amount and invoice, and
// once per ref (the ledger reference bkash:{ref}).
class StudentWalletCallbackController extends Controller
{
    /** GET /wallet/student/bkash/callback?ref=&paymentID=&status= */
    public function bkash(Request $request, BkashService $bkash, StudentWalletService $wallets)
    {
        $ref = (string) $request->query('ref');
        $pending = preg_match('/^[A-Z0-9]{1,20}$/', $ref) ? Cache::get("user_wallet_recharge:{$ref}") : null;
        if (!$pending) return response()->json(['success' => false, 'error' => 'not_found', 'message' => __('errors.not_found')], 404);
        $back = fn (string $result) => redirect()->away($pending['return'] . '/student/wallet?recharge=' . $result);
        if (($request->query('paymentID') ?? $request->query('paymentId')) !== $pending['payment_id']) return $back('failed');
        if ($request->query('status') !== 'success') return $back($request->query('status') === 'cancel' ? 'cancelled' : 'failed');
        $institution = Institution::findOrFail($pending['institution_id']);
        $reference = "bkash:{$ref}";
        return Tenancy::as($institution, function () use ($bkash, $wallets, $pending, $ref, $reference, $back, $institution) {
            $student = User::findOrFail($pending['user_id']);
            if (\App\Models\UserWalletTransaction::where('user_id', $student->id)->where('reference', $reference)->exists()) return $back('success');
            $r = $bkash->executePayment($pending['payment_id']);
            $ok = ($r['transactionStatus'] ?? null) === 'Completed' && ($r['merchantInvoiceNumber'] ?? $ref) === $ref
                && isset($r['amount']) && Money::toPaisa((string) $r['amount']) === Money::toPaisa($pending['amount']);
            if (!$ok) return $back('failed');
            if ($wallets->move($student, 'recharge', Money::toPaisa($pending['amount']), $reference, $student->id)) {
                AuditLog::create(['institution_id' => $institution->id, 'user_id' => $student->id, 'action' => 'user_wallet.recharged', 'model' => 'UserWallet', 'model_id' => $student->id,
                    'new_data' => ['gateway' => 'bkash', 'trx_id' => $r['trxID'] ?? null], 'ip_address' => request()->ip()]);
            }
            return $back('success');
        });
    }
}
