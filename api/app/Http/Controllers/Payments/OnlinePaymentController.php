<?php

namespace App\Http\Controllers\Payments;

use App\Http\Controllers\Controller;
use App\Models\{OnlinePayment, Student};
use App\Services\Payments\{GatewayRegistry, OnlinePaymentService, PaymentRouter};
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D217 OPAY.2 (docs/modules/online-fee-payment.md "API Endpoints", parent): which ways to pay exist here (none = no Pay button),
// start a payment for chosen dues of the parent's OWN child - only the due keys are sent, never an amount -, and poll its state.
class OnlinePaymentController extends Controller
{
    public function __construct(private OnlinePaymentService $payments, private PaymentRouter $router) {}

    /** GET /parent/fees/payment-options */
    public function options()
    {
        return response()->json(['success' => true, 'data' => $this->router->options(Tenancy::current())]);
    }

    /** POST /fees/payment/{gateway}/create {student_id, dues: ["12:3:2026-10", ...]} */
    public function create(Request $request, string $gateway)
    {
        if (!in_array($gateway, GatewayRegistry::enabledKeys(), true)) abort(404);
        $d = $request->validate(['student_id' => 'required|integer', 'dues' => 'required|array|min:1|max:50', 'dues.*' => ['required', 'string', 'max:60', 'regex:/^\d+:\d+:[0-9A-Za-z-]{1,20}$/']]);
        $student = Student::whereKey($d['student_id'])->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        return response()->json(['success' => true, 'data' => $this->payments->initiate($request->user(), $student, $d['dues'], $gateway)], 201);
    }

    /** GET /parent/online-payments/{ref} - the caller's own payment; while it is open the provider is asked again */
    public function status(Request $request, string $ref)
    {
        if (!preg_match('/^[A-Z0-9]{1,40}$/', $ref)) abort(404);
        $own = fn () => OnlinePayment::where('gateway_ref', $ref)->where('parent_user_id', $request->user()->id)->firstOrFail();
        $p = $own();
        if ($p->status === 'initiated' && GatewayRegistry::definition($p->gateway) && (GatewayRegistry::make($p->gateway)->capabilities()['query'] ?? false)) {
            $this->payments->finalize($ref, [], true);
            $p = $own();
        }
        $open = $p->status === 'initiated';
        return response()->json(['success' => true, 'data' => ['ref' => $p->gateway_ref, 'status' => $p->status, 'flow' => $p->flow, 'amount' => $p->amount, 'receipt_no' => $p->receipt_no,
            'qr_payload' => $open ? $p->qr_payload : null, 'expires_at' => $open ? $p->expires_at?->toIso8601String() : null,
            'needs_review' => $p->status === 'review']]);
    }
}
