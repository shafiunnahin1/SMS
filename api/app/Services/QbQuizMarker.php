<?php

namespace App\Services;

use App\Models\QbQuestion;
use App\Support\Money;

// QB.10 (D66, docs/modules/question-bank.md §3ছ "উত্তর-মিলানো server-এ"): marks a quiz answer on the server. Only the auto-marked
// families go into a quiz - mcq, true_false (the chosen option label), fill_gap (one text, or one text per gap item) and matching
// (the right side chosen for each pair). A question is worth its own marks (1 when none is set); gaps and pairs earn their share.
// This class reads the answers (allowlisted in QuestionAnswerNeverLeaksTest): what it returns to a student is only the score, and
// the right answers only after the attempt is submitted.
final class QbQuizMarker
{
    public const FAMILIES = ['mcq', 'true_false', 'fill_gap', 'matching'];

    /** Can this question go into a quiz? */
    public static function markable(QbQuestion $q): bool
    {
        $family = $q->type?->family;
        if (!in_array($family, self::FAMILIES, true)) return false;
        $items = $q->items()->get();
        return match ($family) {
            'matching' => $items->isNotEmpty() && $items->every(fn ($i) => $i->item_type === 'match_pair'),
            'fill_gap' => $items->every(fn ($i) => $i->item_type === 'gap'),
            default => true,
        };
    }

    /** The question's worth in paisa */
    public static function worth(QbQuestion $q): int
    {
        $m = Money::toPaisa((string) ($q->marks ?? '0'));
        return $m > 0 ? $m : 100;
    }

    /** ['score' => paisa earned, 'total' => paisa, 'correct' => bool (every part right)] for one given answer (string or list) */
    public static function mark(QbQuestion $q, mixed $given): array
    {
        $worth = self::worth($q);
        $family = $q->type?->family;
        $items = $q->items()->get();
        if ($family === 'mcq' || $family === 'true_false') {
            $right = $q->options()->get()->where('is_correct', true)->pluck('label')->map(fn ($l) => (string) $l)->sort()->values()->all();
            $chosen = collect(is_array($given) ? $given : [$given])->filter(fn ($v) => is_string($v) || is_int($v))->map(fn ($v) => (string) $v)->unique()->sort()->values()->all();
            $ok = $right !== [] && $chosen === $right;
            return ['score' => $ok ? $worth : 0, 'total' => $worth, 'correct' => $ok];
        }
        if ($family === 'fill_gap' && $items->isEmpty()) {
            $ok = is_string($given) && self::norm($given) !== '' && self::norm($given) === self::norm((string) $q->answer_text);
            return ['score' => $ok ? $worth : 0, 'total' => $worth, 'correct' => $ok];
        }
        // gaps and pairs: a list in item order; each part earns its share
        $list = is_array($given) ? array_values($given) : [];
        $hits = 0;
        foreach ($items->values() as $i => $it) {
            $g = $list[$i] ?? null;
            if (!is_string($g) || self::norm($g) === '') continue;
            $accepted = $it->item_type === 'gap' ? (array) ($it->answer_json['answers'] ?? []) : [(string) ($it->answer_json['right'] ?? '')];
            if (collect($accepted)->filter(fn ($a) => is_string($a))->map(fn ($a) => self::norm($a))->contains(self::norm($g))) $hits++;
        }
        $n = max(1, $items->count());
        return ['score' => intdiv($worth * $hits * 2 + $n, 2 * $n), 'total' => $worth, 'correct' => $hits === $items->count() && $items->isNotEmpty()];   // half up
    }

    /** The right answer, shown only after submission */
    public static function rightAnswer(QbQuestion $q): mixed
    {
        $items = $q->items()->get();
        return match (true) {
            in_array($q->type?->family, ['mcq', 'true_false'], true) => $q->options()->get()->where('is_correct', true)->pluck('label')->values()->all(),
            $items->isEmpty() => $q->answer_text,
            default => $items->map(fn ($it) => $it->item_type === 'gap' ? ($it->answer_json['answers'][0] ?? null) : ($it->answer_json['right'] ?? null))->values()->all(),
        };
    }

    private static function norm(string $s): string
    {
        return mb_strtolower(preg_replace('/\s+/u', ' ', trim($s)));
    }
}
