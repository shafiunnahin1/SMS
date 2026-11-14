<?php

namespace App\Http\Controllers\Payments;

use App\Http\Controllers\Controller;
use App\Services\Payments\{GatewayRegistry, OnlinePaymentService};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

// D217 OPAY.1 (docs/modules/online-fee-payment.md "Callback & Notification Endpoints"): the generic provider -> us notification
// on the CENTRAL host, no login. The ref finds the row, the row its institution, the institution its credentials; only then the
// request is authenticated the provider's way. Also the dev / test simulator of the fake gateway (never registered in production).
class FeePaymentCallbackController extends Controller
{
    public function __construct(private OnlinePaymentService $payments) {}

    /** POST|GET /fees/payment/{gateway}/notify */
    public function notify(Request $request, string $gateway)
    {
        if (!in_array($gateway, GatewayRegistry::enabledKeys(), true)) abort(404);
        $adapter = GatewayRegistry::make($gateway);
        $ref = $adapter->extractRef($request) ?? abort(404);
        $institution = $this->payments->institutionOf($ref) ?? abort(404);
        $p = Tenancy::as($institution, fn () => \App\Models\OnlinePayment::where('gateway_ref', $ref)->where('gateway', $gateway)->first()) ?? abort(404);
        $creds = Tenancy::as($institution, fn () => $this->payments->credentials($p));
        if (!$adapter->authenticate($request, $p, $creds)) abort(403);
        return $adapter->notifyResponse($this->payments->finalize($ref, $request->all()));
    }

    /** POST /dev/fakeqr/pay {ref, amount?} - "the customer scanned and paid" (a different amount tests the review path) */
    public function fakePay(Request $request)
    {
        if (app()->environment('production') || !in_array('fakeqr', GatewayRegistry::enabledKeys(), true)) abort(404);
        $d = $request->validate(['ref' => ['required', 'string', 'regex:/^[A-Z0-9]{1,40}$/'], 'amount' => ['nullable', 'regex:/^\d{1,8}(\.\d{1,2})?$/']]);
        $institution = $this->payments->institutionOf($d['ref']) ?? abort(404);
        $p = Tenancy::as($institution, fn () => \App\Models\OnlinePayment::where('gateway_ref', $d['ref'])->where('gateway', 'fakeqr')->first()) ?? abort(404);
        Cache::put("fakeqr:{$d['ref']}", ['amount' => $d['amount'] ?? (string) $p->amount], now()->addDay());
        $p = $this->payments->finalize($d['ref'], ['ref' => $d['ref']]);
        return response()->json(['success' => true, 'data' => ['status' => $p->status, 'failure_reason' => $p->failure_reason]]);
    }
}
