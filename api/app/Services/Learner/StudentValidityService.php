<?php

namespace App\Services\Learner;

use App\Models\{LearnerProfile, Program, QbClassLevel, QbExamBatch, Student, User};
use Illuminate\Support\Carbon;

/**
 * D165 (3) ST.2: how long a student's purchase lasts, fixed by the server at purchase and shown before payment.
 *  - a class an active SSC/HSC batch covers, with that batch chosen: until the end of its exam end day (Asia/Dhaka) - the date
 *    may move later and every such purchase moves with it (QbExamBatchController);
 *  - a primary or secondary class no batch covers (class 1-8): until 31 December of the purchase year, 23:59:59 Asia/Dhaka;
 *  - anything else (a batch class without a batch, no class, admission / other levels): 12 months from now.
 * The class is the self-registered student's profile, or the platform class of an institution student's program.
 */
class StudentValidityService
{
    public const TZ = 'Asia/Dhaka';

    /** @return array{expires_at: Carbon, rule: string, qb_exam_batch_id: ?int} */
    public function forUser(User $user, ?Carbon $at = null): array
    {
        $at ??= now();
        $profile = LearnerProfile::where('user_id', $user->id)->first();
        $classId = $profile?->qb_class_level_id ?? $this->programClass($user);
        $batch = $profile?->qb_exam_batch_id ? QbExamBatch::where('is_active', true)->find($profile->qb_exam_batch_id) : null;
        if ($batch && $classId && in_array($classId, array_map('intval', $batch->class_level_ids ?? []), true)) {
            $end = Carbon::parse($batch->exam_ends_on->toDateString(), self::TZ)->endOfDay()->utc();
            if ($end->gt($at)) return ['expires_at' => $end, 'rule' => 'exam_batch', 'qb_exam_batch_id' => $batch->id];
        }
        $class = $classId ? QbClassLevel::find($classId) : null;
        if ($class && in_array($class->education_level, ['primary', 'secondary'], true) && !$this->batchCovers($class->id)) {
            return ['expires_at' => $at->copy()->setTimezone(self::TZ)->endOfYear()->utc(), 'rule' => 'year_end', 'qb_exam_batch_id' => null];
        }
        return ['expires_at' => $at->copy()->addMonths(12), 'rule' => 'twelve_months', 'qb_exam_batch_id' => null];
    }

    /** the active batches a class may choose (exam not over yet) */
    public static function batchesFor(?int $classId)
    {
        if (!$classId) return collect();
        return QbExamBatch::where('is_active', true)->whereDate('exam_ends_on', '>=', today(self::TZ)->toDateString())->orderBy('exam_ends_on')->get()
            ->filter(fn ($b) => in_array($classId, array_map('intval', $b->class_level_ids ?? []), true))->values();
    }

    private function batchCovers(int $classId): bool
    {
        return QbExamBatch::where('is_active', true)->get(['class_level_ids'])->contains(fn ($b) => in_array($classId, array_map('intval', $b->class_level_ids ?? []), true));
    }

    private function programClass(User $user): ?int
    {
        $programId = Student::where('user_id', $user->id)->value('program_id');
        return $programId ? Program::whereKey($programId)->value('qb_class_level_id') : null;
    }
}
