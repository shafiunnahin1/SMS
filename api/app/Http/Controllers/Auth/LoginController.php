<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Middleware\SessionBearer;
use App\Http\Requests\Auth\LocaleRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\VerifyOtpRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Auth\LoginService;
use App\Services\Auth\OtpService;
use App\Services\Auth\TokenService;
use App\Support\Tenancy;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

// docs/AUTHORIZATION.md "Login Flow", "Login Attempt Lockout", "Two-Factor Authentication"
class LoginController extends Controller
{
    /** Identical for unknown user, wrong password, locked and inactive accounts */
    private const GENERIC = ['success' => false, 'error' => 'invalid_credentials',
        'message' => 'লগইন তথ্য ভুল, অথবা অ্যাকাউন্ট সাময়িকভাবে বন্ধ। কিছুক্ষণ পরে চেষ্টা করুন।'];

    public function __construct(private LoginService $login, private OtpService $otp, private TokenService $tokens) {}

    public function login(LoginRequest $request)
    {
        $user = $this->login->attempt($this->login->findUser($request->input('login')), $request->input('password'));
        if (!$user) return response()->json(self::GENERIC, 401);

        // roles this release does not ship (R1: student) get no token (config/release.php)
        if (!in_array($user->role, config('release.roles', []), true)) {
            return response()->json(['success' => false, 'error' => 'role_not_available', 'message' => 'This role is not available yet'], 403);
        }

        if ($this->login->needsSecondFactor($user)) {
            [$row, $code] = $this->otp->issue($user, OtpService::LOGIN);
            $text = "আপনার লগইন কোড: {$code} (" . config('auth_policy.otp.minutes') . ' মিনিট)';
            $user->phone ? $this->otp->sms($user->phone, $text) : $this->otp->deliver($user, 'Login code', $text);
            $challenge = Crypt::encryptString(json_encode(['u' => $user->id, 'o' => $row->id, 't' => Tenancy::current()?->id]));
            return response()->json(['success' => true, 'data' => ['two_factor_required' => true, 'challenge' => $challenge]]);
        }

        return $this->tokenResponse($user, $request);
    }

    public function verifyOtp(VerifyOtpRequest $request)
    {
        $fail = response()->json(['success' => false, 'error' => 'invalid_otp', 'message' => 'কোডটি ভুল বা মেয়াদোত্তীর্ণ'], 401);
        try {
            $c = json_decode(Crypt::decryptString($request->input('challenge')), true);
        } catch (DecryptException) {
            return $fail;
        }
        if (!is_array($c) || ($c['t'] ?? null) !== Tenancy::current()?->id) return $fail;   // a challenge works only on the host that issued it

        $user = (Tenancy::current() ? User::inTenant() : User::platform())->find($c['u'] ?? 0);
        if (!$user || !$user->is_active || ($user->locked_until && now()->lt($user->locked_until))) return $fail;
        if (!$this->otp->consume($user, OtpService::LOGIN, $request->input('otp'), $c['o'] ?? 0)) return $fail;

        return $this->tokenResponse($user, $request);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        if ($request->hasSession()) $request->session()->invalidate();   // D51: the web session ends with its token
        return response()->json(['success' => true, 'message' => 'Logged out']);
    }

    public function me(Request $request)
    {
        $user = $request->user();
        $institution = Tenancy::current();
        return response()->json(['success' => true, 'data' => [
            'user' => new UserResource($user),
            'institution' => $institution ? $institution->only(['id', 'name', 'slug', 'institution_type', 'status']) : null,
        ]]);
    }

    public function locale(LocaleRequest $request)
    {
        $request->user()->forceFill(['locale' => $request->input('locale')])->save();
        return response()->json(['success' => true, 'data' => ['locale' => $request->input('locale')]]);
    }

    /** D51: a browser on our own host (Sanctum's stateful request - it has a session) gets an HttpOnly session; the token stays on the
     *  server. Any other client (mobile app, API) gets the Bearer token in the body as before. */
    private function tokenResponse(User $user, Request $request)
    {
        $token = $this->tokens->issue($user, $request);
        $web = $request->hasSession();
        if ($web) {
            $request->session()->regenerate();                       // no session fixation
            $request->session()->put(SessionBearer::KEY, $token);
        }
        return response()->json(['success' => true, 'data' => [
            'token' => $web ? null : $token,
            'token_type' => $web ? 'session' : 'Bearer',
            'user' => new UserResource($user),
            'must_change_password' => (bool) $user->must_change_password,
        ]]);
    }
}
