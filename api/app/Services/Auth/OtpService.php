<?php

namespace App\Services\Auth;

use App\Models\OtpToken;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

// One-time secrets in otp_tokens, stored only as sha256(purpose|secret|app key): a code issued for one purpose
// (2FA login, password reset) can never be used for the other, and a database leak reveals no usable code.
class OtpService
{
    public const LOGIN = 'login';
    public const RESET = 'reset';

    /** Issue a numeric code (SMS) or a long link token (email); earlier unused secrets of the user stop working */
    public function issue(User $user, string $purpose, bool $longToken = false): array
    {
        OtpToken::where('user_id', $user->id)->whereNull('used_at')->update(['used_at' => now()]);

        $secret = $longToken ? Str::random(40) : $this->numericCode();
        $minutes = $longToken ? config('auth_policy.reset_link_minutes') : config('auth_policy.otp.minutes');
        $row = OtpToken::create(['user_id' => $user->id, 'otp' => $this->hash($purpose, $secret), 'expires_at' => now()->addMinutes($minutes)]);

        return [$row, $secret];
    }

    /** The matching unused, unexpired secret of this user for this purpose. Null when anything is off. */
    public function find(User $user, string $purpose, string $secret, ?int $rowId = null): ?OtpToken
    {
        return OtpToken::where('user_id', $user->id)->whereNull('used_at')->where('expires_at', '>', now())
            ->when($rowId, fn ($q) => $q->whereKey($rowId))
            ->where('otp', $this->hash($purpose, $secret))->first();
    }

    /** find() and mark it used, so it works exactly once */
    public function consume(User $user, string $purpose, string $secret, ?int $rowId = null): ?OtpToken
    {
        $row = $this->find($user, $purpose, $secret, $rowId);
        $row?->forceFill(['used_at' => now()])->save();
        return $row;
    }

    /** Send through the user's channel: email when it has one, otherwise SMS to the phone */
    public function deliver(User $user, string $subject, string $text): void
    {
        if ($user->email) {
            Mail::raw($text, fn ($m) => $m->to($user->email)->subject($subject));
            return;
        }
        $this->sms((string) $user->phone, $text);
    }

    public function sms(string $phone, string $text): void
    {
        // TODO(OD-sms-gateway): SmsService (Step 4.6) replaces this. Until then only local/testing may "send", into the log (G17).
        if (!app()->environment('local', 'testing')) throw new \RuntimeException('SMS gateway not configured');
        Log::info('[dev sms] to ' . substr($phone, 0, 3) . '******' . substr($phone, -2) . ': ' . $text);
    }

    private function numericCode(): string
    {
        $len = config('auth_policy.otp.length');
        return str_pad((string) random_int(0, 10 ** $len - 1), $len, '0', STR_PAD_LEFT);
    }

    private function hash(string $purpose, string $secret): string
    {
        return hash('sha256', $purpose . '|' . $secret . '|' . config('app.key'));
    }

    /** Same cost whether or not a user exists (login timing) */
    public static function dummyHash(): string
    {
        static $h; return $h ??= Hash::make('timing-equaliser');
    }
}
