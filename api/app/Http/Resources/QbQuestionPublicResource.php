<?php

namespace App\Http\Resources;

use App\Http\Controllers\QuestionBank\QbMediaController;
use App\Models\QbQuestion;

// D65 (docs/modules/question-bank.md §2 "উত্তর কখনো ফাঁস নয়"): the ONE shape in which a question leaves the writers' panel - for an
// institution's teachers (QB.7) and for students (QB.9). Without an unlock (or a free item) it carries the question, the option
// texts and the creative parts' questions, never: the answer, the explanation, which option is right, a part's answer.
// QuestionAnswerNeverLeaksTest checks the shape and that every other caller of the question models goes through here.
final class QbQuestionPublicResource
{
    public static function make(QbQuestion $q, bool $unlocked): array
    {
        $out = $q->only(['id', 'qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode',
            'question_json', 'question_text']) + [
            'unlocked' => $unlocked,
            'options' => $q->options()->get()->map(fn ($o) => ['label' => $o->label, 'content_text' => $o->content_text, 'content_json' => $o->content_json]
                + ($unlocked ? ['is_correct' => (bool) $o->is_correct] : []))->all(),
            'creative_parts' => $q->creativeParts()->get()->map(fn ($p) => $p->only(['part_label', 'cognitive_level', 'marks', 'question_text', 'question_json'])
                + ($unlocked ? $p->only(['answer_text', 'answer_json']) : []))->all(),
            'media' => $q->media()->get()->map(fn ($m) => QbMediaController::view($m))->all(),
        ];
        return $unlocked ? $out + $q->only(['answer_text', 'answer_json', 'explanation_text', 'explanation_json']) : $out;
    }
}
