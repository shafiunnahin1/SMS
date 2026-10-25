<?php

namespace App\Services\Learner;

use App\Exceptions\BusinessException;
use App\Models\{Institution, QbStudentScopeAccess, QbStudentUnlock, User};
use App\Services\Auth\OtpService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\{Cache, DB};

/**
 * D165 (owner answer, ST.5): an institution's student keeps what they bought after leaving by moving it to their own account on the
 * learners host. They prove their own mobile with a code; that mobile's learners account is used (or created with the given
 * password). Every purchase still valid is copied there with the same expiry and exam batch, at price 0 (paid once, in the
 * institution's records, which stay untouched - D32); no writer share again. Practice history stays where it was made.
 */
class StudentMoveService
{
    public const OTP = 'move';

    public function __construct(private OtpService $otp, private LearnerRegistrationService $registration) {}

    /** step 1: a code to the student's own mobile; @return array{phone: string} masked */
    public function start(User $student, string $phone, ?string $password): array
    {
        $phone = (string) User::normalisePhone($phone);
        $learners = LearnerRegistrationService::institution();
        $target = Tenancy::as($learners, fn () => User::inTenant()->where('phone', $phone)->first());
        if (!$target || !$target->is_active) {
            if (!$password) throw new BusinessException(__('errors.learner_move_password'), 'learner_move_password', 422);
            $id = $this->registration->register(['name' => $student->name, 'phone' => $phone, 'password' => $password, 'qb_class_level_id' => null])['id'];
        } else {
            $id = $target->id;
            Tenancy::as($learners, function () use ($target, $phone) {
                [, $code] = $this->otp->issue($target, self::OTP);
                $this->otp->sms($phone, "আপনার কেনা জিনিস সরানোর কোড: {$code} (" . config('auth_policy.otp.minutes') . ' মিনিট)');
            });
        }
        Cache::put(self::key($student), ['learner_id' => $id, 'new' => !$target || !$target->is_active], now()->addMinutes((int) config('auth_policy.otp.minutes', 10) + 5));
        return ['phone' => substr($phone, 0, 3) . '******' . substr($phone, -2)];
    }

    /** step 2: the right code activates (or confirms) the learners account and copies the valid purchases; @return counts and the login host */
    public function verify(User $student, string $code): array
    {
        $pending = Cache::get(self::key($student)) ?? throw new BusinessException(__('errors.learner_not_pending'), 'learner_not_pending', 404);
        $learners = LearnerRegistrationService::institution();
        if ($pending['new']) {
            $this->registration->verify((int) $pending['learner_id'], $code);
        } else {
            Tenancy::as($learners, function () use ($pending, $code) {
                $target = User::inTenant()->findOrFail($pending['learner_id']);
                if (!$this->otp->consume($target, self::OTP, $code)) throw new BusinessException(__('errors.invalid_otp'), 'invalid_otp', 422);
            });
        }
        Cache::forget(self::key($student));
        $unlocks = QbStudentUnlock::active()->where('student_user_id', $student->id)->get();
        $packs = QbStudentScopeAccess::active()->where('student_user_id', $student->id)->get();
        $moved = Tenancy::as($learners, fn () => DB::transaction(function () use ($pending, $unlocks, $packs) {
            $to = (int) $pending['learner_id'];
            $n = 0;
            foreach ($unlocks as $u) {
                if (QbStudentUnlock::active()->where('student_user_id', $to)->where('item_type', $u->item_type)->where('item_id', $u->item_id)->exists()) continue;
                QbStudentUnlock::create(['student_user_id' => $to, 'item_type' => $u->item_type, 'item_id' => $u->item_id, 'price' => '0.00', 'reason' => 'free',
                    'expires_at' => $u->expires_at, 'qb_exam_batch_id' => $u->qb_exam_batch_id]);
                $n++;
            }
            foreach ($packs as $p) {
                $key = array_filter($p->only(['qb_class_level_id', 'qb_subject_id', 'qb_chapter_id']), fn ($v) => $v !== null);
                if (QbStudentScopeAccess::active()->where('student_user_id', $to)->where('scope', $p->scope)->where($key)->exists()) continue;
                QbStudentScopeAccess::create(['student_user_id' => $to, 'scope' => $p->scope, 'price' => '0.00', 'starts_at' => now(), 'expires_at' => $p->expires_at,
                    'qb_exam_batch_id' => $p->qb_exam_batch_id] + $key);
                $n++;
            }
            return $n;
        }));
        return ['moved' => $moved, 'login_host' => LearnerRegistrationService::host()];
    }

    private static function key(User $student): string
    {
        return 'learner_move:' . Tenancy::current()?->id . ':' . $student->id;
    }
}
