<?php

namespace App\Services\Payments\Gateways;

use App\Models\OnlinePayment;
use App\Services\Payments\GatewayInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

// D217 OPAY.1 (docs/modules/online-fee-payment.md "FakeQrGateway"): dev / test only, never registered in production. It does not
// imitate any bank - it only lets the whole `qr` path run (draw -> poll -> notify -> finalize -> expiry -> late -> review). The
// "payment happened" state is whatever the simulator put in the cache under fakeqr:{ref}.
class FakeQrGateway implements GatewayInterface
{
    public function capabilities(): array
    {
        return ['flow' => 'qr', 'notify' => true, 'query' => true];
    }

    public function create(OnlinePayment $p, array $creds, bool $sandbox): array
    {
        return ['flow' => 'qr', 'qr_payload' => "FAKEQR|{$p->gateway_ref}|{$p->amount}", 'expires_at' => now()->addMinutes(2)->toIso8601String(), 'gateway_payment_id' => 'fake-' . $p->gateway_ref];
    }

    public function extractRef(Request $request): ?string
    {
        $ref = $request->input('ref');
        return is_string($ref) && preg_match('/^[A-Z0-9]{1,40}$/', $ref) ? $ref : null;
    }

    public function authenticate(Request $request, OnlinePayment $p, array $creds): bool
    {
        return hash_equals((string) config('app.key'), (string) $request->header('X-Fake-Secret'));
    }

    public function notifyResponse(OnlinePayment $p): Response
    {
        return response()->json(['success' => true, 'status' => $p->status]);
    }

    public function confirm(OnlinePayment $p, array $callback, array $creds, bool $sandbox): array
    {
        return $this->query($p, $creds, $sandbox);
    }

    public function query(OnlinePayment $p, array $creds, bool $sandbox): array
    {
        $paid = Cache::get("fakeqr:{$p->gateway_ref}");
        if (!$paid) return ['ok' => false, 'reason' => 'pending', 'raw' => []];
        return ['ok' => true, 'trx_id' => 'FAKE-' . $p->gateway_ref, 'amount' => (string) $paid['amount'], 'channel' => 'banglaqr', 'raw' => ['fake' => true], 'reason' => null];
    }

    public function verifyCredentials(array $creds, bool $sandbox): array
    {
        return ['ok' => true, 'error' => null];
    }
}
