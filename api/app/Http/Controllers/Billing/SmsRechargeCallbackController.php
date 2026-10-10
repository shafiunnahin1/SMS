<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Institution, SmsCreditTransaction};
use App\Services\Billing\BkashService;
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB};

// D58: bKash sends the payer's browser back here on the CENTRAL host (online-fee-payment.md: callbacks never on a tenant host).
// `ref` finds our own record (institution, amount); the payment is executed with bKash and the wallet is credited only when
// bKash says Completed for exactly our amount and invoice. Safe to call any number of times: one `purchase` row per ref.
class SmsRechargeCallbackController extends Controller
{
    /** GET /billing/bkash/callback?ref=&paymentID=&status= */
    public function bkash(Request $request, BkashService $bkash)
    {
        $ref = (string) $request->query('ref');
        $pending = preg_match('/^[A-Z0-9]{1,20}$/', $ref) ? Cache::get("sms_recharge:{$ref}") : null;
        if (!$pending) return response()->json(['success' => false, 'error' => 'not_found', 'message' => __('errors.not_found')], 404);
        $back = fn (string $result) => redirect()->away($pending['return'] . '/admin/sms?recharge=' . $result);

        if ($request->query('paymentID') !== $pending['payment_id']) return $back('failed');
        $institution = Institution::findOrFail($pending['institution_id']);
        $reference = "bkash:{$ref}";
        if (Tenancy::as($institution, fn () => SmsCreditTransaction::where('reference', $reference)->exists())) return $back('success');   // already credited
        if ($request->query('status') !== 'success') return $back($request->query('status') === 'cancel' ? 'cancelled' : 'failed');

        $r = $bkash->executePayment($pending['payment_id']);
        $ok = ($r['transactionStatus'] ?? null) === 'Completed' && ($r['merchantInvoiceNumber'] ?? $ref) === $ref
            && isset($r['amount']) && Money::toPaisa((string) $r['amount']) === Money::toPaisa($pending['amount']);
        if (!$ok) return $back('failed');

        Tenancy::as($institution, fn () => DB::transaction(function () use ($institution, $pending, $reference, $r) {
            $locked = Institution::whereKey($institution->id)->lockForUpdate()->first();
            if (SmsCreditTransaction::where('reference', $reference)->exists()) return false;           // a parallel callback won
            $balance = Money::toPaisa((string) $locked->sms_balance) + Money::toPaisa($pending['amount']);
            $locked->forceFill(['sms_balance' => Money::format($balance)])->save();
            SmsCreditTransaction::create(['type' => 'purchase', 'amount' => $pending['amount'], 'balance_after' => Money::format($balance),
                'reference' => $reference, 'created_by' => $pending['by']]);
            AuditLog::create(['institution_id' => $locked->id, 'user_id' => $pending['by'], 'action' => 'sms_wallet.recharged', 'model' => 'Institution',
                'model_id' => $locked->id, 'new_data' => ['gateway' => 'bkash', 'trx_id' => $r['trxID'] ?? null], 'ip_address' => request()->ip()]);
            return true;
        }));
        return $back('success');
    }
}
