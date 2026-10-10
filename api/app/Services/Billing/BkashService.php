<?php

namespace App\Services\Billing;

use App\Models\PlatformSetting;
use Illuminate\Support\Facades\{Cache, Crypt, Http, Log};

// docs/modules/payment-gateways.md "BkashService" for the PLATFORM's own merchant (D58: SMS-wallet recharge). Amounts are
// strings with two decimals, never floats (G9). Nothing about the payer or the amount is logged - only the step and status.
// Only the calls the spec gives (token/grant, checkout/create, checkout/execute); create also sends mode '0011' and payerReference
// as in the owner's tokenized-checkout sample (bkash_2, 2026-10-10); response fields read: paymentID, bkashURL, transactionStatus
// ('Completed'), amount, trxID, merchantInvoiceNumber - as in the owner's samples.
class BkashService
{
    public const SECRET_FIELDS = ['app_key', 'app_secret', 'username', 'password'];

    /** The merchant settings in use: the Super Admin's panel values (secrets stored encrypted) win over the server's .env */
    public function credentials(): array
    {
        $c = [];
        foreach (self::SECRET_FIELDS as $f) {
            $stored = PlatformSetting::read("bkash_{$f}");
            $c[$f] = $stored ? Crypt::decryptString($stored) : (string) config("services.bkash.{$f}");
        }
        $sandbox = PlatformSetting::read('bkash_sandbox');
        $c['sandbox'] = $sandbox === null ? (bool) config('services.bkash.sandbox') : (bool) $sandbox;
        // a sandbox without its own address stays off - never the production address by accident
        $c['base_url'] = (string) (PlatformSetting::read('bkash_base_url') ?: config('services.bkash.base_url') ?: ($c['sandbox'] ? '' : 'https://tokenized.pay.bka.sh/v1.2.0-beta'));
        return $c;
    }

    public function configured(): bool
    {
        $c = $this->credentials();
        return collect(self::SECRET_FIELDS)->every(fn ($f) => filled($c[$f])) && filled($c['base_url']);
    }

    /** Super Admin "Test connection": can we get a token with these settings? */
    public function test(): bool
    {
        if (!$this->configured()) return false;
        Cache::forget($this->tokenKey());
        return (bool) $this->token();
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
        $c = $this->credentials();
        return Cache::remember($this->tokenKey(), 3500, function () use ($c) {
            try {
                $r = Http::timeout(20)->withHeaders(['username' => $c['username'], 'password' => $c['password']])
                    ->post($this->url('/tokenized/checkout/token/grant'), ['app_key' => $c['app_key'], 'app_secret' => $c['app_secret']]);
            } catch (\Throwable $e) {                     // unreachable address: "refused", never a 500 for the caller
                Log::warning('bkash unreachable', ['step' => 'token', 'error' => class_basename($e)]);
                return null;
            }
            if (!$r->successful() || !$r->json('id_token')) {
                Log::warning('bkash token refused', ['http' => $r->status()]);
                return null;
            }
            return $r->json('id_token');
        }) ?: tap(null, fn () => Cache::forget($this->tokenKey()));
    }

    /** One cached token per merchant + address: a changed setting never reuses the old token */
    private function tokenKey(): string
    {
        $c = $this->credentials();
        return 'bkash_token:' . hash('sha256', $c['base_url'] . '|' . $c['app_key'] . '|' . $c['username']);
    }

    private function call(string $step, string $path, array $body): array
    {
        try {
            $token = $this->token();
            if (!$token) return [];
            $r = Http::timeout(30)->withHeaders(['Authorization' => $token, 'X-APP-Key' => $this->credentials()['app_key']])->post($this->url($path), $body);
            if (!$r->successful()) Log::warning('bkash refused', ['step' => $step, 'http' => $r->status()]);
            return (array) $r->json();
        } catch (\Throwable $e) {
            Log::warning('bkash unreachable', ['step' => $step, 'error' => class_basename($e)]);
            return [];
        }
    }

    private function url(string $path): string
    {
        // accepts the base with or without its "/tokenized" end (the owner's sample keeps it in base_url)
        return preg_replace('#/tokenized$#', '', rtrim($this->credentials()['base_url'], '/')) . $path;
    }
}
