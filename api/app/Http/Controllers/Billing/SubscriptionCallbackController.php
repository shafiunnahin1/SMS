<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\{Institution, Payment};
use App\Services\Billing\{BkashService, SubscriptionBillingService};
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

// D187 SUB.2: bKash brings the payer back here on the central host (the D58 pattern). The bill is recorded only when bKash says
// Completed for exactly our amount and invoice; repeated callbacks record it once (Payment.invoice_no = ref).
class SubscriptionCallbackController extends Controller
{
    public function bkash(Request $request, BkashService $bkash, SubscriptionBillingService $billing)
    {
        $ref = (string) $request->query('ref');
        $pending = preg_match('/^[A-Z0-9]{1,20}$/', $ref) ? Cache::get("sub_checkout:{$ref}") : null;
        if (!$pending) return response()->json(['success' => false, 'error' => 'not_found', 'message' => __('errors.not_found')], 404);
        $back = fn (string $result) => redirect()->away($pending['return'] . '/admin/subscription?payment=' . $result);
        if (($request->query('paymentID') ?? $request->query('paymentId')) !== $pending['payment_id']) return $back('failed');
        $institution = Institution::findOrFail($pending['institution_id']);
        if (Tenancy::as($institution, fn () => Payment::where('invoice_no', $ref)->exists())) return $back('success');   // already recorded
        if ($request->query('status') !== 'success') return $back($request->query('status') === 'cancel' ? 'cancelled' : 'failed');

        $r = $bkash->executePayment($pending['payment_id']);
        $ok = ($r['transactionStatus'] ?? null) === 'Completed' && ($r['merchantInvoiceNumber'] ?? $ref) === $ref
            && isset($r['amount']) && Money::toPaisa((string) $r['amount']) === Money::toPaisa($pending['quote']['total']);
        if (!$ok) return $back('failed');
        $billing->complete($institution, $ref, $pending['quote'], 'bkash', $r['trxID'] ?? null, $pending['by']);
        return $back('success');
    }
}
