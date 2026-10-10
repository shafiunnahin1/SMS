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

    /** Why the last call failed, for the log and the Super Admin's "Test connection" - bKash's own code/message or the network error, never a secret */
    private ?string $lastError = null;

    public function lastError(): ?string { return $this->lastError; }
    public const SANDBOX_URL = 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized';
    public const LIVE_URL = 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized';

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
        // default addresses from the owner's bKash sample (bKash-HSL/Checkout-URL-PHP, 2026-10-10): sandbox and live never mix
        $c['base_url'] = (string) (PlatformSetting::read('bkash_base_url') ?: config('services.bkash.base_url')
            ?: ($c['sandbox'] ? self::SANDBOX_URL : self::LIVE_URL));
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
        if (($r['paymentID'] ?? null) && ($r['bkashURL'] ?? null)) return $r;
        if (!$this->lastError) $this->fail('create', 'no paymentID / bkashURL in the answer');
        return null;
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
                $this->fail('token', self::networkReason($e));
                return null;
            }
            if (!$r->successful() || !$r->json('id_token')) {
                $this->fail('token', self::bkashReason($r->status(), (array) $r->json()));
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
            $json = (array) $r->json();
            // bKash answers HTTP 200 with its own statusCode for refusals ("0000" = fine)
            if (!$r->successful() || (isset($json['statusCode']) && $json['statusCode'] !== '0000')) $this->fail($step, self::bkashReason($r->status(), $json));
            return $json;
        } catch (\Throwable $e) {
            $this->fail($step, self::networkReason($e));
            return [];
        }
    }

    private function fail(string $step, string $reason): void
    {
        $this->lastError = "{$step}: {$reason}";
        Log::warning('bkash refused', ['step' => $step, 'reason' => $reason]);          // no keys, no phone, no amount (G9)
    }

    private static function bkashReason(int $http, array $json): string
    {
        $code = $json['statusCode'] ?? $json['errorCode'] ?? null;
        $msg = $json['statusMessage'] ?? $json['errorMessage'] ?? $json['message'] ?? $json['msg'] ?? null;
        return trim("HTTP {$http}" . ($code ? " {$code}" : '') . ($msg ? ' - ' . mb_substr((string) $msg, 0, 160) : ''));
    }

    /** "cURL error 60: SSL certificate problem ..." without the URL tail */
    private static function networkReason(\Throwable $e): string
    {
        return mb_substr(trim(preg_replace('/\s*\(see https?:\S+\)|\s+for https?:\S+/', '', $e->getMessage())), 0, 200) ?: class_basename($e);
    }

    private function url(string $path): string
    {
        // accepts the base with or without its "/tokenized" end (the owner's sample keeps it in base_url)
        return preg_replace('#/tokenized$#', '', rtrim($this->credentials()['base_url'], '/')) . $path;
    }
}
