<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Rules\PolicyPassword;
use App\Services\Auth\LoginService;
use App\Services\Auth\OtpService;
use Illuminate\Support\Facades\Validator;

// docs/AUTHORIZATION.md "Password Reset Flow" + "Login Identifier": email -> link, no email -> SMS code (otp_tokens).
// Secrets live in otp_tokens (hashed, purpose-bound), not in Laravel's password_reset_tokens: that table is keyed by
// email alone, and the same email may belong to users of two institutions.
class PasswordResetController extends Controller
{
    public function __construct(private LoginService $login, private OtpService $otp) {}

    public function sendResetLink(ForgotPasswordRequest $request)
    {
        $user = $this->login->findUser($request->input('login'));
        if ($user && $user->is_active) {
            if ($user->email) {
                [, $token] = $this->otp->issue($user, OtpService::RESET, longToken: true);
                $link = $request->getSchemeAndHttpHost() . '/reset-password?' . http_build_query(['token' => $token, 'login' => $user->email]);
                $this->otp->deliver($user, 'Password reset', "পাসওয়ার্ড বদলাতে এই লিংকে যান (" . config('auth_policy.reset_link_minutes') . " মিনিট): {$link}");
            } elseif ($user->phone) {
                [, $code] = $this->otp->issue($user, OtpService::RESET);
                $this->otp->sms($user->phone, "পাসওয়ার্ড রিসেট কোড: {$code}");
            }
        }
        // the same answer whether or not the account exists
        return response()->json(['success' => true, 'message' => __('messages.reset_sent')]);
    }

    public function reset(ResetPasswordRequest $request)
    {
        $invalid = response()->json(['success' => false, 'error' => 'invalid_token', 'message' => __('errors.invalid_token')], 422);
        $user = $this->login->findUser($request->input('login'));
        if (!$user || !$user->is_active || !$this->otp->find($user, OtpService::RESET, $request->input('token'))) return $invalid;

        Validator::make($request->only('password'), ['password' => [new PolicyPassword($user)]])->validate();
        if (!$this->otp->consume($user, OtpService::RESET, $request->input('token'))) return $invalid;

        // UserObserver revokes every token (a lost device is the usual reason for a reset)
        $user->forceFill(['password' => $request->input('password'), 'must_change_password' => false,
            'failed_login_attempts' => 0, 'locked_until' => null])->save();
        return response()->json(['success' => true, 'message' => __('messages.password_reset')]);
    }

    public function changePassword(ChangePasswordRequest $request)
    {
        // UserObserver keeps the token in use and revokes the others
        $request->user()->forceFill(['password' => $request->input('password'), 'must_change_password' => false])->save();
        return response()->json(['success' => true, 'message' => __('messages.password_changed')]);
    }
}
