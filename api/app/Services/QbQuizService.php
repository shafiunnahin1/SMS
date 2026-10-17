<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbQuestion, QbQuiz, QbQuizAttempt, QbQuizQuestion, QbStudentPackageAccess, User};
use App\Support\Money;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

// QB.10 (D66, docs/modules/question-bank.md §3ছ): who may take a quiz, the attempt's questions, and marking on the server.
// An attempt keeps in `answers` JSON: q (the question ids, fixed at the start), given (the student's answers so far) and, once
// submitted, marks (per question). The deadline is started_at + duration; an answer sent after it (plus a short grace for the
// network) is ignored and the attempt is marked with what was saved - the same as qb:close-quiz-attempts does by itself.
class QbQuizService
{
    public const GRACE_SECONDS = 30;

    /** Is the quiz open now (active, inside its window)? */
    public function open(QbQuiz $quiz): bool
    {
        return $quiz->is_active && (!$quiz->opens_at || $quiz->opens_at <= now()) && (!$quiz->closes_at || $quiz->closes_at > now());
    }

    /** The access row that lets this student take a package quiz now, or null */
    public function access(User $student, QbQuiz $quiz): ?QbStudentPackageAccess
    {
        return $quiz->qb_quiz_package_id === null ? null : QbStudentPackageAccess::where('student_user_id', $student->id)
            ->where('qb_quiz_package_id', $quiz->qb_quiz_package_id)->where('starts_at', '<=', now())->where('expires_at', '>', now())
            ->orderByDesc('expires_at')->first();
    }

    public function mayTake(User $student, QbQuiz $quiz): bool
    {
        return in_array($quiz->access, ['free', 'public'], true) || $this->access($student, $quiz) !== null;
    }

    /** The question ids for a new attempt: the fixed list, or a random draw from the scope */
    public function draw(QbQuiz $quiz): array
    {
        if ($quiz->rule === 'fixed') return QbQuizQuestion::where('qb_quiz_id', $quiz->id)->orderBy('sort_order')->pluck('qb_question_id')->map(fn ($v) => (int) $v)->all();
        $pool = QbQuestion::where('status', 'published')
            ->when($quiz->qb_topic_id, fn ($q, $v) => $q->where('qb_topic_id', $v))
            ->when($quiz->qb_chapter_id, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->when($quiz->qb_subject_id, fn ($q, $v) => $q->where('qb_subject_id', $v))
            ->whereHas('type', fn ($t) => $t->whereIn('family', QbQuizMarker::FAMILIES))
            ->inRandomOrder()->limit(max(1, $quiz->question_count) * 3)->get()
            ->filter(fn ($q) => QbQuizMarker::markable($q))->take($quiz->question_count);
        return $pool->pluck('id')->map(fn ($v) => (int) $v)->values()->all();
    }

    /** The questions as the student sees them during a quiz - never an answer (the locked public shape) */
    public function paper(array $ids): array
    {
        $rows = QbQuestion::whereIn('id', $ids)->get()->keyBy('id');
        return collect($ids)->filter(fn ($id) => $rows->has($id))->map(fn ($id) => QbQuestionPublicResource::make($rows[$id], false))->values()->all();
    }

    public function deadline(QbQuizAttempt $a, QbQuiz $quiz): \Illuminate\Support\Carbon
    {
        return $a->started_at->copy()->addMinutes($quiz->duration_minutes);
    }

    /** Marks `given` against the questions: [score, total (both "0.00" strings), per-question marks] */
    public function markAll(array $ids, array $given): array
    {
        $rows = QbQuestion::whereIn('id', $ids)->get()->keyBy('id');
        [$score, $total, $marks] = [0, 0, []];
        foreach ($ids as $id) {
            if (!$rows->has($id)) continue;
            $m = QbQuizMarker::mark($rows[$id], $given[(string) $id] ?? null);
            $score += $m['score'];
            $total += $m['total'];
            $marks[(string) $id] = ['score' => Money::format($m['score']), 'total' => Money::format($m['total']), 'correct' => $m['correct']];
        }
        return [Money::format($score), Money::format($total), $marks];
    }

    /** Submits (once): marks what was saved, plus `given` when it came in time. Safe to call twice - the second call changes nothing. */
    public function submit(QbQuizAttempt $attempt, ?array $given = null): QbQuizAttempt
    {
        return DB::transaction(function () use ($attempt, $given) {
            $a = QbQuizAttempt::whereKey($attempt->id)->lockForUpdate()->firstOrFail();
            if ($a->submitted_at) return $a;
            $quiz = QbQuiz::findOrFail($a->qb_quiz_id);
            $data = $a->answers ?? [];
            $inTime = now() <= $this->deadline($a, $quiz)->addSeconds(self::GRACE_SECONDS);
            if ($given !== null && $inTime) $data['given'] = $this->clean($given, $data['q'] ?? []);
            [$score, $total, $marks] = $this->markAll($data['q'] ?? [], $data['given'] ?? []);
            $a->update(['answers' => $data + ['marks' => $marks], 'score' => $score, 'total' => $total,
                'submitted_at' => $inTime ? now() : $this->deadline($a, $quiz)]);
            return $a->fresh();
        });
    }

    /** Only answers to this attempt's own questions; each a short string or a short list of strings */
    public function clean(array $given, array $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $v = $given[(string) $id] ?? $given[$id] ?? null;
            if (is_string($v) || is_int($v)) $out[(string) $id] = mb_substr((string) $v, 0, 500);
            elseif (is_array($v)) $out[(string) $id] = array_map(fn ($x) => is_scalar($x) ? mb_substr((string) $x, 0, 500) : '', array_slice(array_values($v), 0, 50));
        }
        return $out;
    }

    /** The result: score, and per question the student's answer, the right answer and the explanation (after submission only) */
    public function result(QbQuizAttempt $a, QbQuiz $quiz): array
    {
        $data = $a->answers ?? [];
        $base = ['id' => $a->id, 'qb_quiz_id' => $a->qb_quiz_id, 'title' => $quiz->title, 'started_at' => $a->started_at?->toIso8601String(),
            'submitted_at' => $a->submitted_at?->toIso8601String(), 'score' => $a->score, 'total' => $a->total, 'pass_mark' => $quiz->pass_mark,
            'passed' => $a->submitted_at && $quiz->pass_mark !== null ? Money::toPaisa((string) $a->score) >= Money::toPaisa((string) $quiz->pass_mark) : null];
        if (!$a->submitted_at) return $base + ['deadline' => $this->deadline($a, $quiz)->toIso8601String(), 'questions' => $this->paper($data['q'] ?? []),
            'given' => (object) ($data['given'] ?? [])];
        return $base + ['review' => $this->review($data['q'] ?? [], $data['given'] ?? [], $data['marks'] ?? [])];
    }

    /** After submission: each question with the right answer (the public shape, unlocked) and what the student gave */
    public function review(array $ids, array $given, array $marks): array
    {
        $rows = QbQuestion::whereIn('id', $ids)->get()->keyBy('id');
        return collect($ids)->filter(fn ($id) => $rows->has($id))->map(fn ($id) => ['question' => QbQuestionPublicResource::make($rows[$id], true),
            'given' => $given[(string) $id] ?? null, 'right' => QbQuizMarker::rightAnswer($rows[$id]), 'mark' => $marks[(string) $id] ?? null])->values()->all();
    }

    /** Closes every attempt past its deadline (+ grace) with what was saved; returns how many */
    public function closeOverdue(Collection $attempts): int
    {
        $n = 0;
        foreach ($attempts as $a) {
            $quiz = QbQuiz::find($a->qb_quiz_id);
            if ($quiz && now() > $this->deadline($a, $quiz)->addSeconds(self::GRACE_SECONDS)) { $this->submit($a); $n++; }
        }
        return $n;
    }

    public function notOpen(): BusinessException
    {
        return new BusinessException('this quiz is not open', 'qb_quiz_closed', 422);
    }
}
