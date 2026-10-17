<?php

namespace App\Services\Auth;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Support\Facades\Hash;

// docs/AUTHORIZATION.md "Login Identifier (Revision 6)" + "Login Attempt Lockout (Revision 7)"
class LoginService
{
    /** email / phone / username (= student ID), searched ONLY inside the current tenant, or among Super Admins on the central host */
    public function findUser(string $login): ?User
    {
        $login = trim($login);
        $field = str_contains($login, '@') ? 'email'
               : (preg_match('/^(\+?88)?01[3-9]\d{8}$/', preg_replace('/[\s-]/', '', $login)) ? 'phone' : 'username');
        if ($field === 'phone') $login = User::normalisePhone($login);

        $query = Tenancy::current() ? User::inTenant() : User::platform();
        return $query->where($field, $login)->first();
    }

    /**
     * The user when the password is right and the account usable, null otherwise. Exactly ONE Hash::check on every path
     * (unknown user, locked, wrong password, inactive), so neither the answer nor the timing tells them apart.
     */
    public function attempt(?User $user, string $password): ?User
    {
        $passwordOk = Hash::check($password, $user?->password ?? OtpService::dummyHash());
        if (!$user) return null;

        if ($user->locked_until && now()->lt($user->locked_until)) return null;

        if (!$passwordOk || !$user->is_active || Tenancy::current()?->status === 'inactive') {
            $attempts = $user->failed_login_attempts + 1;
            if ($attempts >= config('auth_policy.lockout.attempts')) {
                // lock (UserObserver revokes every token) and start counting afresh after the lock ends
                $user->forceFill(['failed_login_attempts' => 0, 'locked_until' => now()->addMinutes(config('auth_policy.lockout.minutes'))])->save();
                AuditLog::record('auth.locked', $user);
            } else {
                $user->forceFill(['failed_login_attempts' => $attempts])->save();
            }
            return null;
        }

        $user->forceFill(['failed_login_attempts' => 0, 'locked_until' => null, 'last_login_at' => now()])->save();
        return $user;
    }

    /** 2FA is required when the user turned it on; it is mandatory for Super Admin (Password Policy table) */
    public function needsSecondFactor(User $user): bool
    {
        return in_array($user->role, User::PLATFORM_ROLES, true) || $user->two_factor_enabled;   // D65: writers sign in like the Super Admin
    }
}
