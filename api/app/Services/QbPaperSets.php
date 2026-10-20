<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{QbPaper, QbPaperVariant, QbQuestionOption};

// D126 (2), R2.1.5: qbank's subsets for SMS papers. Set 1 (A / ক) is the paper as built; every other set shuffles by qbank's
// strategy - "options" (each MCQ's options), "serial" (the questions inside each section) or "both" - with a seed fixed by the
// paper and the set (the QB.8 seed, so a set always prints the same), and never repeats an earlier set's order. D128: a paper
// grouped by subject shuffles only inside each subject block, and the frozen layout keeps each item's subject. No more sets
// than distinct orders exist (qbank's capacity check). On final, each set's order and its correct labels are frozen in
// qb_paper_variants, so a later edit of a question never changes a printed set.
class QbPaperSets
{
    public const MAX = 26;
    public const STRATEGIES = ['options', 'serial', 'both'];
    public const LATIN = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    public const BANGLA = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন', 'প', 'ফ', 'ব', 'ভ', 'ম', 'য'];
    private const LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'];

    /** @param array $sections the paper's sections: [['id' => .., 'items' => [['qb_question_id' => ..], ..]], ..] */
    public function layout(QbPaper $paper, array $sections, int $number, string $strategy, array $optionCounts): array
    {
        $plain = $this->arrange($paper, $sections, 1, 'both', $optionCounts, 0);
        if ($number === 1) return $plain;
        $seen = [json_encode($plain)];
        for ($k = 2; $k <= $number; $k++) {                          // walk the sets in order so set k never repeats an earlier one
            for ($attempt = 0; $attempt < 50; $attempt++) {
                $layout = $this->arrange($paper, $sections, $k, $strategy, $optionCounts, $attempt);
                if (!in_array(json_encode($layout), $seen, true)) break;
            }
            $seen[] = json_encode($layout);
        }
        return $layout;
    }

    /** how many distinct sets the paper allows for a strategy (qbank: options = Π n! over MCQs, serial = Π m! over sections) */
    public function capacity(array $sections, string $strategy, array $optionCounts): int
    {
        $fact = function (int $n) { $f = 1; for ($i = 2; $i <= $n; $i++) { $f *= $i; if ($f > 10000) return 10000; } return $f; };
        $total = 1;
        foreach ($sections as $s) {
            if ($strategy !== 'options') foreach (empty($s['grouped']) ? [$s['items']] : self::blocks($s['items']) as $block) $total = min(10000, $total * $fact(count($block)));   // D128: per subject block
            if ($strategy !== 'serial') foreach ($s['items'] as $it) $total = min(10000, $total * $fact($optionCounts[(int) $it['qb_question_id']] ?? 0));
        }
        return $total;
    }

    /** final: freeze `$count` sets; refuses more sets than the paper allows */
    public function freeze(QbPaper $paper, array $sections, int $count, string $strategy, string $names): void
    {
        $counts = $this->optionCounts($sections);
        $max = min(self::MAX, $this->capacity($sections, $strategy, $counts));
        if ($count > $max) throw new BusinessException("at most {$max} sets are possible with this strategy", 'qb_sets_capacity', 422, ['max' => $max]);
        $correct = QbQuestionOption::whereIn('qb_question_id', $this->ids($sections))->orderBy('sort_order')->orderBy('id')->get(['qb_question_id', 'is_correct'])
            ->groupBy('qb_question_id')->map(fn ($os) => $os->pluck('is_correct')->map(fn ($v) => (bool) $v)->all());
        QbPaperVariant::where('qb_paper_id', $paper->id)->delete();
        for ($n = 1; $n <= $count; $n++) {
            $layout = $this->layout($paper, $sections, $n, $strategy, $counts);
            foreach ($layout as &$s) foreach ($s['items'] as &$it) {
                $flags = $correct[$it['qb_question_id']] ?? [];
                $it['correct'] = array_values(array_filter(array_map(fn ($orig, $pos) => !empty($flags[$orig]) ? (self::LABELS[$pos] ?? (string) ($pos + 1)) : null, $it['options'], array_keys($it['options']))));
            }
            unset($s, $it);
            QbPaperVariant::create(['qb_paper_id' => $paper->id, 'variant_number' => $n, 'code' => ($names === 'bangla' ? self::BANGLA : self::LATIN)[$n - 1],
                'strategy' => $strategy, 'layout_json' => $layout]);
        }
    }

    /** D128: the consecutive runs of one subject inside a section (the section list is already in subject order) */
    public static function blocks(array $items): array
    {
        $blocks = [];
        foreach (array_values($items) as $it) {
            $last = array_key_last($blocks);
            if ($last !== null && $blocks[$last][0]['qb_subject_id'] === $it['qb_subject_id']) $blocks[$last][] = $it; else $blocks[] = [$it];
        }
        return $blocks;
    }

    public function optionCounts(array $sections): array
    {
        return QbQuestionOption::whereIn('qb_question_id', $this->ids($sections))->selectRaw('qb_question_id, count(*) as n')->groupBy('qb_question_id')
            ->pluck('n', 'qb_question_id')->map(fn ($n) => (int) $n)->all();
    }

    private function ids(array $sections): array
    {
        return array_values(array_unique(array_merge(...array_map(fn ($s) => array_map(fn ($it) => (int) $it['qb_question_id'], $s['items']), $sections ?: [['items' => []]]))));
    }

    /** one set's order; the QB.8 seed string (paper, set letter, section / question) so the old set B prints exactly as before */
    private function arrange(QbPaper $paper, array $sections, int $number, string $strategy, array $optionCounts, int $attempt): array
    {
        $set = self::LATIN[$number - 1];
        $shuffle = function (array $list, string $salt) use ($set, $paper, $attempt) {
            if ($set === 'A' || count($list) < 2) return $list;
            mt_srand(crc32("qb-paper:{$paper->id}:{$set}:{$salt}" . ($attempt ? ":{$attempt}" : '')));
            for ($i = count($list) - 1; $i > 0; $i--) { $j = mt_rand(0, $i); [$list[$i], $list[$j]] = [$list[$j], $list[$i]]; }
            mt_srand();
            return $list;
        };
        return array_map(function ($s) use ($shuffle, $strategy, $optionCounts) {
            $items = array_values($s['items']);
            if ($strategy !== 'options') {
                $items = empty($s['grouped']) ? $shuffle($items, "s{$s['id']}")
                    : array_merge(...array_map(fn ($block) => $shuffle($block, "s{$s['id']}:g{$block[0]['qb_subject_id']}"), self::blocks($items) ?: [[]]));   // D128
            }
            return ['section_id' => $s['id'], 'items' => array_map(function ($it) use ($shuffle, $strategy, $optionCounts) {
                $q = (int) $it['qb_question_id'];
                $order = range(0, max(0, ($optionCounts[$q] ?? 0) - 1));
                if (($optionCounts[$q] ?? 0) === 0) $order = [];
                if ($strategy !== 'serial') $order = $shuffle($order, "q{$q}");
                return ['qb_question_id' => $q, 'marks' => $it['marks'] ?? null, 'options' => $order] + (isset($it['qb_subject_id']) ? ['qb_subject_id' => (int) $it['qb_subject_id']] : []);
            }, $items)];
        }, $sections);
    }
}
