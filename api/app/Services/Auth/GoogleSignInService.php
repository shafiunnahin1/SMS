<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Support\Tenancy;
use Google\Client;

/**
 * R2.1.1 / D111 (3): Google sign-in as in qbank. The Google ID token is verified on the server (signature, audience = our client ID,
 * issuer, expiry) and must carry a verified email. It signs in only an existing account with that email on this host (tenant users
 * on the school's host, platform users on the central host); it never creates an account and never bypasses activation, locks,
 * school status or the second factor - the caller treats the result exactly like a password login.
 */
class GoogleSignInService
{
    /** @var callable(string): ?array  test seam; production uses Google\Client::verifyIdToken */
    private $verifier;

    public function __construct(?callable $verifier = null)
    {
        $this->verifier = $verifier ?? function (string $credential): ?array {
            $payload = (new Client(['client_id' => config('services.google.client_id')]))->verifyIdToken($credential);
            return is_array($payload) ? $payload : null;
        };
    }

    public function enabled(): bool
    {
        return filled(config('services.google.client_id'));
    }

    /** the account the credential belongs to, or null (bad token, unverified email, no such account) */
    public function user(string $credential): ?User
    {
        try {
            $claims = ($this->verifier)($credential);
        } catch (\Throwable) {
            return null;
        }
        if (!$claims || ($claims['aud'] ?? null) !== config('services.google.client_id')) return null;
        if (!in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) return null;
        if (($claims['exp'] ?? 0) < time()) return null;
        $verified = $claims['email_verified'] ?? false;
        if (!($verified === true || $verified === 'true') || empty($claims['email'])) return null;
        $query = Tenancy::current() ? User::inTenant() : User::platform();
        return $query->where('email', mb_strtolower(trim($claims['email'])))->first();
    }
}
