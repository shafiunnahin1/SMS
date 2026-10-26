<?php

namespace App\Services\Ai;

use App\Services\QbQuestionFinderService;

/**
 * D166 (2) AI-Q1: how well a candidate answers a question - exact, close or weak - so the assistant shows only real matches and
 * says "not found" otherwise. Works on normalized text (QbQuestionFinderService::normalize):
 *  - terms: the query's content words (question words such as কী / কত / what dropped), compared with a light prefix rule so a
 *    Bangla word with a case ending (ত্বরণের) still meets its stem (ত্বরণ);
 *  - coverage: the share of the query's terms the candidate's own text (question / title) contains;
 *  - numbers: every number in the query must appear in the candidate (৪ ও ৬ never matches ৮ ও ১২);
 *  - exact: the same text, or a finder score of 85+; close: most terms covered with a fair score; anything else is weak.
 * Deterministic: no model, no randomness.
 */
final class RelevanceService
{
    public const EXACT = 'exact';
    public const CLOSE = 'close';
    public const WEAK = 'weak';

    private const STOP = ['কী', 'কি', 'কত', 'কে', 'কাকে', 'কোন', 'কোনটি', 'কয়টি', 'কেন', 'কোথায়', 'কীভাবে', 'কিভাবে', 'বলে', 'বলা', 'হয়', 'হয়', 'হলে', 'হবে', 'এর', 'এবং',
        'ও', 'যদি', 'তবে', 'একটি', 'এক', 'থেকে', 'জন্য', 'সাথে', 'সঙ্গে', 'করে', 'করা', 'নিচের', 'নিম্নের', 'উপরের', 'লেখ', 'লিখ', 'দাও', 'বের', 'নির্ণয়', 'ব্যাখ্যা',
        'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where', 'is', 'are', 'was', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'by',
        'with', 'do', 'does', 'find', 'write', 'explain', 'called'];

    /** the content words of a normalized text (2+ letters, or a number), in order, once each */
    public static function terms(string $norm): array
    {
        $out = [];
        foreach (explode(' ', $norm) as $w) {
            if ($w === '' || in_array($w, self::STOP, true)) continue;
            if (!is_numeric($w) && mb_strlen($w) < 2) continue;
            $out[$w] = true;
        }
        return array_keys($out);
    }

    public static function numbers(string $norm): array
    {
        preg_match_all('/\d+(?:\.\d+)?/', $norm, $m);
        return array_values(array_unique($m[0]));
    }

    /** a term meets a candidate word: the same, or one starts with the other when both are 3+ letters (Bangla case endings) */
    private static function meets(string $term, array $words): bool
    {
        if (isset($words[$term])) return true;
        if (is_numeric($term) || mb_strlen($term) < 3) return false;
        foreach ($words as $w => $_) {
            if (mb_strlen($w) >= 3 && (str_starts_with($w, $term) || str_starts_with($term, $w))) return true;
        }
        return false;
    }

    /** the share (0..1) of the query's terms the candidate text has */
    public static function coverage(array $queryTerms, string $candidateNorm): float
    {
        if (!$queryTerms) return 0.0;
        $words = array_flip(array_filter(explode(' ', $candidateNorm)));
        $hit = 0;
        foreach ($queryTerms as $t) if (self::meets($t, $words)) $hit++;
        return $hit / count($queryTerms);
    }

    /**
     * @param string $query     normalized question of the user
     * @param string $main      normalized main text of the candidate (the question text, a title)
     * @param string $extra     normalized supporting text (options, explanation, creative parts) - only for the numbers check
     * @return array{class: string, score: float, coverage: float}
     */
    public static function classify(string $query, string $main, string $extra = ''): array
    {
        $score = QbQuestionFinderService::score($query, $main);
        $all = trim($main . ' ' . $extra);
        $coverage = self::coverage(self::terms($query), $main);            // the question itself must carry the words: an option
                                                                           // naming a term (বেগ) is not what the question asks
        $nums = self::numbers($query);
        $numbersOk = !$nums || !array_diff($nums, self::numbers($all));
        $class = !$numbersOk || $coverage === 0.0 ? self::WEAK
            : (($query === $main || $score >= 85) ? self::EXACT
            : (($coverage >= 0.75 && $score >= 30) || ($coverage >= 0.6 && $score >= 50) ? self::CLOSE : self::WEAK));
        return ['class' => $class, 'score' => $score, 'coverage' => round($coverage, 3)];
    }

    /** a curriculum chapter / topic name is relevant when most of ITS words are in the question (a name is short) */
    public static function nameRelevant(string $query, string $nameNorm): bool
    {
        $nameTerms = self::terms($nameNorm);
        return $nameTerms && self::coverage($nameTerms, $query) >= 0.5;
    }

    /** graph / diagram / media tokens (and any encoded payload in them) never reach the answer text - AI-Q2 renders them safely */
    public static function withoutTokens(string $text, string $placeholder): string
    {
        return trim(preg_replace('/\[\[qmx-[a-z]+:[^\]]*\]\]/i', $placeholder, $text) ?? '');
    }
}
