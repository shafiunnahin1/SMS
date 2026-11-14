<?php

namespace App\Services\Payments;

use App\Models\OnlinePayment;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// D217 OPAY.1 (docs/modules/online-fee-payment.md "GatewayInterface", flow-aware): every provider is one class behind this.
interface GatewayInterface
{
    /** ['flow' => 'redirect'|'qr', 'notify' => bool (the provider calls us), 'query' => bool (we can ask the provider)] */
    public function capabilities(): array;

    /** Start a payment; $p->gateway_ref is the ONLY reference sent out.
     *  redirect: ['flow' => 'redirect', 'payment_url' => string, 'gateway_payment_id' => ?string]
     *  qr:       ['flow' => 'qr', 'qr_payload' => string, 'expires_at' => ISO8601, 'gateway_payment_id' => ?string] */
    public function create(OnlinePayment $p, array $creds, bool $sandbox): array;

    /** provider -> us, step 1: read OUR ref from the request (no secrets are known yet) */
    public function extractRef(Request $request): ?string;

    /** step 2, with the credentials of the row's institution: authenticate the request; false => 403, nothing is finalized */
    public function authenticate(Request $request, OnlinePayment $p, array $creds): bool;

    /** the HTTP answer the provider expects after a notification */
    public function notifyResponse(OnlinePayment $p): Response;

    /** Ask the provider for the truth: ['ok' => bool, 'trx_id' => ?string, 'amount' => ?string, 'channel' => ?string, 'raw' => array, 'reason' => ?string].
     *  reason 'pending' = still undecided. The amount is never taken from $callback. */
    public function confirm(OnlinePayment $p, array $callback, array $creds, bool $sandbox): array;

    /** the same shape; only when capabilities()['query'] (the reconcile job) */
    public function query(OnlinePayment $p, array $creds, bool $sandbox): array;

    /** Settings -> "test connection"; moves no money: ['ok' => bool, 'error' => ?string] */
    public function verifyCredentials(array $creds, bool $sandbox): array;
}
