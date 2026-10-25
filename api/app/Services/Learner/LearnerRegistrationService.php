<?php

namespace App\Services\Learner;

use App\Exceptions\BusinessException;
use App\Models\{Institution, LearnerProfile, OtpToken, User};
use App\Services\Auth\OtpService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

/**
 * D165 (1) ST.1: a student registers on the central host with a name, their own mobile and a password; the account sits in the
 * one platform institution of type `learners` (learn.<base domain>) and stays inactive until the code sent to that mobile is
 * entered. No guardian consent, no age. A number that already has an active account is refused; a pending one is replaced by the
 * newer attempt (new name, password, class and code).
 */
class LearnerRegistrationService
{
    public const OTP = 'signup';

    public function __construct(private OtpService $otp) {}

    /** the platform institution of self-registered students, created the first time anyone registers */
    public static function institution(): Institution
    {
        $slug = (string) config('tenancy.learners_slug', 'learn');
        $i = Institution::where('slug', $slug)->first();
        if ($i && $i->institution_type !== 'learners') throw new \RuntimeException("slug {$slug} belongs to another institution");
        return $i ?? Institution::create(['name' => 'Learners', 'slug' => $slug, 'institution_type' => 'learners', 'status' => 'active']);
    }

    public static function host(): string
    {
        return config('tenancy.learners_slug', 'learn') . '.' . config('tenancy.base_domain');
    }

    /** @return array{id:int, phone:string} the pending account and the masked number the code went to */
    public function register(array $in): array
    {
        $phone = User::normalisePhone($in['phone']);
        return Tenancy::as(self::institution(), function () use ($in, $phone) {
            [$user, $code] = DB::transaction(function () use ($in, $phone) {
                $user = User::inTenant()->where('phone', $phone)->first();
                if ($user && $user->is_active) throw new BusinessException(__('errors.learner_phone_taken'), 'learner_phone_taken', 422);
                $fields = ['name' => $in['name'], 'password' => $in['password'], 'role' => 'student', 'is_active' => false];
                $user ? $user->forceFill($fields)->save() : $user = User::create($fields + ['phone' => $phone, 'institution_id' => Tenancy::current()->id]);
                LearnerProfile::updateOrCreate(['user_id' => $user->id], ['qb_class_level_id' => $in['qb_class_level_id'] ?? null]);
                [, $code] = $this->otp->issue($user, self::OTP);
                return [$user, $code];
            });
            $this->otp->sms($phone, "আপনার নিবন্ধন কোড: {$code} (" . config('auth_policy.otp.minutes') . ' মিনিট)');
            return ['id' => $user->id, 'phone' => substr($phone, 0, 3) . '******' . substr($phone, -2)];
        });
    }

    /** the right code switches the account on; a wrong one counts against that code (five wrong ones void it) */
    public function verify(int $id, string $code): array
    {
        return Tenancy::as(self::institution(), function () use ($id, $code) {
            $user = $this->pending($id);
            if (!$this->otp->consume($user, self::OTP, $code)) {
                $this->otp->wrongAttempt($user, (int) OtpToken::where('user_id', $user->id)->whereNull('used_at')->latest('id')->value('id'));
                throw new BusinessException(__('errors.invalid_otp'), 'invalid_otp', 422);
            }
            $user->forceFill(['is_active' => true])->save();
            return ['login_host' => self::host(), 'login' => $user->phone];
        });
    }

    public function resend(int $id): void
    {
        Tenancy::as(self::institution(), function () use ($id) {
            $user = $this->pending($id);
            [, $code] = $this->otp->issue($user, self::OTP);
            $this->otp->sms((string) $user->phone, "আপনার নিবন্ধন কোড: {$code} (" . config('auth_policy.otp.minutes') . ' মিনিট)');
        });
    }

    private function pending(int $id): User
    {
        $user = User::inTenant()->whereKey($id)->where('role', 'student')->where('is_active', false)->first();
        if (!$user) throw new BusinessException(__('errors.learner_not_pending'), 'learner_not_pending', 404);
        return $user;
    }
}
