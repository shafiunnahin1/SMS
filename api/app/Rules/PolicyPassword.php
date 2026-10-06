<?php

namespace App\Rules;

use App\Models\User;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

// docs/AUTHORIZATION.md "Password Policy (Revision 7)": length first, stricter for roles that can do more damage.
// Used by ChangePasswordRequest, ResetPasswordRequest and (later) the user-create requests.
class PolicyPassword implements ValidationRule
{
    /** @param User|string $roleOrUser a User (its name/phone/email/username are forbidden inside the password) or a bare role */
    public function __construct(private User|string $roleOrUser, private array $extraForbidden = []) {}

    public static function rulesFor(string $role): array
    {
        return match ($role) {
            'super_admin' => [12, true], 'admin', 'accountant' => [10, true], 'teacher' => [8, true], default => [6, false],
        };
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $value = (string) $value;
        $user = $this->roleOrUser instanceof User ? $this->roleOrUser : null;
        [$min, $lettersAndDigits] = self::rulesFor($user?->role ?? $this->roleOrUser);

        if (mb_strlen($value) < $min) { $fail("The password must be at least {$min} characters."); return; }
        if ($lettersAndDigits && !(preg_match('/\p{L}/u', $value) && preg_match('/\d/', $value))) {
            $fail('The password must contain letters and numbers.'); return;
        }

        $lower = mb_strtolower($value);
        foreach (array_filter([$user?->name, $user?->phone, $user?->email, $user?->username, ...$this->extraForbidden]) as $bad) {
            if (mb_strlen($bad) >= 4 && str_contains($lower, mb_strtolower($bad))) { $fail('The password must not contain your name, phone, email or ID.'); return; }
        }
        if (in_array($lower, self::commonPasswords(), true)) { $fail('This password is too common.'); return; }

        if (config('auth_policy.check_breached')
            && Validator::make(['p' => $value], ['p' => Password::min(1)->uncompromised()])->fails()) {
            $fail('This password has appeared in a data breach.');
        }
    }

    public static function commonPasswords(): array
    {
        static $list;
        return $list ??= array_values(array_filter(array_map('trim',
            file(resource_path('security/common-passwords.txt'), FILE_IGNORE_NEW_LINES) ?: []), fn ($l) => $l !== '' && $l[0] !== '#'));
    }
}
