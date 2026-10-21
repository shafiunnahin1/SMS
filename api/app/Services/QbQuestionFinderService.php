<?php

namespace App\Services;

use App\Models\{QbChapter, QbQuestion, QbQuestionType, QbSubject, QbTopic};

// R2.1.2 / D114 (3): qbank's question finder. qbank sends the text to an outside "Question Matcher" service, which D114 (4) does not
// allow, so the match is computed here: the text is normalised (Bengali digits, maths marks, rich-text tags, qbank figure tokens
// and punctuation fall away) and scored 0-100 as 60% word overlap (Dice) + 40% character-trigram overlap (Jaccard). qbank's
// own decision rules stay: 80+ is high, 60+ medium; the top result is recommended only at 80+ and 15 points ahead of the next,
// otherwise the user picks by hand. Only published questions are searched, and no answer ever leaves this service.
class QbQuestionFinderService
{
    public const HIGH = 80.0;
    public const MEDIUM = 60.0;
    public const MARGIN = 15.0;
    public const MAX_CANDIDATES = 500;   // as qbank
    public const MAX_RESULTS = 5;

    public function search(string $text, array $filters): array
    {
        $query = self::normalize($text);
        $candidates = QbQuestion::query()->where('status', 'published')->whereNotNull('question_text')->where('question_text', '<>', '')
            ->when($filters['qb_subject_id'] ?? null, fn ($q, $v) => $q->where('qb_subject_id', $v))
            ->when($filters['qb_chapter_id'] ?? null, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->when($filters['qb_topic_id'] ?? null, fn ($q, $v) => $q->where('qb_topic_id', $v))
            ->when($filters['curriculum_node_id'] ?? null, fn ($q, $v) => $q->whereHas('curriculumNodes', fn ($nodes) => $nodes->where('qb_curriculum_nodes.id', $v)))
            ->when($filters['qb_question_type_id'] ?? null, fn ($q, $v) => $q->where('qb_question_type_id', $v))
            ->when($filters['qb_class_level_id'] ?? null, fn ($q, $v) => $q->whereHas('classLevels', fn ($c) => $c->where('qb_class_levels.id', $v)))
            // D74: a writer's question is language-neutral ('und'); a language filter keeps those and the imported ones of that language
            ->when($filters['language'] ?? null, fn ($q, $v) => $q->whereIn('language', [$v, 'und']))
            ->latest('id')->limit(self::MAX_CANDIDATES)->get(['id', 'qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'language', 'question_text']);

        $scored = $candidates->map(fn ($q) => ['q' => $q, 'score' => self::score($query, self::normalize((string) $q->question_text))])
            ->filter(fn ($r) => $r['score'] > 0)->sortByDesc('score')->take(self::MAX_RESULTS)->values();
        $names = fn ($model, $ids) => $model::whereIn('id', $ids->filter()->unique())->get(['id', 'name_bn', 'name_en'])->keyBy('id');
        $types = $names(QbQuestionType::class, $scored->pluck('q.qb_question_type_id'));
        $subjects = $names(QbSubject::class, $scored->pluck('q.qb_subject_id'));
        $chapters = $names(QbChapter::class, $scored->pluck('q.qb_chapter_id'));
        $topics = $names(QbTopic::class, $scored->pluck('q.qb_topic_id'));
        $label = fn ($set, $id) => ($m = $set->get($id)) ? ['id' => $m->id, 'name_bn' => $m->name_bn, 'name_en' => $m->name_en] : null;

        $results = $scored->map(fn ($r, $i) => ['rank' => $i + 1, 'question_id' => $r['q']->id, 'question_text' => $r['q']->question_text,
            'score' => $r['score'], 'confidence' => $r['score'] >= self::HIGH ? 'high' : ($r['score'] >= self::MEDIUM ? 'medium' : 'low'),
            'question_type' => $label($types, $r['q']->qb_question_type_id), 'subject' => $label($subjects, $r['q']->qb_subject_id),
            'chapter' => $label($chapters, $r['q']->qb_chapter_id), 'topic' => $label($topics, $r['q']->qb_topic_id), 'language' => $r['q']->language])->all();
        if ($results !== []) {
            $ids = collect($results)->pluck('question_id');
            $questions = QbQuestion::with(['curriculumNodes.version.subject', 'curriculumNodes.parent'])->whereIn('id', $ids)->get()->keyBy('id');
            $results = array_map(function ($row) use ($questions) {
                $row['curriculum_breadcrumbs'] = $questions->get($row['question_id'])->curriculumNodes->map(function ($node) {
                    $path = [];
                    for ($cursor = $node; $cursor && count($path) < 100;) {
                        $path[] = ['name_bn' => $cursor->name_bn, 'name_en' => $cursor->name_en, 'kind' => $cursor->kind];
                        $cursor = $cursor->parent_id ? \App\Models\QbCurriculumNode::find($cursor->parent_id) : null;
                    }
                    return ['subject_name_bn' => $node->version?->subject?->name_bn, 'subject_name_en' => $node->version?->subject?->name_en, 'path' => array_reverse($path)];
                })->values()->all();
                return $row;
            }, $results);
        }
        $top = (float) ($results[0]['score'] ?? 0);
        $margin = round(max(0, $top - (float) ($results[1]['score'] ?? 0)), 2);
        $decision = match (true) {
            $candidates->isEmpty() || $results === [] => 'no_match',
            $top >= self::HIGH && $margin >= self::MARGIN => 'recommended',
            $top < self::MEDIUM => 'low_confidence',
            default => 'manual_selection',
        };
        return ['status' => $candidates->isEmpty() ? 'no_candidates' : 'ok', 'query' => $text, 'candidate_count' => $candidates->count(), 'decision' => $decision,
            'recommended_question_id' => $decision === 'recommended' ? $results[0]['question_id'] : null, 'top_score' => round($top, 2), 'score_margin' => $margin, 'results' => $results];
    }

    public static function normalize(string $text): string
    {
        $t = preg_replace('/\[\[qmx-(?:graph|diagram):[A-Za-z0-9_-]+\]\]/', ' ', $text);
        $t = strip_tags(preg_replace('/<br\s*\/?>|<\/(?:div|p|li|td|th)>/i', ' ', $t));
        $t = html_entity_decode($t, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $t = strtr($t, ['০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9', '\\(' => ' ', '\\)' => ' ', '$' => ' ']);
        $t = mb_strtolower($t, 'UTF-8');
        $t = preg_replace('/[^\p{L}\p{M}\p{N}]+/u', ' ', $t);
        return trim(preg_replace('/\s+/u', ' ', $t));
    }

    /** 0-100: 60% word Dice + 40% character-trigram Jaccard */
    public static function score(string $a, string $b): float
    {
        if ($a === '' || $b === '') return 0.0;
        $wa = array_count_values(explode(' ', $a)); $wb = array_count_values(explode(' ', $b));
        $common = 0;
        foreach ($wa as $w => $n) $common += min($n, $wb[$w] ?? 0);
        $dice = 2 * $common / (array_sum($wa) + array_sum($wb));
        $grams = function (string $s): array {
            $chars = mb_str_split(" {$s} ");
            $out = [];
            for ($i = 0; $i < count($chars) - 2; $i++) $out[$chars[$i] . $chars[$i + 1] . $chars[$i + 2]] = true;
            return $out;
        };
        $ga = $grams($a); $gb = $grams($b);
        $inter = count(array_intersect_key($ga, $gb)); $union = count($ga + $gb);
        $jaccard = $union ? $inter / $union : 0;
        return round(100 * (0.6 * $dice + 0.4 * $jaccard), 2);
    }
}
