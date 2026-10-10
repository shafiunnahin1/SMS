<?php

namespace App\Services\Billing;

use Illuminate\Support\Facades\{Cache, Http, Log};

// docs/modules/payment-gateways.md "BkashService" for the PLATFORM's own merchant (D58: SMS-wallet recharge). Amounts are
// strings with two decimals, never floats (G9). Nothing about the payer or the amount is logged - only the step and status.
// Only the calls the spec gives (token/grant, checkout/create, checkout/execute); create also sends mode '0011' and payerReference
// as in the owner's tokenized-checkout sample (bkash_2, 2026-10-10); response fields read: paymentID, bkashURL, transactionStatus
// ('Completed'), amount, trxID, merchantInvoiceNumber - as in the owner's samples.
class BkashService
{
    public function configured(): bool
    {
        return filled(config('services.bkash.app_key')) && filled(config('services.bkash.app_secret'))
            && filled(config('services.bkash.username')) && filled(config('services.bkash.password')) && filled(config('services.bkash.base_url'));
    }

    /** POST /tokenized/checkout/create -> ['paymentID' => ..., 'bkashURL' => ...] or null */
    public function createPayment(string $amount, string $invoiceNo, string $callbackUrl): ?array
    {
        $r = $this->call('create', '/tokenized/checkout/create', ['mode' => '0011', 'payerReference' => $invoiceNo, 'amount' => $amount, 'currency' => 'BDT',
            'intent' => 'sale', 'merchantInvoiceNumber' => $invoiceNo, 'callbackURL' => $callbackUrl]);
        return ($r['paymentID'] ?? null) && ($r['bkashURL'] ?? null) ? $r : null;
    }

    public function executePayment(string $paymentId): array
    {
        return $this->call('execute', '/tokenized/checkout/execute', ['paymentID' => $paymentId]);
    }

    private function token(): ?string
    {
        return Cache::remember('bkash_token', 3500, function () {
            $r = Http::timeout(20)->withHeaders(['username' => config('services.bkash.username'), 'password' => config('services.bkash.password')])
                ->post($this->url('/tokenized/checkout/token/grant'), ['app_key' => config('services.bkash.app_key'), 'app_secret' => config('services.bkash.app_secret')]);
            if (!$r->successful() || !$r->json('id_token')) {
                Log::warning('bkash token refused', ['http' => $r->status()]);
                return null;
            }
            return $r->json('id_token');
        }) ?: tap(null, fn () => Cache::forget('bkash_token'));
    }

    private function call(string $step, string $path, array $body): array
    {
        try {
            $token = $this->token();
            if (!$token) return [];
            $r = Http::timeout(30)->withHeaders(['Authorization' => $token, 'X-APP-Key' => config('services.bkash.app_key')])->post($this->url($path), $body);
            if (!$r->successful()) Log::warning('bkash refused', ['step' => $step, 'http' => $r->status()]);
            return (array) $r->json();
        } catch (\Throwable $e) {
            Log::warning('bkash unreachable', ['step' => $step, 'error' => class_basename($e)]);
            return [];
        }
    }

    private function url(string $path): string
    {
        return rtrim((string) config('services.bkash.base_url'), '/') . $path;
    }
}
