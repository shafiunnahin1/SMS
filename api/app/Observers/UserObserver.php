<?php

namespace App\Observers;

use App\Models\AuditLog;
use App\Models\User;
use App\Services\Auth\TokenService;

// docs/AUTHORIZATION.md "UserObserver - what revokes tokens (Revision 7)"
class UserObserver
{
    public function updated(User $u): void
    {
        $revoke = $u->wasChanged(['password', 'role', 'is_active', 'two_factor_enabled', 'email', 'phone', 'username'])
            || ($u->wasChanged('locked_until') && $u->locked_until);
        if (!$revoke) return;

        // a user changing their OWN password keeps the token they are using
        $keep = ($u->wasChanged('password') && auth()->id() === $u->id) ? optional(auth()->user()->currentAccessToken())->id : null;
        app(TokenService::class)->revokeAll($u, $keep);
        AuditLog::record('auth.tokens_revoked', $u, ['changed' => array_values(array_diff(array_keys($u->getChanges()), ['password']))]);
    }

    public function deleted(User $u): void { app(TokenService::class)->revokeAll($u); }
}
